import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AppState,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { io } from "socket.io-client";
import type { Message, User } from "./contracts";
import { baseUrl, session } from "./session";
import { messageOf } from "./sessionCore";
import { MessagingClient } from "./messagingCore";
import { drafts, useDraft } from "./drafts";
import { draft, OFFLINE_MESSAGE } from "./draftStore";
import {
  Avatar,
  Badge,
  BrandColor,
  Copy,
  Heading,
  Icon,
  IconButton,
  Input,
  Label,
  Loading,
  Notice,
  Screen,
  fonts,
  styles,
  usePullRefresh,
} from "./ui";
import { displayTime } from "./presentation";
export function useMessaging() {
  const [client] = useState(
    () =>
      new MessagingClient(
        (path, method, data) => session.request(path, method, data),
        (token) =>
          io(baseUrl, {
            path: "/socket.io/",
            auth: { token },
            autoConnect: false,
            extraHeaders: { Origin: "https://ameskinder.com" },
            transports: ["websocket"],
            reconnectionDelay: 3000,
            reconnectionDelayMax: 30000,
          }),
      ),
  );
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const auth = useSyncExternalStore(session.subscribe, session.snapshot);
  useEffect(() => {
    client.authenticate(auth.session?.access_token || "");
  }, [client, auth.session?.access_token]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void client.refresh();
    }, 20000);
    const listener = AppState.addEventListener("change", (value) => {
      if (value === "active") void client.recover();
      else client.setViewing(false);
    });
    return () => {
      clearInterval(timer);
      listener.remove();
      client.dispose();
    };
  }, [client]);
  return { client, state };
}
interface ComposerValues {
  body: string;
}
function Composer({
  user,
  teacher,
  parent,
  client,
  sent,
}: {
  user: User;
  teacher: number;
  parent: number;
  client: MessagingClient;
  sent: () => void;
}) {
  const key = `ames_draft_${user.id}_message_${teacher}_${parent}`;
  const { snapshot, ready, storageError } = useDraft<ComposerValues>(
    key,
    user.id,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const body = snapshot?.values.body || "";
  const send = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = draft(user.id, { body });
      await drafts.put(key, saved);
      if (
        client.snapshot().teacher !== teacher ||
        client.snapshot().contacts.myId !== parent
      )
        throw new Error(
          "Conversation changed. Return to this thread to send your saved draft.",
        );
      await client.send(body);
      await drafts.confirm(key, user.id, saved.revision);
      sent();
    } catch (failure) {
      setError(
        `${messageOf(failure)} ${OFFLINE_MESSAGE} If the send result is uncertain, pull down to refresh history before retrying to avoid a duplicate.`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.actionBar}>
      <View
        style={[styles.row, { flexWrap: "nowrap", alignItems: "flex-end" }]}
      >
        <View style={{ flex: 1 }}>
          <Input
            label="Message to adviser"
            placeholder="Type your message…"
            multiline
            style={{ maxHeight: 120 }}
            value={body}
            editable={ready && !busy}
            onChangeText={(value) => {
              void drafts
                .put(key, draft(user.id, { body: value }))
                .catch(() => {});
            }}
          />
        </View>
        <View
          style={{
            backgroundColor: "#4f46e5",
            borderRadius: 24,
            marginBottom: 3,
          }}
        >
          <IconButton
            name="send"
            label={busy ? "Sending message" : "Send message"}
            color="#fff"
            disabled={
              !ready || busy || !body.trim() || [...body.trim()].length > 5000
            }
            onPress={() => void send()}
          />
        </View>
      </View>
      <Copy style={{ fontSize: 10 }}>
        {[...body.trim()].length}/5000 · Draft saved on this device · Manual
        send
      </Copy>
      {!!storageError && <Notice error>{storageError}</Notice>}
      {!!error && <Notice error>{error}</Notice>}
    </View>
  );
}
export function MessagesScreen({
  user,
  client,
  back,
  refreshChildren,
}: {
  user: User;
  client: MessagingClient;
  back: () => void;
  refreshChildren: () => Promise<void>;
}) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [thread, setThread] = useState(false);
  const list = useRef<FlatList<Message>>(null),
    nearBottom = useRef(true);
  const showThread = Boolean(thread && state.teacher && state.contacts.myId);
  const color = useContext(BrandColor);
  const pull = usePullRefresh(async () => {
    await Promise.all([client.recover(), refreshChildren()]);
  });
  useEffect(() => {
    client.setViewing(showThread && AppState.currentState === "active");
    const listener = AppState.addEventListener("change", (value) =>
      client.setViewing(showThread && value === "active"),
    );
    return () => {
      client.setViewing(false);
      listener.remove();
    };
  }, [client, showThread]);
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showThread) setThread(false);
      else back();
      return true;
    });
    return () => listener.remove();
  }, [back, showThread]);
  const name = state.contacts.contacts.find(
    (c) => c.id === state.teacher,
  )?.name;
  if (!showThread)
    return (
      <Screen
        onRefresh={async () => {
          await Promise.all([client.refresh(), refreshChildren()]);
        }}
      >
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Heading title="Messages" icon="messages" />
          <Badge color="#4f46e5">{state.unread} unread</Badge>
        </View>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Copy>
            {state.connected
              ? "Live updates connected"
              : "Offline · Pull down to refresh saved messages"}
          </Copy>
        </View>
        {!!state.error && <Notice error>{state.error}</Notice>}
        {!state.contacts.contacts.length && (
          <Notice>
            No eligible adviser conversations are available. A synced child and
            active adviser are required.
          </Notice>
        )}
        {[...state.contacts.contacts]
          .sort(
            (a, b) =>
              (b.latest_message_time || "").localeCompare(
                a.latest_message_time || "",
              ) || a.name.localeCompare(b.name),
          )
          .map((contact) => (
            <Pressable
              key={contact.id}
              accessibilityRole="button"
              accessibilityLabel={`Message ${contact.name}`}
              onPress={() => {
                nearBottom.current = true;
                setThread(true);
                void client.open(contact.id);
              }}
              style={[styles.card, styles.row, { flexWrap: "nowrap" }]}
            >
              <Avatar name={contact.name} size={44} />
              <View style={{ flex: 1, gap: 4 }}>
                <Label>{contact.name}</Label>
                <Copy>Tap to view conversation</Copy>
              </View>
              <Copy style={{ fontSize: 10 }}>
                {displayTime(contact.latest_message_time, true)}
              </Copy>
              <Icon name="down" size={18} />
            </Pressable>
          ))}
      </Screen>
    );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f1f5f9" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.row,
          {
            paddingHorizontal: 6,
            paddingVertical: 8,
            flexWrap: "nowrap",
            backgroundColor: "#fff",
            borderBottomWidth: 1,
            borderBottomColor: "#e2e8f0",
          },
        ]}
      >
        <IconButton
          name="back"
          label="Back to contacts"
          onPress={() => setThread(false)}
        />
        <Avatar name={name || "Adviser"} size={36} />
        <View style={{ flex: 1 }}>
          <Label>{name || "Adviser"}</Label>
          <Copy style={{ fontSize: 10 }}>Active Message Thread</Copy>
        </View>
      </View>
      {!!state.error && <Notice error>{state.error}</Notice>}
      <FlatList
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            colors={[color]}
            tintColor={color}
            accessibilityLabel="Pull down to refresh messages"
          />
        }
        ref={list}
        data={state.messages}
        keyExtractor={(message) => String(message.message_id)}
        contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            e.nativeEvent;
          nearBottom.current =
            contentSize.height - contentOffset.y - layoutMeasurement.height <
            100;
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (nearBottom.current)
            list.current?.scrollToEnd({ animated: false });
        }}
        ListEmptyComponent={
          state.loading ? (
            <Loading />
          ) : (
            <Copy style={styles.center}>
              No saved messages in this conversation.
            </Copy>
          )
        }
        renderItem={({ item: message }) => {
          const own = message.sender_role === "parent";
          return (
            <View style={{ alignItems: own ? "flex-end" : "flex-start" }}>
              <View
                style={{
                  maxWidth: "85%",
                  padding: 12,
                  borderRadius: 12,
                  borderBottomRightRadius: own ? 0 : 12,
                  borderBottomLeftRadius: own ? 12 : 0,
                  backgroundColor: own ? "#4f46e5" : "#fff",
                  gap: 4,
                  elevation: 1,
                }}
              >
                <Text
                  selectable
                  style={{
                    fontFamily: fonts.regular,
                    fontSize: 14,
                    lineHeight: 21,
                    color: own ? "#fff" : "#0f172a",
                  }}
                >
                  {message.body}
                </Text>
                <View
                  style={[styles.row, { justifyContent: "flex-end", gap: 4 }]}
                >
                  <Copy
                    style={{ fontSize: 10, color: own ? "#c7d2fe" : "#94a3b8" }}
                  >
                    {displayTime(message.created_at)}
                    {own ? ` · ${message.is_read ? "Read" : "Sent"}` : ""}
                  </Copy>
                  {own && (
                    <Icon
                      name={message.is_read ? "doneAll" : "check"}
                      size={13}
                      color="#c7d2fe"
                    />
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />
      <Composer
        key={`${state.teacher}_${state.contacts.myId}`}
        user={user}
        teacher={state.teacher!}
        parent={state.contacts.myId!}
        client={client}
        sent={() => {
          nearBottom.current = true;
          list.current?.scrollToEnd({ animated: true });
        }}
      />
    </KeyboardAvoidingView>
  );
}
