import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import API, { errorMessage, isNetworkError } from "../services/api";
import { confirmDraft, readDraft, storeDraft } from "../utils/drafts";
import type { Draft } from "../utils/drafts";
import type { ChatMessage, Contact } from "../types";
import { Button, Empty, Field, Notice, TextArea } from "./ui";
interface MessageDraft {
  body: string;
}
function Composer({
  teacherId,
  parentId,
  onSaved,
}: {
  teacherId: number;
  parentId: number;
  onSaved: (m: ChatMessage) => void;
}) {
  const { user } = useAuth();
  const key = `ames_draft_${user!.id}_message_${teacherId}_${parentId}`;
  const [body, setBody] = useState(
    () => readDraft<MessageDraft>(key)?.values.body || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(readDraft<MessageDraft>(key)?.revision || "");
  useEffect(() => {
    const confirmed = (event: Event) => {
      if (
        (event as CustomEvent<string>).detail === key &&
        !readDraft<MessageDraft>(key)
      )
        setBody("");
    };
    window.addEventListener("ames-record-synced", confirmed);
    return () => window.removeEventListener("ames-record-synced", confirmed);
  }, [key]);
  const change = (value: string) => {
    revision.current = crypto.randomUUID();
    setBody(value);
    storeDraft(key, {
      owner_id: user!.id,
      values: { body: value },
      revision: revision.current,
      is_pending_sync: false,
    });
  };
  return (
    <form
      className="space-y-3 border-t border-slate-100 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || !body.trim()) return;
        setBusy(true);
        setError("");
        const snapshot = body;
        const version = revision.current || crypto.randomUUID();
        revision.current = version;
        const draft: Draft<MessageDraft> = {
          owner_id: user!.id,
          values: { body: snapshot },
          revision: version,
          is_pending_sync: true,
          request: {
            path: "/api/messages/send",
            method: "post",
            data: {
              teacher_id: teacherId,
              parent_id: parentId,
              body: snapshot,
            },
          },
        };
        storeDraft(key, draft);
        try {
          const res = await API.post<ChatMessage>(
            "/api/messages/send",
            draft.request!.data,
          );
          if (res.status === 201) {
            confirmDraft(key, version);
            if (revision.current === version) setBody("");
            onSaved(res.data);
          }
        } catch (err) {
          if (
            !isNetworkError(err) &&
            readDraft<MessageDraft>(key)?.revision === version
          )
            storeDraft(key, { ...draft, is_pending_sync: false });
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Notice tone="error">{error}</Notice>
      <TextArea
        label="Message"
        placeholder="Write a message…"
        maxLength={5000}
        value={body}
        onChange={(e) => change(e.target.value)}
      />
      <div className="flex justify-end">
        <Button disabled={busy || !body.trim()} type="submit">
          {busy ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
export default function ChatInterface({
  currentUserRole,
}: {
  currentUserRole: "teacher" | "parent";
}) {
  const { token } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [active, setActive] = useState<Contact | null>(null);
  const [ownId, setOwnId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const socket = useRef<Socket | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const teacherId = currentUserRole === "teacher" ? ownId : active?.id;
  const parentId = currentUserRole === "parent" ? ownId : active?.id;
  const room =
    teacherId && parentId ? `teacher-${teacherId}-parent-${parentId}` : "";
  const refreshContacts = useCallback(async () => {
    try {
      const res = await API.get<{ myId: number | null; contacts: Contact[] }>(
        "/api/messages/contacts",
      );
      setContacts(res.data.contacts);
      setOwnId(res.data.myId);
      setActive((current) =>
        current && res.data.contacts.some((c) => c.id === current.id)
          ? current
          : window.innerWidth >= 1024
            ? res.data.contacts[0] || null
            : null,
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    void refreshContacts();
  }, [refreshContacts]);
  const refresh = useCallback(async () => {
    if (!teacherId || !parentId) return;
    try {
      const res = await API.get<ChatMessage[]>("/api/messages/history", {
        params: { teacher_id: teacherId, parent_id: parentId },
      });
      setMessages(res.data);
      await API.put("/api/messages/read", {
        teacher_id: teacherId,
        parent_id: parentId,
      });
      window.dispatchEvent(new Event("ames-messages-read"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [teacherId, parentId]);
  useEffect(() => {
    if (!token) return;
    const connection = io(
      import.meta.env.VITE_SOCKET_URL ||
        API.defaults.baseURL ||
        "http://localhost:8000",
      { auth: { token }, withCredentials: true },
    );
    socket.current = connection;
    connection.on("connect", () => setConnected(true));
    connection.on("disconnect", () => setConnected(false));
    connection.on("connect_error", () => setConnected(false));
    connection.on("chat_error", (event: { message: string }) =>
      setError(event.message),
    );
    return () => {
      connection.disconnect();
      socket.current = null;
    };
  }, [token]);
  useEffect(() => {
    const connection = socket.current;
    if (!room || !connection) return;
    let mounted = true;
    setMessages([]);
    void refresh();
    const recover = () => {
      connection.emit("join_room", room);
      void refresh();
      void refreshContacts();
    };
    const receive = (message: ChatMessage) => {
      if (
        !mounted ||
        message.teacher_id !== teacherId ||
        message.parent_id !== parentId
      )
        return;
      setMessages((rows) =>
        rows.some((row) => row.message_id === message.message_id)
          ? rows
          : [...rows, message],
      );
      void API.put("/api/messages/read", {
        teacher_id: teacherId,
        parent_id: parentId,
      })
        .then(() => window.dispatchEvent(new Event("ames-messages-read")))
        .catch(() => {});
      void refreshContacts();
    };
    connection.on("connect", recover);
    connection.on("receive_message", receive);
    if (connection.connected) connection.emit("join_room", room);
    const poll = setInterval(() => void refresh(), 15000);
    const synced = () => void refresh();
    window.addEventListener("ames-record-synced", synced);
    return () => {
      mounted = false;
      clearInterval(poll);
      connection.off("connect", recover);
      connection.off("receive_message", receive);
      connection.emit("leave_room", room);
      window.removeEventListener("ames-record-synced", synced);
    };
  }, [room, refresh, refreshContacts, teacherId, parentId, token]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);
  return (
    <>
      <Notice tone="error">{error}</Notice>
      <div className="mt-5 grid min-h-[65dvh] overflow-hidden rounded-2xl bg-white shadow-sm lg:grid-cols-[1fr_2fr]">
        <aside
          className={`border-r border-slate-100 p-4 ${active ? "hidden lg:block" : ""}`}
        >
          <h2 className="mb-4 font-semibold">Conversations</h2>
          <Field
            label="Search contacts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="mt-4 space-y-2">
            {contacts
              .filter((c) =>
                c.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((c) => (
                <button
                  key={c.id}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm ${active?.id === c.id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}
                  onClick={() => {
                    setError("");
                    setActive(c);
                  }}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-600">
                    {c.name[0]}
                  </span>
                  <span className="min-w-0 break-words">{c.name}</span>
                </button>
              ))}
          </div>
          {!contacts.length && (
            <Empty>
              {currentUserRole === "teacher"
                ? "Parents appear after they link a student in your section."
                : "Link a child to contact their teacher."}
            </Empty>
          )}
        </aside>
        <section
          className={`min-w-0 flex-col ${active ? "flex" : "hidden lg:flex"}`}
        >
          {active ? (
            <>
              <header className="flex items-center gap-3 border-b border-slate-100 p-4">
                <Button
                  variant="secondary"
                  className="lg:hidden"
                  onClick={() => setActive(null)}
                >
                  ← Back
                </Button>
                <div className="min-w-0">
                  <h2 className="break-words text-sm font-semibold">
                    {active.name}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {connected
                      ? "Connected"
                      : "Reconnecting • messages remain saved"}
                  </p>
                </div>
              </header>
              <div className="max-h-[55dvh] min-h-[30dvh] flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 sm:p-6">
                {messages.map((m) => (
                  <article
                    key={m.message_id}
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${m.sender_role === currentUserRole ? "ml-auto bg-brand text-white" : "mr-auto bg-white text-slate-700"}`}
                  >
                    <p className="whitespace-pre-wrap break-words leading-6">
                      {m.body}
                    </p>
                    <time className="mt-2 block text-right text-[0.65rem] opacity-60">
                      {new Date(m.created_at).toLocaleString()}
                    </time>
                  </article>
                ))}
                {!messages.length && (
                  <Empty>Start a conversation with {active.name}.</Empty>
                )}
                <div ref={bottom} />
              </div>
              {teacherId && parentId && (
                <Composer
                  key={room}
                  teacherId={teacherId}
                  parentId={parentId}
                  onSaved={(m) => {
                    setMessages((rows) =>
                      rows.some((row) => row.message_id === m.message_id)
                        ? rows
                        : [...rows, m],
                    );
                    socket.current?.emit("send_message", {
                      room,
                      message_id: m.message_id,
                    });
                    void refreshContacts();
                  }}
                />
              )}
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8">
              <Empty>Choose a conversation to get started.</Empty>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
