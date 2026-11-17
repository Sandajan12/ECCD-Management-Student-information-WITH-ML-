import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  StyleProp,
  TextInputProps,
  TextStyle,
  ViewStyle,
} from "react-native";
import type { Branding, Period } from "./contracts";
import { PERIODS } from "./contracts";

export const palette = {
  primary: "#4543c0",
  secondary: "#1e1e2f",
  background: "#f8fafc",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
};
export const BrandColor = createContext(palette.primary);
export const SchoolBrand = createContext<Branding>({
  system_name: "AMES Parent",
  primary_color: palette.primary,
  logo_url: null,
});
export const fonts = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semibold: "Poppins-SemiBold",
  bold: "Poppins-Bold",
};
// Bundled vector font outlines match the website's MUI icons without a runtime library.
const glyphs = {
  home: "\ue88a",
  child: "\ue7fd",
  checklist: "\ue85d",
  insights: "\ue65f",
  messages: "\ue0b7",
  lock: "\ue897",
  check: "\ue86c",
  warning: "\ue002",
  info: "\ue88e",
  email: "\ue0be",
  eye: "\ue8f4",
  eyeOff: "\ue8f5",
  back: "\ue5c4",
  down: "\ue5cf",
  up: "\ue5ce",
  close: "\ue5cd",
  add: "\ue145",
  logout: "\ue9ba",
  send: "\ue163",
  save: "\ue161",
  school: "\ue80c",
  star: "\ue838",
  support: "\ue8b4",
  clock: "\ue8b5",
  sync: "\ue627",
  cloud: "\ue2bd",
  phone: "\ue0cd",
  address: "\ue0c8",
  doneAll: "\ue877",
} as const;
export type IconName = keyof typeof glyphs;
export function Icon({
  name,
  size = 22,
  color = palette.muted,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Text
      accessible={false}
      style={{
        fontFamily: "MaterialIcons",
        fontSize: size,
        lineHeight: size + 2,
        color,
        includeFontPadding: false,
      }}
    >
      {glyphs[name]}
    </Text>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  color,
  disabled,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 24,
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <Icon name={name} color={color} />
    </Pressable>
  );
}
export function Seal({ size = 64 }: { size?: number }) {
  const brand = useContext(SchoolBrand),
    [failed, setFailed] = useState(false);
  return (
    <Image
      accessibilityLabel="School seal"
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#fff",
        resizeMode: "contain",
      }}
      source={
        brand.logo_url && !failed
          ? { uri: brand.logo_url }
          : require("../assets/school-seal.png")
      }
    />
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Title({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text accessibilityRole="header" style={[styles.title, style]}>
      {children}
    </Text>
  );
}
export function Label({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}
export function Copy({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.copy, style]}>{children}</Text>;
}
export function Notice({
  children,
  error = false,
  tone,
}: {
  children: React.ReactNode;
  error?: boolean;
  tone?: "info" | "success" | "warning";
}) {
  const color = error
    ? "#b91c1c"
    : tone === "success"
      ? "#15803d"
      : tone === "warning"
        ? "#a16207"
        : "#475569";
  return (
    <View
      style={[
        styles.notice,
        {
          backgroundColor: error
            ? "#fef2f2"
            : tone === "success"
              ? "#f0fdf4"
              : tone === "warning"
                ? "#fffbeb"
                : "#eff6ff",
        },
      ]}
    >
      <Icon
        name={
          error || tone === "warning"
            ? "warning"
            : tone === "success"
              ? "check"
              : "info"
        }
        size={19}
        color={color}
      />
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.copy, { flex: 1, color, fontSize: 12, lineHeight: 19 }]}
      >
        {children}
      </Text>
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
  icon,
  color,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  icon?: IconName;
  color?: string;
}) {
  const primary = useContext(BrandColor),
    active = color || primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? `${active}0d` : active,
          borderColor: secondary ? `${active}35` : active,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {!!icon && (
        <Icon name={icon} color={secondary ? active : "#fff"} size={18} />
      )}
      <Text
        style={[
          styles.buttonText,
          { color: secondary ? active : "#fff", flexShrink: 1 },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Input({
  label,
  error,
  helper,
  icon,
  secureTextEntry,
  style,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  helper?: string;
  icon?: IconName;
}) {
  const color = useContext(BrandColor),
    [focused, setFocused] = useState(false),
    [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputBox,
          {
            borderColor: error ? "#dc2626" : focused ? color : "#cbd5e1",
            backgroundColor: props.editable === false ? "#f8fafc" : "#fff",
          },
        ]}
      >
        {!!icon && (
          <Icon name={icon} size={20} color={focused ? color : palette.muted} />
        )}
        <TextInput
          {...props}
          secureTextEntry={secureTextEntry && !visible}
          accessibilityLabel={label}
          accessibilityHint={error || helper}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          placeholderTextColor="#94a3b8"
          selectionColor={color}
          style={[
            styles.input,
            props.multiline && { minHeight: 64, textAlignVertical: "top" },
            style,
          ]}
        />
        {secureTextEntry && (
          <IconButton
            name={visible ? "eyeOff" : "eye"}
            label={visible ? "Hide password" : "Show password"}
            onPress={() => setVisible(!visible)}
          />
        )}
      </View>
      {!!(error || helper) && (
        <Copy
          style={{
            fontSize: 11,
            lineHeight: 17,
            color: error ? "#b91c1c" : palette.muted,
          }}
        >
          {error || helper}
        </Copy>
      )}
    </View>
  );
}
export function Badge({
  children,
  color,
  icon,
}: {
  children: React.ReactNode;
  color?: string;
  icon?: IconName;
}) {
  const primary = useContext(BrandColor),
    active = color || primary;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: `${active}0e`, borderColor: `${active}25` },
      ]}
    >
      {icon && <Icon name={icon} size={13} color={active} />}
      <Text
        style={{
          fontFamily: fonts.medium,
          color: active,
          fontSize: 11,
          flexShrink: 1,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function Progress({
  value,
  color,
  label,
}: {
  value: number | null;
  color?: string;
  label: string;
}) {
  const primary = useContext(BrandColor),
    percent = Math.min(100, Math.max(0, value || 0));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={styles.progress}
    >
      <View
        style={{
          height: "100%",
          width: `${percent}%`,
          backgroundColor: color || primary,
          borderRadius: 8,
        }}
      />
    </View>
  );
}
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const primary = useContext(BrandColor);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${primary}12`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.semibold,
          fontSize: size * 0.38,
          color: primary,
        }}
      >
        {name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((word) => word[0])
          .join("")
          .toUpperCase() || "?"}
      </Text>
    </View>
  );
}
export function Heading({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
}) {
  const primary = useContext(BrandColor);
  return (
    <View style={{ gap: 5 }}>
      <View style={styles.row}>
        {icon && <Icon name={icon} color={primary} />}
        <Title style={{ flexShrink: 1 }}>{title}</Title>
      </View>
      {subtitle && <Copy>{subtitle}</Copy>}
    </View>
  );
}
export function PeriodTabs({
  value,
  onChange,
  disabled,
}: {
  value: Period;
  onChange: (period: Period) => void;
  disabled?: boolean;
}) {
  return (
    <Segments
      options={PERIODS.map((p) => ({
        value: p,
        label:
          p === "PRE"
            ? "PRE · Pretest"
            : p === "MID"
              ? "MID · Midtest"
              : "POST · Posttest",
      }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
export function Segments<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const color = useContext(BrandColor);
  return (
    <View accessibilityRole="tablist" style={styles.segments}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option.value, disabled }}
          disabled={disabled}
          onPress={() => onChange(option.value)}
          style={[
            styles.segment,
            value === option.value && { backgroundColor: "#fff", elevation: 1 },
          ]}
        >
          <Text
            style={{
              fontFamily:
                value === option.value ? fonts.semibold : fonts.medium,
              fontSize: 11,
              textAlign: "center",
              color: value === option.value ? color : palette.muted,
            }}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function usePullRefresh(action?: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const flight = useRef<Promise<void> | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const onRefresh = () => {
    if (!action || flight.current) return;
    setRefreshing(true);
    // Resource and messaging loaders surface their own error/permission states.
    flight.current = Promise.resolve()
      .then(action)
      .catch(() => {})
      .finally(() => {
        flight.current = null;
        if (mounted.current) setRefreshing(false);
      });
  };
  return { refreshing, onRefresh };
}
export function Screen({
  children,
  footer,
  onRefresh,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  onRefresh?: () => Promise<void>;
}) {
  const color = useContext(BrandColor),
    pull = usePullRefresh(onRefresh);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.content, { flexGrow: 1 }]}
        alwaysBounceVertical
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              colors={[color]}
              tintColor={color}
              accessibilityLabel="Pull down to refresh"
            />
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
      {footer && <View style={styles.actionBar}>{footer}</View>}
    </View>
  );
}
export function Dialog({
  title,
  children,
  close,
  locked = false,
  footer,
  closeLabel = "Close dialog (keep draft)",
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  locked?: boolean;
  footer?: React.ReactNode;
  closeLabel?: string;
}) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => {
        if (!locked) close();
      }}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.scrim}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View accessibilityViewIsModal style={styles.dialog}>
          <View
            style={[
              styles.row,
              {
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingTop: 12,
              },
            ]}
          >
            <Title style={{ flex: 1 }}>{title}</Title>
            <IconButton
              name="close"
              label={closeLabel}
              disabled={locked}
              onPress={close}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingTop: 12, gap: 16 }}
          >
            {children}
          </ScrollView>
          {footer && (
            <View style={{ padding: 20, paddingTop: 12 }}>{footer}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const ref = useRef<TextInput>(null),
    color = useContext(BrandColor),
    [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel="Enter 6-digit verification code"
      onPress={() => ref.current?.focus()}
      style={{ position: "relative" }}
    >
      <View
        pointerEvents="none"
        style={[styles.row, { gap: 7, flexWrap: "nowrap" }]}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              minHeight: 52,
              borderWidth: 1,
              borderColor:
                focused && i === Math.min(value.length, 5) ? color : "#cbd5e1",
              borderRadius: 8,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: fonts.semibold,
                fontSize: 23,
                color: palette.text,
              }}
            >
              {value[i] || ""}
            </Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, "").slice(0, 6))}
        editable={!disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        accessibilityLabel="6-digit verification code"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          opacity: 0.02,
          color: "transparent",
        }}
        caretHidden
      />
    </Pressable>
  );
}
export function Loading() {
  return (
    <ActivityIndicator
      accessibilityLabel="Loading"
      color={useContext(BrandColor)}
      style={styles.loading}
    />
  );
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  content: {
    padding: 14,
    gap: 14,
    paddingBottom: 24,
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
  },
  card: {
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0cc",
    elevation: 1,
    shadowColor: "#0f172a",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    lineHeight: 27,
    color: palette.text,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 21,
    color: palette.text,
  },
  copy: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 20,
    color: palette.muted,
  },
  notice: {
    padding: 12,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  field: { gap: 6 },
  inputBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingLeft: 12,
    paddingRight: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: "#333333",
  },
  button: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  buttonText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: "#fff",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  loading: { padding: 16 },
  seal: { width: 76, height: 76, resizeMode: "contain", alignSelf: "center" },
  center: { textAlign: "center" },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
  },
  progress: {
    height: 7,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    overflow: "hidden",
  },
  segments: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
  },
  segment: {
    flex: 1,
    padding: 8,
    minHeight: 44,
    borderRadius: 8,
    justifyContent: "center",
  },
  actionBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 7,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  scrim: {
    flex: 1,
    backgroundColor: "#0f172a88",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    borderRadius: 16,
    backgroundColor: "#fff",
    elevation: 12,
    overflow: "hidden",
  },
});
