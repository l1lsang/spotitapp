import { createContext, useContext, useState, type PropsWithChildren, type ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle, type TextInputProps, type TextProps } from 'react-native';
import { Text, TextInput } from './Typography';
import { RemoteImage } from './RemoteImage';
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, ChevronRight, Search } from "lucide-react-native";

import { FormScrollView, KeyboardPane } from './keyboard';
import { palette, layout, shadows, shape } from '../constants/design';

export const p = palette;
/** Dialogs and settings forms: secondary buttons lose their outline, inputs use a soft fill. */
export const QuietSurface = createContext(false);
export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.bg },
  content: { paddingHorizontal: 16, paddingTop: 32, gap: 24, paddingBottom: 112, width: '100%', maxWidth: layout.content + 48, alignSelf: 'center' },
  section: { paddingVertical: 24, gap: 16, borderBottomWidth: 1, borderColor: p.line },
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
    borderRadius: shape.control,
    padding: 20,
    gap: 16,
  },
  title: { fontSize: 29, lineHeight: 38, letterSpacing: -1.1, fontWeight: "600", color: p.ink, flexShrink: 1 },
  text: { fontSize: 16, lineHeight: 26, color: p.ink },
  muted: { fontSize: 13, lineHeight: 20, color: p.muted },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: shape.control,
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
  safeTop = false,
  avoidKeyboard = !scroll,
  contentStyle,
  maxWidth,
}: PropsWithChildren<{
  title?: string;
  scroll?: boolean;
  right?: ReactNode;
  back?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  safeTop?: boolean;
  avoidKeyboard?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  maxWidth?: number;
}>) {
  const { width } = useWindowDimensions();
  const roomy = width > layout.desktop;
  return (
    <SafeAreaView style={s.page} edges={safeTop ? ["top", "left", "right"] : ["left", "right"]}>
      <KeyboardPane enabled={avoidKeyboard}>
        {!!title && (
          <View
            style={{
              ...s.between,
              paddingHorizontal: roomy ? 24 : 16,
              paddingTop: 24, paddingBottom: 20,
              width: '100%', maxWidth: maxWidth ?? layout.content + 48, alignSelf: 'center',
            }}
          >
            <View style={[s.row, { flex: 1, minWidth: 0 }]}>
              {back && (
                <Pressable
                  accessibilityLabel="뒤로"
                  onPress={() =>
                    router.canGoBack() ? router.back() : router.replace("/map")
                  }
                  style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
                >
                  <ArrowLeft color={p.ink} size={22} />
                </Pressable>
              )}
              <Text accessibilityRole="header" style={s.title}>
                {title}
              </Text>
            </View>
            {right}
          </View>
        )}
        {scroll ? (
          <FormScrollView
            contentContainerStyle={[s.content, roomy && { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 72 }, maxWidth ? { maxWidth } : undefined, contentStyle]}
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
          </FormScrollView>
        ) : (
          children
        )}
      </KeyboardPane>
    </SafeAreaView>
  );
}
export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  style,
  tone,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Secondary only: outline (default), plain (no border, paper fill) or ghost (no border, no fill). */
  tone?: "outline" | "plain" | "ghost";
}) {
  const [hovered, setHovered] = useState(false);
  const quiet = useContext(QuietSurface);
  const color = variant === "secondary" ? p.ink : p.paper;
  const secondaryTone = tone ?? (quiet ? "ghost" : "outline");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [{
        minHeight: 44, maxWidth: '100%',
        paddingVertical: 10,
        paddingHorizontal: 17,
        borderRadius: shape.control,
        borderWidth: variant === 'secondary' && secondaryTone === 'outline' ? 1 : 0,
        borderColor: hovered ? p.muted : p.line,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        backgroundColor:
          variant === "secondary"
            ? hovered || pressed ? p.surface : secondaryTone === 'ghost' ? p.transparent : p.paper
            : variant === "danger"
              ? p.danger
              : pressed || hovered ? p.primaryHover : p.primary,
        opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1,
      }, style]}
    >
      {loading && <ActivityIndicator color={color} />}
      {!loading && icon}
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color, flexShrink: 1 }}>{title}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  style,
  icon,
  ...props
}: TextInputProps & { label?: string; icon?: ReactNode }) {
  const [focused, setFocused] = useState(false);
  const quiet = useContext(QuietSurface);
  return (
    <View style={{ gap: 7 }}>
      {!!label && (
        <Text style={{ fontSize: 14, fontWeight: "500", color: p.ink }}>
          {label}
        </Text>
      )}
      <View style={{ position: 'relative' }}>
      {!!icon && <View pointerEvents="none" style={{ position: 'absolute', left: 13, top: 14, zIndex: 1 }}>{icon}</View>}
      <TextInput
        placeholderTextColor={p.light}
        accessibilityLabel={label}
        {...props}
        onFocus={event => { setFocused(true); props.onFocus?.(event); }}
        onBlur={event => { setFocused(false); props.onBlur?.(event); }}
        style={[
          s.input,
          quiet && { borderColor: p.transparent, backgroundColor: p.surface },
          focused && { borderColor: p.primary },
          props.editable === false && { backgroundColor: p.surface, color: p.muted },
          !!icon && { paddingLeft: 40 },
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
          style,
        ]}
      />
      </View>
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
        borderRadius: shape.control,
        backgroundColor: error ? p.errorSoft : p.primarySoft,
      }}
    >
      <Text
        style={{
          color: error ? p.danger : p.primary,
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
  name = "피노리",
  size = 44,
  radius,
}: {
  uri?: string;
  name?: string;
  size?: number;
  radius?: number;
}) {
  return uri ? (
    <RemoteImage
      uri={uri}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? size / 2,
        backgroundColor: p.surface,
      }}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? size / 2,
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
        minHeight: 44, justifyContent: 'center', borderRadius: shape.control,
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
/** Search inputs sit on a soft fill without an outline (people, feed, groups, invites). */
export function SearchBox({ right, style, ...props }: TextInputProps & { right?: ReactNode }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.row, { minHeight: 48, paddingLeft: 14, paddingRight: right ? 4 : 14, borderRadius: shape.control, backgroundColor: p.surface, borderWidth: 1, borderColor: focused ? p.primary : p.transparent }, style]}>
      <Search size={18} color={p.muted} />
      <TextInput
        placeholderTextColor={p.muted}
        returnKeyType="search"
        {...props}
        onFocus={event => { setFocused(true); props.onFocus?.(event); }}
        onBlur={event => { setFocused(false); props.onBlur?.(event); }}
        style={{ flex: 1, minWidth: 0, color: p.ink, fontSize: 15, paddingVertical: 12 }}
      />
      {right}
    </View>
  );
}
/**
 * 44px icon control. round: white circle (feed, album, group share); ghost: transparent circle
 * that fills on press (more menus, chat back); surface: soft 12px tile (chat room tools).
 */
export function IconButton({
  label,
  onPress,
  children,
  variant = "ghost",
  disabled = false,
  selected = false,
  size = 44,
  style,
}: PropsWithChildren<{
  label: string;
  onPress: () => void;
  variant?: "round" | "ghost" | "surface";
  disabled?: boolean;
  selected?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, expanded: selected || undefined }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [{
        width: size, height: size, flexShrink: 0, alignItems: "center", justifyContent: "center",
        borderRadius: variant === "surface" ? 12 : size / 2,
        backgroundColor: variant === "round" ? p.paper : variant === "surface" ? p.surface : pressed || selected ? p.surface : p.transparent,
        opacity: disabled ? 0.45 : pressed && variant !== "ghost" ? 0.75 : 1,
      }, style]}
    >
      {children}
    </Pressable>
  );
}
export const elevation = { menu: { boxShadow: shadows.map }, dialog: { boxShadow: shadows.dialog } } as const;
