import { type PropsWithChildren, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, ChevronRight } from "lucide-react-native";

export const p = {
  bg: "#F5F4EE",
  paper: "#FFFEFA",
  surface: "#ECEDE6",
  primary: "#356F68",
  primarySoft: "#DCE9E5",
  coral: "#DF7658",
  ink: "#252824",
  muted: "#6F746D",
  line: "#DADCD4",
  olive: "#81905A",
};
export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.bg },
  content: { padding: 20, gap: 16, paddingBottom: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  card: {
    backgroundColor: p.paper,
    borderColor: p.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: "700", color: p.ink },
  text: { fontSize: 15, lineHeight: 23, color: p.ink },
  muted: { fontSize: 13, lineHeight: 20, color: p.muted },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: p.paper,
    color: p.ink,
    fontSize: 16,
  },
});
export function Txt({ style, ...props }: TextProps) {
  return <Text {...props} style={[s.text, style]} />;
}
export function H({ children }: PropsWithChildren) {
  return <Text style={s.title}>{children}</Text>;
}
export function Screen({
  title,
  children,
  scroll = true,
  right,
  back = false,
  refreshing = false,
  onRefresh,
}: PropsWithChildren<{
  title?: string;
  scroll?: boolean;
  right?: ReactNode;
  back?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}>) {
  return (
    <SafeAreaView style={s.page} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {!!title && (
          <View
            style={{
              ...s.between,
              paddingHorizontal: 20,
              paddingVertical: 15,
              borderBottomWidth: 1,
              borderColor: p.line,
            }}
          >
            <View style={s.row}>
              {back && (
                <Pressable
                  accessibilityLabel="뒤로"
                  onPress={() =>
                    router.canGoBack() ? router.back() : router.replace("/map")
                  }
                  style={{ padding: 6 }}
                >
                  <ArrowLeft color={p.ink} size={22} />
                </Pressable>
              )}
              <Text style={{ fontWeight: "700", fontSize: 21, color: p.ink }}>
                {title}
              </Text>
            </View>
            {right}
          </View>
        )}
        {scroll ? (
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={p.primary}
                />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
}) {
  const color = variant === "secondary" ? p.primary : p.paper;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        backgroundColor:
          variant === "secondary"
            ? p.primarySoft
            : variant === "danger"
              ? p.coral
              : p.primary,
        opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {loading && <ActivityIndicator color={color} />}
      <Text style={{ fontSize: 15, fontWeight: "600", color }}>{title}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 7 }}>
      {!!label && (
        <Text style={{ fontSize: 13, fontWeight: "600", color: p.muted }}>
          {label}
        </Text>
      )}
      <TextInput
        placeholderTextColor={p.muted}
        accessibilityLabel={label}
        {...props}
        style={[
          s.input,
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
          style,
        ]}
      />
    </View>
  );
}
export function Notice({
  children,
  error = false,
}: PropsWithChildren<{ error?: boolean }>) {
  if (!children) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: 14,
        borderRadius: 12,
        backgroundColor: error ? "#F4DDD5" : p.primarySoft,
      }}
    >
      <Text
        style={{
          color: error ? "#903E29" : p.primary,
          fontSize: 14,
          lineHeight: 21,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 42, gap: 10 }}>
      <Text
        style={{
          color: p.ink,
          fontSize: 17,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {description && (
        <Text style={[s.muted, { textAlign: "center" }]}>{description}</Text>
      )}
    </View>
  );
}
export function Avatar({
  uri,
  name = "스팟잇",
  size = 44,
}: {
  uri?: string;
  name?: string;
  size?: number;
}) {
  return uri ? (
    <Image
      source={{ uri }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: p.surface,
      }}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: p.primarySoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{ color: p.primary, fontSize: size * 0.36, fontWeight: "600" }}
      >
        {name.slice(0, 1)}
      </Text>
    </View>
  );
}
export function Row({
  title,
  subtitle,
  onPress,
  right,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={{
        ...s.between,
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderColor: p.line,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Txt>{title}</Txt>
        {subtitle && <Text style={s.muted}>{subtitle}</Text>}
      </View>
      {right ?? (onPress ? <ChevronRight size={19} color={p.muted} /> : null)}
    </Pressable>
  );
}
export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: selected ? p.primary : p.line,
        backgroundColor: selected ? p.primarySoft : p.paper,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: selected ? p.primary : p.muted,
          fontWeight: selected ? "600" : "400",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
