import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, Plus, UsersRound, X } from 'lucide-react-native';
import { Text } from '../Typography';
import { p } from '../ui';

const ACTIONS = [
  { key: 'group', title: '단체방', description: '여러 친구를 초대해 함께 대화', Icon: UsersRound },
  { key: 'direct', title: '1:1 채팅', description: '친구 한 명과 바로 대화', Icon: MessageCircle },
] as const;

// One floating button starts both 1:1 chats and group rooms.
export function NewChatFab({ onGroup, onDirect }: { onGroup: () => void; onDirect: () => void }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const position = width > 860 ? { right: 24, bottom: 24 } : { right: 16, bottom: Math.max(6, insets.bottom) + 80 };
  function choose(key: (typeof ACTIONS)[number]['key']) {
    setOpen(false);
    if (key === 'group') onGroup(); else onDirect();
  }
  const fab = (expanded: boolean) => <Pressable accessibilityRole="button" accessibilityLabel={expanded ? '새 채팅 메뉴 닫기' : '새 채팅'} accessibilityState={{ expanded }}
    onPress={() => setOpen(!expanded)} style={({ pressed }) => [f.fab, pressed && { backgroundColor: p.primaryHover }]}>
    {expanded ? <X size={26} color={p.paper} /> : <Plus size={26} color={p.paper} />}
  </Pressable>;
  return <>
    <View pointerEvents="box-none" style={[f.area, position]}>{fab(false)}</View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable accessibilityLabel="새 채팅 메뉴 닫기" onPress={() => setOpen(false)} style={[StyleSheet.absoluteFill, f.backdrop]} />
      <View pointerEvents="box-none" style={[f.area, position]}>
        <View accessibilityLabel="새 채팅 종류" style={f.actions}>{ACTIONS.map(({ key, title, description, Icon }) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${title}, ${description}`} onPress={() => choose(key)} style={f.action}>
          {({ pressed }) => <>
            <View style={f.label}><Text style={f.labelTitle}>{title}</Text><Text style={f.labelText}>{description}</Text></View>
            <View style={[f.actionIcon, pressed && { backgroundColor: p.primarySoft }]}><Icon size={22} color={p.primary} /></View>
          </>}
        </Pressable>)}</View>
        {fab(true)}
      </View>
    </Modal>
  </>;
}

const f = StyleSheet.create({
  area: { position: 'absolute', alignItems: 'flex-end', gap: 16 },
  backdrop: { backgroundColor: '#161F1B73' },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primary, boxShadow: '0 6px 18px #161F1B42' },
  // 48px circles sit on the 56px button's centre line.
  actions: { alignItems: 'flex-end', gap: 16, paddingRight: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { alignItems: 'flex-end', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: p.paper, boxShadow: '0 4px 12px #161F1B29' },
  labelTitle: { color: p.ink, fontSize: 14, lineHeight: 21, fontWeight: '700' }, labelText: { color: p.muted, fontSize: 12, lineHeight: 18 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: p.paper, boxShadow: '0 4px 12px #161F1B2E' },
});
