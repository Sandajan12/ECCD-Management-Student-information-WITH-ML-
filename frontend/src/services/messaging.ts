import axios from "axios";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import API from "./api";
import type { ChatMessage } from "../types";

export interface MessagesReadEvent {
  teacher_id: number;
  parent_id: number;
  reader_role: "teacher" | "parent";
  message_ids: number[];
}
interface MessagingSnapshot {
  ready: boolean;
  unread: number;
}

// One instance per authenticated portal tab; socket events and wake recovery
// keep layout and chat in sync without idle HTTP polling.
export class MessagingClient {
  private socket: Socket | null = null;
  private snapshot: MessagingSnapshot = { ready: false, unread: 0 };
  private observers = new Set<() => void>();
  private messages = new Set<(message: ChatMessage) => void>();
  private receipts = new Set<(event: MessagesReadEvent) => void>();
  private recoveries = new Set<() => Promise<unknown>>();
  private pending = new Map<string, Promise<unknown>>();
  private seen = new Set<number>();
  private controller = new AbortController();
  private closed = false;
  private recovery: Promise<unknown> | null = null;
  private unreadTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private socketRetry?: ReturnType<typeof setTimeout>;
  private startup?: ReturnType<typeof setTimeout>;
  private lastRecovery = 0;
  private cooldown = 0;
  private unreadRevision = 0;

  private token: string | null;
  private enabled: boolean;
  constructor(token: string | null, enabled: boolean) {
    this.token = token;
    this.enabled = enabled;
  }

  subscribe = (listener: () => void) => {
    this.observers.add(listener);
    return () => {
      this.observers.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private update(value: Partial<MessagingSnapshot>) {
    if (this.closed) return;
    this.snapshot = { ...this.snapshot, ...value };
    this.observers.forEach((listener) => listener());
  }
  onMessage(listener: (message: ChatMessage) => void) {
    this.messages.add(listener);
    return () => {
      this.messages.delete(listener);
    };
  }
  onRead(listener: (event: MessagesReadEvent) => void) {
    this.receipts.add(listener);
    return () => {
      this.receipts.delete(listener);
    };
  }
  onRecover(listener: () => Promise<unknown>) {
    this.recoveries.add(listener);
    return () => {
      this.recoveries.delete(listener);
    };
  }
  receive = (message: ChatMessage) => {
    if (this.closed || this.seen.has(message.message_id)) return;
    this.seen.add(message.message_id);
    if (this.seen.size > 1000)
      this.seen.delete(this.seen.values().next().value!);
    this.messages.forEach((listener) => listener(message));
    this.invalidateUnread();
  };
  failure = (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      const header = String(error.response.headers["retry-after"] || "60");
      const delay = Number(header);
      this.cooldown = Math.max(
        this.cooldown,
        Date.now() +
          (Number.isFinite(delay)
            ? Math.max(1, delay) * 1000
            : Math.max(1000, Date.parse(header) - Date.now()) || 60000),
      );
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(this.recover, this.retryDelay());
    }
  };
  retryDelay = () => Math.max(60000, this.cooldown - Date.now());
  isCoolingDown = () => Date.now() < this.cooldown;
  request<T>(method: "get" | "put", path: string, data?: unknown): Promise<T> {
    const key = `${method}:${path}:${JSON.stringify(data)}`;
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    if (this.closed || Date.now() < this.cooldown)
      return Promise.reject(
        new Error("Messaging is temporarily paused. Please try again shortly."),
      );
    const promise = API.request<T>({
      method,
      url: path,
      signal: this.controller.signal,
      ...(method === "get" ? { params: data } : { data }),
    })
      .then((response) => response.data)
      .catch((error: unknown) => {
        this.failure(error);
        throw error;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
  private refreshUnread = async () => {
    const revision = this.unreadRevision;
    const data = await this.request<{ unreadCount: number }>(
      "get",
      "/api/messages/unread-count",
    );
    this.update({ unread: data.unreadCount });
    if (revision !== this.unreadRevision) this.invalidateUnread();
  };
  invalidateUnread = () => {
    this.unreadRevision++;
    if (this.closed || this.unreadTimer) return;
    this.unreadTimer = setTimeout(
      () => {
        this.unreadTimer = undefined;
        void this.refreshUnread().catch(() => {});
      },
      Math.max(250, this.cooldown - Date.now()),
    );
  };
  private recover = () => {
    if (this.closed || this.recovery || !this.snapshot.ready) return;
    if (!navigator.onLine || document.visibilityState !== "visible") return;
    if (Date.now() < this.cooldown) {
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(this.recover, this.cooldown - Date.now());
      return;
    }
    if (Date.now() - this.lastRecovery < 60000) return;
    this.lastRecovery = Date.now();
    clearTimeout(this.unreadTimer);
    this.unreadTimer = undefined;
    this.recovery = Promise.allSettled([
      this.refreshUnread(),
      ...Array.from(this.recoveries, (refresh) => refresh()),
    ]).finally(() => {
      this.recovery = null;
    });
  };
  private pauseSocket(socket: Socket, seconds: number) {
    this.cooldown = Math.max(
      this.cooldown,
      Date.now() + Math.max(1, seconds || 60) * 1000,
    );
    socket.disconnect();
    clearTimeout(this.socketRetry);
    this.socketRetry = setTimeout(() => {
      this.socketRetry = undefined;
      socket.connect();
    }, this.cooldown - Date.now());
  }
  start() {
    if (!this.enabled || !this.token) return () => {};
    const initialize = () => {
      if (this.snapshot.ready) return;
      clearTimeout(this.startup);
      this.update({ ready: true });
      this.lastRecovery = Date.now();
      void this.refreshUnread().catch(() => {});
    };
    // Defer startup so StrictMode's discarded mount sends no HTTP/handshake.
    const boot = setTimeout(() => {
      const socket = (this.socket = io(
        import.meta.env.VITE_SOCKET_URL ||
          API.defaults.baseURL ||
          "https://api.ameskinder.com",
        {
          auth: { token: this.token },
          withCredentials: true,
          transports: ["websocket", "polling"],
          tryAllTransports: true,
          reconnectionDelay: 3000,
          reconnectionDelayMax: 30000,
        },
      ));
      socket.on("connect", () => {
        clearTimeout(this.retryTimer);
        if (this.snapshot.ready) this.recover();
        else initialize();
      });
      socket.on(
        "connect_error",
        (error: Error & { context?: XMLHttpRequest }) => {
          const xhr = error.context;
          if (xhr?.status === 429) {
            const header = xhr.getResponseHeader("Retry-After") || "60";
            const seconds = Number(header);
            this.pauseSocket(
              socket,
              Number.isFinite(seconds)
                ? seconds
                : (Date.parse(header) - Date.now()) / 1000 || 60,
            );
          }
        },
      );
      socket.on("receive_message", this.receive);
      socket.on("messages_read", (event: MessagesReadEvent) => {
        this.receipts.forEach((listener) => listener(event));
        this.invalidateUnread();
      });
      socket.on("rate_limit_error", (event: { retryAfter?: number }) => {
        this.pauseSocket(socket, event.retryAfter || 60);
      });
      this.startup = setTimeout(initialize, 1000);
    }, 0);
    document.addEventListener("visibilitychange", this.recover);
    window.addEventListener("online", this.recover);
    window.addEventListener("focus", this.recover);
    return () => {
      this.closed = true;
      clearTimeout(boot);
      clearTimeout(this.startup);
      clearTimeout(this.retryTimer);
      clearTimeout(this.socketRetry);
      clearTimeout(this.unreadTimer);
      this.controller.abort();
      this.socket?.disconnect();
      document.removeEventListener("visibilitychange", this.recover);
      window.removeEventListener("online", this.recover);
      window.removeEventListener("focus", this.recover);
    };
  }
}
