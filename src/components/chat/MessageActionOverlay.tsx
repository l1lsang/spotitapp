import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Animated, BackHandler, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CHAT_REACTION_OPTIONS } from '../../lib/chatReactions'
import type { ChatReactionEmoji } from '../../types/chat'
import { Text } from '../Typography'
import { p } from '../ui'

export interface MessageAction {
  key: string
  label: string
  icon: (color: string) => ReactNode
  danger?: boolean
  onPress: () => void
}

interface Props {
  visible: boolean
  /** Window Y of the long press; the message preview is centered on it when there is room. */
  anchorY: number
  mine: boolean
  timeLabel: string
  preview: ReactNode
  actions: MessageAction[]
  selectedEmoji?: ChatReactionEmoji
  reacting: boolean
  disabled: boolean
  error?: string
  onReact: (emoji: ChatReactionEmoji) => void
  onClose: () => void
}

const EDGE = 12
const GAP = 10

// Long-press layer: reaction bar above the message, a floating menu below, everything else frosted out.
// Drawn in-tree rather than in a Modal so the report/block dialogs can open straight from it.
export function MessageActionOverlay({ visible, ...props }: Props) {
  // Mounted only while open so every long press starts from fresh measurements.
  return visible ? <OverlayBody {...props} /> : null
}

function OverlayBody({ anchorY, mine, timeLabel, preview, actions, selectedEmoji, reacting, disabled, error, onReact, onClose }: Omit<Props, 'visible'>) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const root = useRef<View>(null)
  const [frame, setFrame] = useState<{ y: number; height: number } | null>(null)
  const [heights, setHeights] = useState<{ bar: number; preview: number; total: number } | null>(null)
  const [progress] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (!disabled) onClose(); return true })
    return () => sub.remove()
  }, [disabled, onClose])

  const measured = !!(frame && heights)
  useEffect(() => {
    if (!measured) return
    Animated.timing(progress, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [measured, progress])

  const minTop = insets.top + EDGE
  const maxBottom = (frame?.height ?? 0) - insets.bottom - EDGE
  let top = minTop
  if (frame && heights) {
    const localAnchor = anchorY - frame.y
    const ideal = localAnchor - heights.bar - GAP - heights.preview / 2
    top = Math.max(minTop, Math.min(ideal, maxBottom - heights.total))
  }
  const align = mine ? 'flex-end' : 'flex-start'
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] })

  return <View ref={root} style={StyleSheet.absoluteFill} onLayout={() => root.current?.measureInWindow((_x, y, _w, height) => setFrame({ y, height }))}>
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="메시지 메뉴 닫기" onPress={() => { if (!disabled) onClose() }} />
    </Animated.View>
    <Animated.View pointerEvents="box-none" style={[styles.column, { top, alignItems: align, opacity: measured ? progress : 0, maxHeight: maxBottom - minTop }]}
      onLayout={event => { const total = event.nativeEvent.layout.height; setHeights(prev => prev && prev.total === total ? prev : { bar: prev?.bar ?? 0, preview: prev?.preview ?? 0, total }) }}>
      <Animated.View accessibilityRole="toolbar" accessibilityLabel="이모지 반응" style={[styles.bar, { maxWidth: width - EDGE * 2, transform: [{ scale }] }]}
        onLayout={event => { const bar = event.nativeEvent.layout.height; setHeights(prev => ({ total: prev?.total ?? 0, preview: prev?.preview ?? 0, bar })) }}>
        {CHAT_REACTION_OPTIONS.map(option => {
          const selected = selectedEmoji === option.emoji
          return <Pressable key={option.emoji} accessibilityRole="button" accessibilityLabel={`${option.label} ${selected ? '반응 취소' : '반응하기'}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onReact(option.emoji)}
            style={({ pressed }) => [styles.emoji, selected && styles.emojiSelected, pressed && { transform: [{ scale: 1.18 }] }, disabled && { opacity: 0.5 }]}>
            <Text style={styles.emojiText}>{option.emoji}</Text>
          </Pressable>
        })}
        {reacting ? <ActivityIndicator size="small" color={p.primary} accessibilityLabel="반응 저장 중" style={styles.reacting} /> : null}
      </Animated.View>
      <View pointerEvents="none" style={styles.preview} onLayout={event => { const preview = event.nativeEvent.layout.height; setHeights(prev => ({ total: prev?.total ?? 0, bar: prev?.bar ?? 0, preview })) }}>{preview}</View>
      <Animated.View accessibilityRole="menu" style={[styles.menu, { transform: [{ scale }] }]}>
        <ScrollView bounces={false} contentContainerStyle={{ paddingVertical: 8 }}>
          <Text style={styles.time}>{timeLabel}</Text>
          {actions.map(action => {
            const color = action.danger ? p.danger : p.ink
            return <Pressable key={action.key} accessibilityRole="menuitem" accessibilityState={{ disabled }} disabled={disabled} onPress={action.onPress}
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: p.surface }, disabled && { opacity: 0.5 }]}>
              <View style={styles.icon}>{action.icon(color)}</View>
              <Text style={[styles.label, { color }]}>{action.label}</Text>
            </Pressable>
          })}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  </View>
}

const styles = StyleSheet.create({
  // Frosted look without a blur dependency: the conversation stays faintly visible behind.
  backdrop: { backgroundColor: '#FAFAF8E8' },
  column: { position: 'absolute', left: EDGE, right: EDGE, gap: GAP },
  bar: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 40, backgroundColor: p.paper, boxShadow: '0 8px 32px #19211D24' },
  emoji: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  emojiSelected: { backgroundColor: p.surface },
  emojiText: { fontSize: 32, lineHeight: 40 },
  reacting: { position: 'absolute', right: 10, top: 6 },
  preview: { maxWidth: '86%' },
  menu: { width: 248, flexShrink: 1, borderRadius: 22, backgroundColor: p.paper, boxShadow: '0 12px 40px #19211D29', overflow: 'hidden' },
  time: { color: p.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, paddingHorizontal: 20 },
  icon: { width: 24, alignItems: 'center' },
  label: { flex: 1, fontSize: 16, fontWeight: '500' },
  error: { color: p.danger, fontSize: 13, lineHeight: 19, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4 },
})
