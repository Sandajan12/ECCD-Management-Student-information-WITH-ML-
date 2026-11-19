import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  AppState,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthScreen } from "./src/AuthScreen";
import { ChildPortal } from "./src/ChildPortal";
import { baseUrl, session } from "./src/session";
import {
  BrandColor,
  SchoolBrand,
  Button,
  Card,
  Copy,
  Loading,
  Notice,
  Title,
  styles,
  usePullRefresh,
} from "./src/ui";
import type { Branding } from "./src/contracts";

const fallback: Branding = {
  system_name: "AMES Parent",
  primary_color: "#4543c0",
  logo_url: null,
};
function Content() {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const [brand, setBrand] = useState<Branding>(fallback);
  const [signingOut, setSigningOut] = useState(false);
  const pull = usePullRefresh(() => session.restore());
  const loginMessage =
    state.message ===
    "No refresh session is available. Please sign in again."
      ? ""
      : state.message;
  useEffect(() => {
    void session.restore();
    void fetch(`${baseUrl}/api/settings`)
      .then(async (r) => {
        if (!r.ok) return;
        const value = (await r.json()) as Branding;
        setBrand({
          system_name:
            typeof value.system_name === "string" && value.system_name.trim()
              ? value.system_name
              : fallback.system_name,
          primary_color: /^#[0-9a-f]{6}$/i.test(value.primary_color)
            ? value.primary_color
            : fallback.primary_color,
          logo_url:
            typeof value.logo_url === "string" &&
            /^data:image\/(png|jpeg|webp);base64,/i.test(value.logo_url)
              ? value.logo_url
              : null,
        });
      })
      .catch(() => {});
    const timer = setInterval(() => {
      if (AppState.currentState === "active")
        void session.renewIfNeeded().catch(() => {});
    }, 30000);
    const listener = AppState.addEventListener("change", (value) => {
      if (value === "active") void session.renewIfNeeded().catch(() => {});
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);
  const logout = async () => {
    setSigningOut(true);
    try {
      await session.logout();
    } finally {
      setSigningOut(false);
    }
  };
  const parent = state.session?.user.role === "user";
  return (
    <SchoolBrand.Provider value={brand}>
      <BrandColor.Provider value={brand.primary_color}>
        <SafeAreaView
          edges={["left", "right", "bottom"]}
          style={[
            styles.page,
            { backgroundColor: parent ? "#ffffff" : "#f4f5f7" },
          ]}
        >
          <StatusBar
            barStyle={parent ? "light-content" : "dark-content"}
            backgroundColor={parent ? "#111827" : "#f4f5f7"}
          />
          <SafeAreaView
            edges={["top"]}
            style={{ backgroundColor: parent ? "#111827" : "#f4f5f7" }}
          />
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {state.loading || signingOut ? (
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  backgroundColor: "#f8fafc",
                }}
              >
                <Loading />
              </View>
            ) : parent && state.session ? (
              <View style={{ flex: 1, backgroundColor: "#fff" }}>
                {!!state.message && <Notice>{state.message}</Notice>}
                <ChildPortal
                  key={state.session.user.id}
                  user={state.session.user}
                  logout={() => void logout()}
                />
              </View>
            ) : (
              <ImageBackground
                source={require("./assets/auth-background.webp")}
                blurRadius={3}
                style={{ flex: 1 }}
              >
                <View style={{ flex: 1, backgroundColor: "#00000066" }}>
                  <ScrollView
                    contentContainerStyle={[
                      styles.content,
                      {
                        flexGrow: 1,
                        justifyContent: "center",
                        maxWidth: 480,
                        paddingVertical: 32,
                      },
                    ]}
                    alwaysBounceVertical
                    refreshControl={
                      !state.session ? (
                        <RefreshControl
                          refreshing={pull.refreshing}
                          onRefresh={pull.onRefresh}
                          colors={[brand.primary_color]}
                          tintColor={brand.primary_color}
                          accessibilityLabel="Pull down to refresh"
                        />
                      ) : undefined
                    }
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                  >
                    {!!loginMessage && <Notice>{loginMessage}</Notice>}
                    {!state.session ? (
                      <AuthScreen />
                    ) : (
                      <>
                        <Card>
                          <Title>For parent accounts</Title>
                          <Copy>
                            You signed in with a Teacher or Chairman account.
                            AMES Parent supports parent accounts only. Switch
                            accounts to continue.
                          </Copy>
                          <Button
                            title="Switch Account (Logout)"
                            onPress={() => void logout()}
                          />
                        </Card>
                      </>
                    )}
                  </ScrollView>
                </View>
              </ImageBackground>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </BrandColor.Provider>
    </SchoolBrand.Provider>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Content />
    </SafeAreaProvider>
  );
}
