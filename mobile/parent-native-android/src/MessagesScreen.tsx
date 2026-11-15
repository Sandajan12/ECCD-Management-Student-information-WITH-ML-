import React, {useEffect, useState, useSyncExternalStore} from 'react';
import {AppState, View} from 'react-native';
import {io} from 'socket.io-client';
import type {User} from './contracts';
import {baseUrl, session} from './session';
import {messageOf} from './sessionCore';
import {MessagingClient} from './messagingCore';
import {drafts, useDraft} from './drafts';
import {draft, OFFLINE_MESSAGE} from './draftStore';
import {Button, Card, Copy, Input, Label, Loading, Notice, Title} from './ui';
export function useMessaging() {
  const [client] = useState(() => new MessagingClient((path, method, data) => session.request(path, method, data),
    token => io(baseUrl, {path: '/socket.io/', auth: {token}, autoConnect: false,
      extraHeaders: {Origin: 'https://ameskinder.com'}, transports: ['websocket'], reconnectionDelay: 3000, reconnectionDelayMax: 30000})));
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const auth = useSyncExternalStore(session.subscribe, session.snapshot);
  useEffect(() => {client.authenticate(auth.session?.access_token || '');}, [client, auth.session?.access_token]);
  useEffect(() => {
    const timer = setInterval(() => {if (AppState.currentState === 'active') void client.refresh();}, 20000);
    const listener = AppState.addEventListener('change', value => {if (value === 'active') void client.recover(); else client.setViewing(false);});
    return () => {clearInterval(timer); listener.remove(); client.dispose();};
  }, [client]);
  return {client, state};
}
interface ComposerValues { body: string; }
function Composer({user, teacher, parent, client}: {user: User; teacher: number; parent: number; client: MessagingClient}) {
  const key = `ames_draft_${user.id}_message_${teacher}_${parent}`;
  const {snapshot, ready, storageError} = useDraft<ComposerValues>(key, user.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const body = snapshot?.values.body || '';
  const send = async () => {
    if (!ready || busy) return;
    setBusy(true); setError('');
    try {
      const saved = draft(user.id, {body}); await drafts.put(key, saved);
      await client.send(body); await drafts.confirm(key, user.id, saved.revision);
    } catch (failure) {setError(`${messageOf(failure)} ${OFFLINE_MESSAGE} If the send result is uncertain, refresh history before retrying to avoid a duplicate.`);}
    finally {setBusy(false);}
  };
  return <><Input label="Message to adviser" multiline value={body} editable={ready && !busy}
    onChangeText={value => {void drafts.put(key, draft(user.id, {body: value})).catch(() => {});}}/>
    <Copy>{[...body.trim()].length}/5000 · Sent only when you tap Send</Copy>
    {!!storageError && <Notice error>{storageError}</Notice>}{!!error && <Notice error>{error}</Notice>}
    <Button title={busy ? 'Sending…' : 'Send message'} disabled={!ready || busy || !body.trim() || [...body.trim()].length > 5000} onPress={() => void send()}/></>;
}
export function MessagesScreen({user, client}: {user: User; client: MessagingClient}) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  useEffect(() => {
    client.setViewing(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', value => client.setViewing(value === 'active'));
    return () => {client.setViewing(false); listener.remove();};
  }, [client]);
  const name = state.contacts.contacts.find(c => c.id === state.teacher)?.name;
  return <><Card><Title>Messages · {state.unread} unread</Title><Copy>{state.connected ? 'Live updates connected' : 'Live updates disconnected. Refresh to check saved messages.'}</Copy>
    <Button secondary title="Refresh conversations" onPress={() => void client.recover()}/>
    {!!state.error && <Notice error>{state.error}</Notice>}
    {!state.contacts.contacts.length && <Notice>No eligible adviser conversations are available. A synced child and active adviser are required.</Notice>}
    {state.contacts.contacts.map(contact => <View key={contact.id} style={{gap: 4}}>
      <Button title={contact.name} secondary={state.teacher !== contact.id} onPress={() => void client.open(contact.id)}/>
      <Copy>Latest message: {contact.latest_message_time ?? 'No messages yet'}</Copy>
    </View>)}
  </Card>{state.teacher && state.contacts.myId && <Card><Title>{name || 'Adviser'}</Title>
    {state.loading && <Loading/>}
    {!state.loading && !state.messages.length && <Copy>No saved messages in this conversation.</Copy>}
    {state.messages.map(message => <View key={message.message_id} style={{padding: 14, borderRadius: 16, backgroundColor: message.sender_role === 'parent' ? '#edf0ff' : '#f1f5f9', gap: 4}}>
      <Label>{message.sender_role === 'parent' ? 'You' : name || 'Adviser'}</Label><Copy>{message.body}</Copy>
      <Copy>{message.created_at} · {message.is_read ? 'Read' : 'Sent'}</Copy>
    </View>)}
    <Composer key={`${state.teacher}_${state.contacts.myId}`} user={user} teacher={state.teacher} parent={state.contacts.myId} client={client}/>
  </Card>}</>;
}
