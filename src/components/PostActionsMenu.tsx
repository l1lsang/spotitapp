import { useRef, useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Typography';
import { ArrowUpRight, Ban, Flag, Menu, Pencil, Share2, ShieldAlert, Trash2 } from 'lucide-react-native'
import { ReportDialog } from './ReportButton'
import { BlockUserDialog } from './BlockUserDialog'
import type { BlockTarget } from '../services/blockService'
import { IconButton, elevation, p } from './ui'
import type { ReportTarget } from '../types/moderation'
import type { Post } from '../types/post'

type MenuItem = { label: string; Icon: typeof Pencil; danger?: boolean; onPress: () => void }
type Anchor = { top: number; right: number }

// Owner: edit → share → delete. Signed-in visitor: share, pin report, author report, block. Guest: share.
// Lists such as the feed add onOpen (view details) and leave deletion to the detail screen.
export function PostActionsMenu({ post, isOwner, canReport, busy, onOpen, onEdit, onShare, onDelete, triggerStyle }: {
  post: Post; isOwner: boolean; canReport: boolean; busy: boolean
  onOpen?: () => void; onEdit: () => void; onShare: () => void; onDelete?: () => void
  triggerStyle?: StyleProp<ViewStyle>
}) {
  const { width } = useWindowDimensions()
  const trigger = useRef<View>(null)
  const pending = useRef<(() => void) | null>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null)
  const items: MenuItem[] = [
    ...(onOpen ? [{ label: '자세히 보기', Icon: ArrowUpRight, onPress: onOpen }] : []),
    ...(isOwner ? [{ label: '수정', Icon: Pencil, onPress: onEdit }] : []),
    { label: '공유', Icon: Share2, onPress: onShare },
    ...(isOwner && onDelete ? [{ label: '삭제', Icon: Trash2, danger: true, onPress: onDelete }] : []),
    ...(canReport ? [
      { label: '핀 신고', Icon: Flag, onPress: () => setReportTarget({ kind: 'pin', targetId: post.id, label: post.title }) },
      { label: '작성자 신고', Icon: ShieldAlert, onPress: () => setReportTarget({ kind: 'user', targetId: post.uid, label: post.authorNickname }) },
      { label: '작성자 차단', Icon: Ban, danger: true, onPress: () => setBlockTarget({ uid: post.uid, nickname: post.authorNickname }) },
    ] : []),
  ]

  function open() {
    trigger.current?.measureInWindow((x, y, w, h) => setAnchor({ top: y + h + 8, right: Math.max(16, width - x - w) }))
  }
  // Run the chosen action once the menu has left the screen, so dialogs and alerts can present.
  function flush() {
    const action = pending.current
    pending.current = null
    action?.()
  }
  function select(action: () => void) {
    pending.current = action
    setAnchor(null)
    if (Platform.OS !== 'ios') setTimeout(flush, 0)
  }

  return <>
    <View ref={trigger} collapsable={false} style={[styles.trigger, triggerStyle]}>
      <IconButton label="기록 더보기" disabled={busy} selected={!!anchor} onPress={open}><Menu size={22} color={p.muted} strokeWidth={1.8} /></IconButton>
    </View>
    <Modal visible={!!anchor} transparent animationType="none" statusBarTranslucent onRequestClose={() => setAnchor(null)} onDismiss={flush}>
      <Pressable accessibilityLabel="기록 메뉴 닫기" style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)} />
      {anchor && <View accessibilityRole="menu" accessibilityLabel="기록 메뉴" style={[styles.menu, elevation.menu, { top: anchor.top, right: anchor.right, maxWidth: width - 32 }]}>
        {items.map(({ label, Icon, danger, onPress }) => <Pressable key={label} accessibilityRole="menuitem" onPress={() => select(onPress)}
          style={({ pressed }) => [styles.item, pressed && { backgroundColor: danger ? p.errorSoft : p.surface }]}>
          <Icon size={18} color={danger ? p.danger : p.ink} /><Text style={[styles.label, danger && { color: p.danger }]}>{label}</Text>
        </Pressable>)}
      </View>}
    </Modal>
    {reportTarget && <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />}
    {blockTarget && <BlockUserDialog target={blockTarget} onClose={() => setBlockTarget(null)} />}
  </>
}

const styles = StyleSheet.create({
  trigger: { flexShrink: 0, marginRight: 16 },
  menu: { position: 'absolute', width: 180, padding: 4, borderRadius: 6, backgroundColor: p.paper },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 },
  label: { color: p.ink, fontSize: 14 },
})
