import type {Socket} from 'socket.io-client';
import type {Contacts, Message, ReadReceipt} from './contracts.ts';
import {messageOf, transient} from './sessionCore.ts';
export interface ChatError { message: string; status?: number; retryAfter?: number; }
export interface ServerEvents {
  receive_message: (message: Message) => void;
  messages_read: (receipt: ReadReceipt) => void;
  chat_error: (error: ChatError) => void;
  rate_limit_error: (error: ChatError) => void;
}
export interface ClientEvents { join_room: (room: string) => void; leave_room: (room: string) => void; }
export type ChatSocket = Socket<ServerEvents, ClientEvents>;
export interface ChatState {
  contacts: Contacts; unread: number; messages: Message[]; teacher: number | null;
  connected: boolean; error: string; loading: boolean;
}
export type Request = <T>(path: string, method?: string, data?: unknown) => Promise<T>;
export const conversation = (teacher: number, parent: number) => ({teacher_id: teacher, parent_id: parent});
export const historyPath = (teacher: number, parent: number) => `/api/messages/history?teacher_id=${teacher}&parent_id=${parent}`;
export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const map = new Map(current.map(message => [message.message_id, message]));
  for (const message of incoming) {
    const previous = map.get(message.message_id);
    map.set(message.message_id, {...message, is_read: message.is_read || previous?.is_read === true});
  }
  return [...map.values()].filter(message => !message.is_archived).sort((a, b) =>
    Date.parse(a.created_at) - Date.parse(b.created_at) || a.message_id - b.message_id);
}
export class MessagingClient {
  private state: ChatState = {contacts: {myId: null, contacts: []}, unread: 0, messages: [], teacher: null, connected: false, error: '', loading: false};
  private listeners = new Set<() => void>();
  private socket: ChatSocket | null = null;
  private token = '';
  private generation = 0;
  private refreshVersion = 0;
  private historyVersion = 0;
  private viewing = false;
  private reading = false;
  private readAgain = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(private request: Request, private makeSocket: (token: string) => ChatSocket) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {this.listeners.add(fn); return () => {this.listeners.delete(fn);};};
  private publish(value: Partial<ChatState>) {this.state = {...this.state, ...value}; this.listeners.forEach(fn => fn());}
  private room() {return this.state.teacher && this.state.contacts.myId ? `teacher-${this.state.teacher}-parent-${this.state.contacts.myId}` : null;}
  private join() {const room = this.room(); if (this.viewing && room && this.socket?.connected) this.socket.emit('join_room', room);}
  setViewing(value: boolean) {
    if (value === this.viewing) return;
    if (!value) {const room = this.room(); if (room) this.socket?.emit('leave_room', room);}
    this.viewing = value;
    if (value) {this.join(); void this.recover();}
  }
  authenticate(token: string) {
    if (token === this.token) return;
    this.generation++; this.refreshVersion++; this.historyVersion++;
    clearTimeout(this.reconnectTimer); this.socket?.removeAllListeners(); this.socket?.disconnect(); this.socket = null;
    this.token = token;
    this.publish({connected: false});
    if (!token) {this.publish({contacts: {myId: null, contacts: []}, messages: [], unread: 0, teacher: null}); return;}
    const socket = this.socket = this.makeSocket(token);
    const generation = this.generation;
    const live = () => generation === this.generation;
    socket.on('connect', () => {if (live()) {this.publish({connected: true, error: ''}); this.join(); void this.recover();}});
    socket.on('disconnect', () => {if (live()) this.publish({connected: false});});
    socket.on('connect_error', error => {if (live()) this.publish({connected: false, error: `Live messaging unavailable: ${error.message}. Refresh to check messages.`});});
    socket.on('receive_message', message => {
      if (!live() || message.parent_id !== this.state.contacts.myId) return;
      if (message.teacher_id === this.state.teacher) {
        this.publish({messages: mergeMessages(this.state.messages, [message])});
        if (message.sender_role === 'teacher' && this.viewing) void this.markRead();
      }
      void this.refresh();
    });
    socket.on('messages_read', receipt => {
      if (!live()) return;
      if (receipt.teacher_id === this.state.teacher && receipt.parent_id === this.state.contacts.myId) {
        const ids = new Set(receipt.message_ids);
        this.publish({messages: this.state.messages.map(m => ids.has(m.message_id) && m.sender_role !== receipt.reader_role ? {...m, is_read: true} : m)});
      }
      void this.refresh();
    });
    socket.on('chat_error', error => {if (live()) this.publish({error: error.message});});
    socket.on('rate_limit_error', error => {
      if (!live()) return;
      socket.disconnect(); this.publish({connected: false, error: error.message});
      this.reconnectTimer = setTimeout(() => {if (live()) socket.connect();}, Math.max(30000, (error.retryAfter || 0) * 1000));
    });
    socket.connect(); void this.recover();
  }
  async refresh() {
    const generation = this.generation, version = ++this.refreshVersion;
    if (!this.token) return;
    try {
      const [contacts, unread] = await Promise.all([this.request<Contacts>('/api/messages/contacts'), this.request<{unreadCount: number}>('/api/messages/unread-count')]);
      if (generation !== this.generation || version !== this.refreshVersion) return;
      const teacher = contacts.contacts.some(c => c.id === this.state.teacher) ? this.state.teacher : null;
      const changedParent = contacts.myId !== this.state.contacts.myId;
      if (changedParent || teacher === null) {this.historyVersion++; this.publish({messages: [], teacher: null});}
      this.publish({contacts, unread: unread.unreadCount});
    } catch (error) {
      if (generation !== this.generation || version !== this.refreshVersion) return;
      if (!transient(error)) {this.historyVersion++; this.publish({contacts: {myId: null, contacts: []}, messages: [], teacher: null, unread: 0});}
      this.publish({error: messageOf(error)});
    }
  }
  async recover() {await this.refresh(); await this.loadHistory();}
  async open(teacher: number) {
    if (!this.state.contacts.myId || !this.state.contacts.contacts.some(c => c.id === teacher)) return;
    const room = this.room(); if (room) this.socket?.emit('leave_room', room);
    this.historyVersion++; this.publish({teacher, messages: [], error: ''}); this.join(); await this.loadHistory();
  }
  async loadHistory() {
    const {teacher, contacts} = this.state;
    if (!teacher || !contacts.myId || !this.token) return;
    const generation = this.generation, version = ++this.historyVersion;
    this.publish({loading: true});
    try {
      const history = await this.request<Message[]>(historyPath(teacher, contacts.myId));
      if (generation !== this.generation || version !== this.historyVersion) return;
      this.publish({messages: mergeMessages(history, this.state.messages), error: ''});
      if (this.viewing) await this.markRead();
    } catch (error) {
      if (generation === this.generation && version === this.historyVersion) this.publish({error: messageOf(error), ...(!transient(error) ? {messages: []} : {})});
    } finally {if (generation === this.generation && version === this.historyVersion) this.publish({loading: false});}
  }
  private async markRead() {
    if (this.reading) {this.readAgain = true; return;}
    const {teacher, contacts} = this.state;
    if (!this.viewing || !teacher || !contacts.myId || !this.token) return;
    const generation = this.generation;
    const ids = new Set(this.state.messages.filter(m => m.sender_role === 'teacher' && !m.is_read).map(m => m.message_id));
    if (!ids.size) return;
    this.reading = true;
    try {
      await this.request('/api/messages/read', 'PUT', conversation(teacher, contacts.myId));
      if (generation !== this.generation || teacher !== this.state.teacher) return;
      this.publish({messages: this.state.messages.map(m => ids.has(m.message_id) ? {...m, is_read: true} : m)});
      await this.refresh();
    } catch (error) {if (generation === this.generation) this.publish({error: messageOf(error)});}
    finally {this.reading = false; if (this.readAgain) {this.readAgain = false; void this.markRead();}}
  }
  async send(body: string): Promise<Message> {
    const {teacher, contacts} = this.state;
    const trimmed = body.trim();
    if (!teacher || !contacts.myId || !contacts.contacts.some(c => c.id === teacher)) throw new Error('Choose an eligible adviser conversation.');
    if (!trimmed || [...trimmed].length > 5000) throw new Error('Messages must contain between 1 and 5000 characters.');
    const result = await this.request<Message>('/api/messages/send', 'POST', {...conversation(teacher, contacts.myId), body: trimmed, sender_role: 'parent'});
    if (this.token && teacher === this.state.teacher && contacts.myId === this.state.contacts.myId)
      this.publish({messages: mergeMessages(this.state.messages, [result])});
    // REST already publishes committed messages; a second socket send is unnecessary.
    void this.refresh(); return result;
  }
  dispose() {this.authenticate(''); this.listeners.clear();}
}
