import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useMessaging } from "../context/MessagingContext";
import API, { errorMessage, isNetworkError } from "../services/api";
import { confirmDraft, readDraft, storeDraft } from "../utils/drafts";
import type { Draft, RecordSyncedEvent } from "../utils/drafts";
import type { ChatMessage, Contact } from "../types";
import { Notice } from "./ui";
import {
  Box,
  Typography,
  Paper,
  TextField,
  IconButton,
  Avatar,
  List,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
interface MessageDraft {
  body: string;
}
interface ComposerProps {
  teacherId: number;
  parentId: number;
  onSaved: (message: ChatMessage) => void;
}
interface ChatInterfaceProps {
  currentUserRole: "teacher" | "parent";
  preferredContactName?: string;
}
function compareContacts(left: Contact, right: Contact): number {
  return (
    (right.latest_message_time || "").localeCompare(
      left.latest_message_time || "",
    ) || left.name.localeCompare(right.name)
  );
}
function mergeMessages(
  left: ChatMessage[],
  right: ChatMessage[],
): ChatMessage[] {
  const rows = new Map(left.map((row) => [row.message_id, row]));
  for (const row of right) {
    const previous = rows.get(row.message_id);
    rows.set(row.message_id, {
      ...row,
      is_read: row.is_read || previous?.is_read || false,
    });
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.message_id - b.message_id,
  );
}
function Composer({ teacherId, parentId, onSaved }: ComposerProps) {
  const { user } = useAuth();
  const { client } = useMessaging();
  const key = `ames_draft_${user!.id}_message_${teacherId}_${parentId}`;
  const [body, setBody] = useState(
    () => readDraft<MessageDraft>(key)?.values.body || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    () => readDraft<MessageDraft>(key)?.error || "",
  );
  const revision = useRef(readDraft<MessageDraft>(key)?.revision || "");
  useEffect(() => {
    const failed = () => {
      const draft = readDraft<MessageDraft>(key);
      if (draft?.error) setError(draft.error);
    };
    const confirmed = (event: Event) => {
      if (
        (event as CustomEvent<string>).detail === key &&
        !readDraft<MessageDraft>(key)
      )
        setBody("");
    };
    window.addEventListener("ames-record-synced", confirmed);
    window.addEventListener("ames-drafts-changed", failed);
    return () => {
      window.removeEventListener("ames-record-synced", confirmed);
      window.removeEventListener("ames-drafts-changed", failed);
    };
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
      style={{ flexShrink: 0, padding: 0 }}
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
          client.failure(err);
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
      <Box
        sx={{
          p: { xs: 1, sm: 1.5 },
          bgcolor: "#ffffff",
          borderTop: "1px solid #e2e8f0",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TextField
            fullWidth
            placeholder="Type a message..."
            variant="outlined"
            size="small"
            value={body}
            disabled={busy}
            onChange={(e) => change(e.target.value)}
            slotProps={{
              htmlInput: { "aria-label": "Message", maxLength: 5000 },
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 6,
                bgcolor: "#F8FAFC",
                fontSize: { xs: "0.85rem", sm: "0.925rem" },
              },
            }}
          />
          <IconButton
            type="submit"
            aria-label="Send message"
            disabled={busy || !body.trim()}
            sx={{
              bgcolor: "#4F46E5",
              color: "white",
              "&:hover": { bgcolor: "#4338CA" },
              "&.Mui-disabled": { bgcolor: "#E2E8F0", color: "#94A3B8" },
              width: { xs: 38, sm: 42 },
              height: { xs: 38, sm: 42 },
              flexShrink: 0,
            }}
          >
            <SendIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
          </IconButton>
        </Box>
      </Box>
    </form>
  );
}
export default function ChatInterface({
  currentUserRole,
  preferredContactName,
}: ChatInterfaceProps) {
  const { user } = useAuth();
  const { client, ready } = useMessaging();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [active, setActive] = useState<Contact | null>(null);
  const [ownId, setOwnId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const currentRoom = useRef("");
  const alive = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const selectedPreference = useRef("");
  useEffect(() => {
    if (
      currentUserRole !== "parent" ||
      !preferredContactName ||
      selectedPreference.current === preferredContactName ||
      window.innerWidth < 900
    )
      return;
    const adviser = contacts.find(
      (contact) =>
        contact.name
          .replace(/^Teacher\s+/i, "")
          .trim()
          .toLowerCase() === preferredContactName.trim().toLowerCase(),
    );
    if (adviser) {
      setActive(adviser);
      selectedPreference.current = preferredContactName;
    }
  }, [contacts, currentUserRole, preferredContactName]);
  const teacherId = currentUserRole === "teacher" ? ownId : active?.id;
  const parentId = currentUserRole === "parent" ? ownId : active?.id;
  const room =
    teacherId && parentId ? `teacher-${teacherId}-parent-${parentId}` : "";
  useLayoutEffect(() => {
    currentRoom.current = room;
  }, [room]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refreshContacts = useCallback(async () => {
    try {
      const data = await client.request<{
        myId: number | null;
        contacts: Contact[];
      }>("get", "/api/messages/contacts");
      if (!alive.current) return;
      setContacts((current) =>
        data.contacts
          .map((contact) => {
            const existing = current.find((row) => row.id === contact.id);
            return existing?.latest_message_time &&
              (!contact.latest_message_time ||
                existing.latest_message_time > contact.latest_message_time)
              ? {
                  ...contact,
                  latest_message_time: existing.latest_message_time,
                }
              : contact;
          })
          .sort(compareContacts),
      );
      setOwnId(data.myId);
      setActive((current) =>
        current && data.contacts.some((c) => c.id === current.id)
          ? current
          : window.innerWidth >= 900
            ? data.contacts[0] || null
            : null,
      );
      setError("");
    } catch (err) {
      if (alive.current) setError(errorMessage(err));
      throw err;
    }
  }, [client]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => void refreshContacts().catch(() => {}), 0);
    return () => clearTimeout(timer);
  }, [refreshContacts, ready]);
  const refresh = useCallback(async () => {
    if (!teacherId || !parentId) return;
    const selectedRoom = `teacher-${teacherId}-parent-${parentId}`;
    try {
      const rows = await client.request<ChatMessage[]>(
        "get",
        "/api/messages/history",
        { teacher_id: teacherId, parent_id: parentId },
      );
      if (!alive.current || currentRoom.current !== selectedRoom) return;
      // Keep push messages that arrived while this snapshot was in flight.
      setMessages((current) => mergeMessages(rows, current));
      setError("");
    } catch (err) {
      if (alive.current && currentRoom.current === selectedRoom)
        setError(errorMessage(err));
      throw err;
    }
  }, [teacherId, parentId, client]);
  useEffect(() => {
    return client.onRecover(async () => {
      await Promise.all([refreshContacts(), refresh()]);
    });
  }, [client, refreshContacts, refresh]);
  useEffect(() => {
    setMessages([]);
    if (!ready || !room) return;
    const timer = setTimeout(() => void refresh().catch(() => {}), 0);
    return () => clearTimeout(timer);
  }, [room, ready, refresh]);
  const receive = useCallback(
    (message: ChatMessage) => {
      const contactId =
        currentUserRole === "teacher" ? message.parent_id : message.teacher_id;
      setContacts((rows) =>
        rows
          .map((row) =>
            row.id === contactId
              ? {
                  ...row,
                  latest_message_time:
                    !row.latest_message_time ||
                    message.created_at > row.latest_message_time
                      ? message.created_at
                      : row.latest_message_time,
                }
              : row,
          )
          .sort(compareContacts),
      );
      if (
        `teacher-${message.teacher_id}-parent-${message.parent_id}` ===
        currentRoom.current
      )
        setMessages((rows) => mergeMessages(rows, [message]));
    },
    [currentUserRole],
  );
  useEffect(() => client.onMessage(receive), [client, receive]);
  useEffect(
    () =>
      client.onRead((event) => {
        if (
          `teacher-${event.teacher_id}-parent-${event.parent_id}` ===
          currentRoom.current
        ) {
          const ids = new Set(event.message_ids);
          setMessages((rows) =>
            rows.map((row) =>
              ids.has(row.message_id) ? { ...row, is_read: true } : row,
            ),
          );
        }
      }),
    [client],
  );
  useEffect(() => {
    const synced = (event: Event) => {
      const { detail, response } = event as RecordSyncedEvent<ChatMessage>;
      if (
        detail?.startsWith(`ames_draft_${user?.id}_message_`) &&
        response?.message_id
      )
        client.receive(response);
    };
    window.addEventListener("ames-record-synced", synced);
    return () => window.removeEventListener("ames-record-synced", synced);
  }, [client, user?.id]);
  useEffect(() => {
    if (!teacherId || !parentId) return;
    const unread = messages.filter(
      (message) => !message.is_read && message.sender_role !== currentUserRole,
    );
    if (!unread.length) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const mark = async () => {
      if (
        stopped ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      )
        return;
      try {
        await client.request("put", "/api/messages/read", {
          teacher_id: teacherId,
          parent_id: parentId,
        });
        if (stopped || currentRoom.current !== room) return;
        const ids = new Set(unread.map((message) => message.message_id));
        setMessages((rows) =>
          rows.map((row) =>
            ids.has(row.message_id) ? { ...row, is_read: true } : row,
          ),
        );
        client.invalidateUnread();
      } catch (err) {
        const status = axios.isAxiosError(err)
          ? err.response?.status
          : undefined;
        if (
          !stopped &&
          (client.isCoolingDown() ||
            isNetworkError(err) ||
            status === 429 ||
            (status && status >= 500))
        )
          timer = setTimeout(() => void mark(), client.retryDelay());
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void mark(), 250);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("online", schedule);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("online", schedule);
    };
  }, [messages, teacherId, parentId, room, currentUserRole, client]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);
  const getInitials = (name: string) => name.charAt(0).toUpperCase() || "U";
  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <>
      <Notice tone="error">{error}</Notice>
      <Paper
        sx={{
          display: "flex",
          height: {
            xs: "calc(100dvh - 9rem)",
            sm: "calc(100dvh - 10rem)",
            md: "calc(100vh - 11rem)",
          },
          minHeight: { xs: "420px", md: "520px" },
          borderRadius: 3,
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          border: "1px solid #e2e8f0",
        }}
      >
        {/* LEFT SIDE: Contacts List */}
        <Box
          sx={{
            width: { xs: "100%", md: "20rem" },
            flexShrink: 0,
            borderRight: "1px solid #e0e0e0",
            display: { xs: active ? "none" : "flex", md: "flex" },
            flexDirection: "column",
            bgcolor: "#ffffff",
            height: "100%",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              p: { xs: 2, sm: 2.5 },
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid #f1f5f9",
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: "bold",
                fontSize: { xs: "1.05rem", sm: "1.2rem" },
              }}
            >
              Conversations
            </Typography>
            <Typography
              variant="caption"
              sx={{
                bgcolor: "#f1f5f9",
                px: 1.5,
                py: 0.5,
                borderRadius: 3,
                fontWeight: 600,
                color: "text.secondary",
              }}
            >
              {contacts.length}
            </Typography>
          </Box>
          <List sx={{ overflowY: "auto", flex: 1, p: 0 }}>
            {contacts.map((contact) => {
              const isActive = active?.id === contact.id;
              return (
                <ListItemButton
                  key={contact.id}
                  onClick={() => setActive(contact)}
                  sx={{
                    borderLeft: isActive
                      ? "4px solid #4F46E5"
                      : "4px solid transparent",
                    bgcolor: isActive ? "#EEF2FF" : "transparent",
                    py: 1.5,
                    px: 2,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    "&:hover": { bgcolor: isActive ? "#EEF2FF" : "#F9FAFB" },
                  }}
                >
                  <Avatar
                    sx={{
                      bgcolor: isActive ? "#4F46E5" : "#E0E7FF",
                      color: isActive ? "#ffffff" : "#4F46E5",
                      fontWeight: "bold",
                      mr: 1.5,
                      width: 38,
                      height: 38,
                      fontSize: "0.9rem",
                    }}
                  >
                    {getInitials(contact.name)}
                  </Avatar>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isActive ? "bold" : "600",
                          color: "#1e293b",
                        }}
                      >
                        {contact.name}
                      </Typography>
                    }
                  />
                </ListItemButton>
              );
            })}
            {contacts.length === 0 && (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  No active contacts found.
                </Typography>
              </Box>
            )}
          </List>
        </Box>

        {/* RIGHT SIDE: Chat Area */}
        <Box
          sx={{
            flex: 1,
            display: { xs: active ? "flex" : "none", md: "flex" },
            flexDirection: "column",
            bgcolor: "#F8FAFC",
            height: "100%",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {active ? (
            <>
              {/* Chat Header */}
              <Box
                sx={{
                  p: { xs: 1.25, sm: 2 },
                  bgcolor: "#ffffff",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  flexShrink: 0,
                }}
              >
                <IconButton
                  onClick={() => setActive(null)}
                  sx={{
                    display: { xs: "inline-flex", md: "none" },
                    p: 1,
                    minWidth: 40,
                    minHeight: 40,
                    bgcolor: "#f1f5f9",
                    "&:hover": { bgcolor: "#e2e8f0" },
                  }}
                  aria-label="Back to contacts list"
                >
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
                <Avatar
                  sx={{
                    bgcolor: "#E0E7FF",
                    color: "#4F46E5",
                    fontWeight: "bold",
                    width: { xs: 36, sm: 40 },
                    height: { xs: 36, sm: 40 },
                    fontSize: "0.95rem",
                  }}
                >
                  {getInitials(active.name)}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="subtitle2"
                    noWrap
                    sx={{
                      fontWeight: "bold",
                      fontSize: { xs: "0.9rem", sm: "1rem" },
                      color: "#0f172a",
                    }}
                  >
                    {active.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      display: "block",
                      fontSize: "0.72rem",
                      lineHeight: 1.2,
                    }}
                  >
                    Active Message Thread
                  </Typography>
                </Box>
              </Box>

              {/* Messages Scroll Area */}
              <Box
                sx={{
                  flex: 1,
                  p: { xs: 1.5, sm: 2.5 },
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                }}
              >
                {messages.map((msg, index) => {
                  const isMe = msg.sender_role === currentUserRole;
                  return (
                    <Box
                      key={msg.message_id || index}
                      sx={{
                        display: "flex",
                        justifyContent: isMe ? "flex-end" : "flex-start",
                      }}
                    >
                      <Box
                        sx={{
                          maxWidth: { xs: "85%", sm: "75%", md: "65%" },
                          p: { xs: 1.25, sm: 1.75 },
                          borderRadius: 3,
                          borderBottomRightRadius: isMe ? 0 : 3,
                          borderBottomLeftRadius: !isMe ? 0 : 3,
                          bgcolor: isMe ? "#4F46E5" : "#ffffff",
                          color: isMe ? "#ffffff" : "#0f172a",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                          wordBreak: "break-word",
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: { xs: "0.85rem", sm: "0.925rem" },
                            lineHeight: 1.45,
                          }}
                        >
                          {msg.body}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            textAlign: "right",
                            mt: 0.5,
                            fontSize: { xs: "0.65rem", sm: "0.72rem" },
                            color: isMe ? "#C7D2FE" : "#94A3B8",
                          }}
                        >
                          {formatTime(msg.created_at)}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
                <div ref={bottom} />
              </Box>

              {teacherId && parentId && (
                <Composer
                  key={room}
                  teacherId={teacherId}
                  parentId={parentId}
                  onSaved={(message) => client.receive(message)}
                />
              )}
            </>
          ) : (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                p: 3,
                textAlign: "center",
              }}
            >
              <Typography
                variant="body1"
                sx={{ color: "text.secondary", fontWeight: "500" }}
              >
                Select a contact to start messaging
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>
    </>
  );
}
