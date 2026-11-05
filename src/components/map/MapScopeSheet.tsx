import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowRight, Check, Compass, X } from 'lucide-react-native';
import { Text } from '../Typography';
import { IconButton, elevation, p } from '../ui';
import { controlShadow } from './MapControls';
import type { PinGroup } from '../../types/group';

// Popover beside the control rail on wide screens, a bottom sheet on phones.
export function MapScopeSheet({ visible, groups, currentGroupId, loading, error, right, bottom, onRetry, onSelect, onClose }: {
  visible: boolean; groups: PinGroup[]; currentGroupId: string; loading: boolean; error: string;
  right: number; bottom: number; onRetry: () => void; onSelect: (groupId: string) => void; onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const phone = width <= 860;
  const options = [
    { id: '', name: '내 지도 · 나와 팔로잉', detail: '내 핀과 팔로우한 사람들의 핀' },
    ...groups.map(group => ({ id: group.id, name: group.name, detail: `${group.visibility === 'private' ? '비공개' : '공개'} 그룹 · 멤버 ${group.memberCount}명` })),
  ];
  const missing = !!currentGroupId && !groups.some(group => group.id === currentGroupId);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable accessibilityLabel="닫기" onPress={onClose} style={[StyleSheet.absoluteFill, phone && { backgroundColor: '#161F1B66' }]} />
    <View accessibilityViewIsModal style={[sh.sheet, elevation.dialog, phone
      ? [sh.phone, { paddingBottom: Math.max(24, insets.bottom) }]
      : { right: right + 52 + 12, bottom, width: Math.min(320, width - 2 * right - 64) }]}>
      {phone && <View style={sh.handle} />}
      <View style={sh.header}><Text accessibilityRole="header" style={sh.title}>지도에 표시할 그룹</Text><IconButton label="닫기" onPress={onClose}><X size={18} color={p.muted} /></IconButton></View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 2 }}>
        {options.map(option => {
          const current = option.id === currentGroupId;
          return <Pressable key={option.id || 'mine'} accessibilityRole="radio" accessibilityState={{ checked: current }} onPress={() => onSelect(option.id)}
            style={({ pressed }) => [sh.option, current && { backgroundColor: p.primarySoft }, pressed && !current && { backgroundColor: p.surface }]}>
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[sh.optionName, current && { color: p.primary }]}>{option.name}</Text><Text numberOfLines={1} style={sh.optionDetail}>{option.detail}</Text></View>
            {current && <Check size={18} color={p.primary} />}
          </Pressable>;
        })}
        {missing && <View accessibilityState={{ disabled: true }} style={[sh.option, { backgroundColor: p.primarySoft }]}><Text style={[sh.optionName, { color: p.primary }]}>{loading ? '그룹 불러오는 중…' : '그룹을 찾을 수 없습니다'}</Text></View>}
      </ScrollView>
      {loading && <Text accessibilityLiveRegion="polite" style={sh.status}>가입한 그룹을 불러오는 중이에요.</Text>}
      {!!error && <Text accessibilityRole="alert" style={[sh.status, { color: p.danger }]}>{error} <Text accessibilityRole="button" onPress={onRetry} style={sh.link}>다시 시도</Text></Text>}
      <Pressable accessibilityRole="link" onPress={() => { onClose(); router.push('/groups'); }} style={({ pressed }) => [sh.browse, pressed && { opacity: 0.7 }]}>
        <Text style={sh.browseText}>그룹 둘러보기</Text><ArrowRight size={16} color={p.primary} />
      </Pressable>
    </View>
  </Modal>;
}

// Shows which group the map is scoped to, with its home and a way back to my map.
export function MapScopeChip({ group, loading, onExit }: { group?: PinGroup; loading: boolean; onExit: () => void }) {
  return <View accessibilityLabel="지도에 표시 중인 그룹" style={[sh.chip, controlShadow]}>
    <Compass size={16} color={p.primary} />
    <Text numberOfLines={1} style={sh.chipName}>{group?.name || (loading ? '그룹 불러오는 중…' : '그룹')}</Text>
    {!!group && <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/groups/[groupId]', params: { groupId: group.id } })} hitSlop={4} style={sh.chipHome}><Text style={sh.chipHomeText}>그룹 홈</Text></Pressable>}
    <Pressable accessibilityRole="link" accessibilityLabel="내 지도로 돌아가기" onPress={onExit} style={({ pressed }) => [sh.chipExit, pressed && { backgroundColor: p.surface }]}><X size={16} color={p.muted} /></Pressable>
  </View>;
}

const sh = StyleSheet.create({
  sheet: { position: 'absolute', gap: 12, maxHeight: '70%', padding: 16, borderRadius: 14, backgroundColor: p.paper },
  phone: { left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 20, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: p.line },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: p.ink, fontSize: 16, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  optionName: { color: p.ink, fontSize: 14, fontWeight: '600' }, optionDetail: { color: p.muted, fontSize: 12 },
  status: { color: p.muted, fontSize: 12, lineHeight: 18 }, link: { color: p.primary, textDecorationLine: 'underline' },
  browse: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 44, paddingHorizontal: 10 },
  browseText: { color: p.primary, fontSize: 14, fontWeight: '600' },
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: 8, minHeight: 44, paddingVertical: 4, paddingRight: 4, paddingLeft: 12, borderWidth: 1, borderColor: p.line, borderRadius: 999, backgroundColor: p.paper },
  chipName: { flexShrink: 1, minWidth: 0, color: p.ink, fontSize: 14, fontWeight: '600' },
  chipHome: { flexShrink: 0, paddingVertical: 6, paddingHorizontal: 4 },
  chipHomeText: { color: p.primary, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  chipExit: { width: 36, height: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
});
