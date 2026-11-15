import React, { useContext, useEffect, useRef, useState } from "react";
import { BackHandler, Keyboard, Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Child, User } from "./contracts";
import {
  Avatar,
  Badge,
  BrandColor,
  Button,
  Card,
  Copy,
  Dialog,
  fonts,
  Heading,
  Icon,
  IconButton,
  Label,
  Notice,
  SchoolBrand,
  Screen,
  Seal,
  styles,
} from "./ui";
import type { IconName } from "./ui";
import { Feedback, useResource } from "./resources";
import { LinkChild, ProfileScreen } from "./ProfileScreen";
import { OverviewScreen } from "./OverviewScreen";
import { MessagesScreen, useMessaging } from "./MessagesScreen";
import { InsightsTab, ResultsTab } from "./AssessmentScreens";
import { adviserName } from "./presentation";

type Tab =
  "Overview" | "Child Profile" | "ECCD Results" | "ML Insights" | "Messages";
const navigation: Array<{ tab: Tab; title: string; icon: IconName }> = [
  { tab: "Overview", title: "Overview", icon: "home" },
  { tab: "Child Profile", title: "Child", icon: "child" },
  { tab: "ECCD Results", title: "ECCD", icon: "checklist" },
  { tab: "ML Insights", title: "Insights", icon: "insights" },
  { tab: "Messages", title: "Messages", icon: "messages" },
];
const childName = (child: Child) =>
  child.full_name ||
  `${child.first_name || ""} ${child.last_name || ""}`.trim() ||
  `Child ${child.student_id}`;
function Unread({ count }: { count: number }) {
  return count > 0 ? (
    <View
      accessible
      accessibilityLabel={`${count} unread messages`}
      style={{
        position: "absolute",
        right: -4,
        top: -5,
        backgroundColor: "#ef4444",
        borderRadius: 12,
        minWidth: 16,
        paddingHorizontal: 4,
        alignItems: "center",
      }}
    >
      <Text style={{ fontFamily: fonts.semibold, color: "#fff", fontSize: 9 }}>
        {count > 99 ? "99+" : count}
      </Text>
    </View>
  ) : null;
}
export function ChildPortal({
  user,
  logout,
}: {
  user: User;
  logout: () => void;
}) {
  const state = useResource<Child[]>("/api/students/my-child");
  const [selected, setSelected] = useState<number>(0),
    [tab, setTab] = useState<Tab>("Overview");
  const [linking, setLinking] = useState(false),
    [choosing, setChoosing] = useState(false);
  const messaging = useMessaging(),
    brand = useContext(SchoolBrand),
    primary = useContext(BrandColor);
  const [storageError, setStorageError] = useState(""),
    [selectionReady, setSelectionReady] = useState(false),
    [keyboard, setKeyboard] = useState(false);
  const storageVersion = useRef(0),
    key = `ames_child_${user.id}`;
  useEffect(() => {
    const version = ++storageVersion.current;
    void AsyncStorage.getItem(key)
      .then((value) => {
        if (version === storageVersion.current) setSelected(Number(value) || 0);
      })
      .catch(() =>
        setStorageError(
          "Child selection could not be restored on this device.",
        ),
      )
      .finally(() => {
        if (version === storageVersion.current) setSelectionReady(true);
      });
    return () => {
      storageVersion.current++;
    };
  }, [key]);
  const children = state.data || [],
    child = selectionReady
      ? children.find((c) => c.student_id === selected) || children[0]
      : undefined;
  useEffect(() => {
    if (!child) return;
    if (selected !== child.student_id) setSelected(child.student_id);
    void AsyncStorage.setItem(key, String(child.student_id)).catch(() =>
      setStorageError("Child selection will last for this session only."),
    );
  }, [key, child?.student_id, selected]);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
        setKeyboard(true),
      ),
      hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    if (tab === "Messages") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (tab !== "Overview") {
        setTab("Overview");
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [tab]);
  const select = (id: number) => {
    storageVersion.current++;
    setSelected(id);
    setChoosing(false);
    void AsyncStorage.setItem(key, String(id)).catch(() =>
      setStorageError("Child selection will last for this session only."),
    );
  };
  const overviewHeader = (
    <>
      <Heading
        title={`Hello, ${user.full_name || "Parent"}`}
        subtitle="Small steps today. Growing confidence for tomorrow."
      />
      <Badge>
        {child?.school_year ? `SY ${child.school_year} · ` : ""}Kindergarten
      </Badge>
      <Feedback {...state} />
      {child && (
        <Card>
          <View
            style={[
              styles.row,
              { alignItems: "flex-start", flexWrap: "nowrap" },
            ]}
          >
            <Avatar name={childName(child)} />
            <View style={{ flex: 1, gap: 4 }}>
              <Label style={{ fontSize: 16 }}>{childName(child)}</Label>
              <Copy>
                {child.section_name ||
                  child.class_name ||
                  "Section not assigned"}
              </Copy>
              <Copy>Adviser: {adviserName(child)}</Copy>
              {child.allow_parent_view_student_info && (
                <Copy>LRN: {child.masked_lrn}</Copy>
              )}
              <Badge
                icon="check"
                color={child.is_active ? "#15803d" : "#64748b"}
              >
                {child.is_active ? "Active" : "Inactive"}
              </Badge>
            </View>
          </View>
          <Button
            title="Link Child · SYNC"
            icon="sync"
            secondary
            onPress={() => setLinking(true)}
          />
        </Card>
      )}
    </>
  );
  return (
    <View style={{ flex: 1, backgroundColor: "#f8fafc" }}>
      <View
        style={{
          backgroundColor: "#111827",
          paddingHorizontal: 12,
          paddingVertical: 6,
          flexDirection: "row",
          gap: 10,
          alignItems: "center",
        }}
      >
        <Seal size={32} />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fonts.bold,
            color: "#fff",
            fontSize: 14,
          }}
        >
          {brand.school_name}
        </Text>
        <View>
          <IconButton
            name="messages"
            label={`Messages, ${messaging.state.unread} unread`}
            color="#fff"
            onPress={() => setTab("Messages")}
          />
          <Unread count={messaging.state.unread} />
        </View>
        <IconButton
          name="logout"
          label="Logout"
          color="#cbd5e1"
          onPress={logout}
        />
      </View>
      {tab !== "Messages" && (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 9,
            gap: 7,
            backgroundColor: "#fff",
            borderBottomWidth: 1,
            borderBottomColor: "#e2e8f0",
          }}
        >
          <View style={[styles.row, { flexWrap: "nowrap" }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select child"
              disabled={!selectionReady}
              onPress={() => setChoosing(true)}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                borderWidth: 1,
                borderColor: "#e2e8f0",
                borderRadius: 12,
                padding: 8,
              }}
            >
              <Avatar name={child ? childName(child) : "?"} size={28} />
              <Label style={{ flex: 1 }}>
                {child ? childName(child) : "Select child"}
              </Label>
              <Icon name="down" size={18} />
            </Pressable>
            <IconButton
              name="add"
              label="Link Child via LRN"
              color={primary}
              onPress={() => setLinking(true)}
            />
          </View>
          {!!storageError && <Notice>{storageError}</Notice>}
        </View>
      )}
      <View style={{ flex: 1 }}>
        {tab === "Messages" ? (
          <MessagesScreen
            user={user}
            client={messaging.client}
            refreshChildren={state.reload}
            back={() => setTab("Overview")}
          />
        ) : tab === "Overview" ? (
          child ? (
            <OverviewScreen
              key={`${user.id}_${child.student_id}`}
              child={child}
              user={user}
              header={overviewHeader}
              refreshChildren={state.reload}
              insights={() => setTab("ML Insights")}
              results={() => setTab("ECCD Results")}
            />
          ) : (
            <Screen onRefresh={state.reload}>
              {overviewHeader}
              {!state.loading && (
                <Card>
                  <Heading title="Awaiting Connection…" icon="child" />
                  <Copy>
                    No eligible linked children are available. Ask your child’s
                    adviser to confirm the family link and active section
                    assignment.
                  </Copy>
                  <Button
                    title="Link Child"
                    icon="add"
                    onPress={() => setLinking(true)}
                  />
                </Card>
              )}
            </Screen>
          )
        ) : child ? (
          <View
            key={`${user.id}_${child.student_id}_${tab}`}
            style={{ flex: 1 }}
          >
            {tab === "Child Profile" ? (
              <ProfileScreen child={child} user={user} changed={state.reload} />
            ) : tab === "ECCD Results" ? (
              <ResultsTab child={child} refreshChildren={state.reload} />
            ) : (
              <InsightsTab child={child} refreshChildren={state.reload} />
            )}
          </View>
        ) : (
          <Screen onRefresh={state.reload}>
            <Notice>
              No eligible linked child selected. Return to Overview to link a
              child.
            </Notice>
          </Screen>
        )}
      </View>
      {!keyboard && (
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: "row",
            backgroundColor: "#fff",
            borderTopWidth: 1,
            borderTopColor: "#e2e8f0",
            paddingVertical: 4,
            elevation: 6,
          }}
        >
          {navigation.map((item) => {
            const active = tab === item.tab;
            return (
              <Pressable
                key={item.tab}
                accessibilityRole="tab"
                accessibilityLabel={item.title}
                accessibilityState={{ selected: active }}
                onPress={() => setTab(item.tab)}
                style={{
                  flex: 1,
                  minHeight: 52,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  paddingHorizontal: 2,
                }}
              >
                <View>
                  <Icon
                    name={item.icon}
                    color={active ? primary : "#64748b"}
                    size={22}
                  />
                  {item.tab === "Messages" && (
                    <Unread count={messaging.state.unread} />
                  )}
                </View>
                <Text
                  style={{
                    fontFamily: active ? fonts.bold : fonts.medium,
                    fontSize: 10,
                    color: active ? primary : "#64748b",
                    textAlign: "center",
                  }}
                >
                  {item.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {choosing && (
        <Dialog title="My Children" close={() => setChoosing(false)}>
          <Copy>{children.length} children synced · Select Child</Copy>
          {children.map((c) => (
            <Card key={c.student_id}>
              <Button
                secondary={child?.student_id !== c.student_id}
                title={childName(c)}
                onPress={() => select(c.student_id)}
              />
              <Copy>
                {c.section_name || c.class_name || "Section not assigned"} ·{" "}
                {c.school_year || "School year not assigned"}
              </Copy>
              <Copy>Adviser: {adviserName(c)}</Copy>
              <Badge color={c.is_active ? "#15803d" : "#64748b"}>
                {c.is_active ? "Active" : "Inactive"}
              </Badge>
            </Card>
          ))}
          <Button
            icon="add"
            title="Link Child"
            onPress={() => {
              setChoosing(false);
              setLinking(true);
            }}
          />
        </Dialog>
      )}
      {linking && (
        <LinkChild
          user={user}
          close={() => setLinking(false)}
          linked={async (id) => {
            await state.reload();
            select(id);
            setTab("Overview");
          }}
        />
      )}
    </View>
  );
}
