import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Info, RefreshCw, UsersRound } from 'lucide-react-native';
import { Text } from '../Typography';
import { Dialog } from '../Dialog';
import { Avatar, Button, Notice, SearchBox, p } from '../ui';
import { filterChatCandidates } from '../../lib/chatCandidates';
import type { DaymarkUser } from '../../types/user';

// 1:1 chats start only with people the viewer follows.
export function DirectChatDialog({ visible, users, loading, error, chattingUids, onRetry, onStart, onClose, onCreateGroup }: {
  visible: boolean; users: DaymarkUser[]; loading: boolean; error: string; chattingUids: Set<string>;
  onRetry: () => void; onStart: (user: DaymarkUser) => Promise<void>; onClose: () => void; onCreateGroup: () => void;
}) {
  const [search, setSearch] = useState('');
  const [pendingUid, setPendingUid] = useState('');
  const [startError, setStartError] = useState('');
  const pending = !!pendingUid;
  const keyword = search.trim();
  const candidates = filterChatCandidates(users, search);

  async function start(user: DaymarkUser) {
    if (pendingUid) return;
    setPendingUid(user.uid); setStartError('');
    try { await onStart(user); setPendingUid(''); setSearch(''); }
    catch (openError) {
      setStartError(openError instanceof Error ? openError.message : '채팅을 열지 못했어요. 다시 시도해 주세요.');
      setPendingUid('');
    }
  }

  return <Dialog visible={visible} title="1:1 채팅 시작" busy={pending} onClose={onClose}>
    <SearchBox accessibilityLabel="대화할 사람 검색" value={search} onChangeText={setSearch} editable={!pending} autoCapitalize="none" autoCorrect={false} placeholder="닉네임 또는 @사용자 이름으로 검색" />
    {!loading && !error && <Text accessibilityLiveRegion="polite" style={d.count}>{keyword ? `검색 결과 ${candidates.length}명` : `팔로잉 ${users.length}명`}</Text>}
    {!!error && <View style={d.state}><Notice error>{error}</Notice><Button title="다시 불러오기" variant="secondary" icon={<RefreshCw size={17} color={p.ink} />} onPress={onRetry} /></View>}
    <View accessibilityLabel="대화할 사람">
      {loading && <Text style={d.empty}>팔로잉 목록을 불러오는 중이에요.</Text>}
      {!loading && !error && !candidates.length && (keyword
        ? <Text style={d.empty}>검색 결과가 없어요. 다른 닉네임이나 사용자 이름을 입력해 보세요.</Text>
        : <View style={d.state}>
          <Text style={[d.empty, { textAlign: 'left', paddingVertical: 0 }]}>아직 팔로우한 사람이 없어요. 사람 탭에서 친구를 팔로우하면 여기서 바로 대화할 수 있어요.</Text>
          <Button title="사람 찾기" variant="secondary" onPress={() => { onClose(); router.push('/people'); }} />
        </View>)}
      {!loading && !error && candidates.map((user, index) => <Pressable key={user.uid} accessibilityRole="button" accessibilityLabel={`${user.nickname}${user.username ? ` (@${user.username})` : ''}${chattingUids.has(user.uid) ? ', 대화 중' : ''}`}
        disabled={pending} onPress={() => void start(user)} style={({ pressed }) => [d.row, index > 0 && d.divider, pressed && { backgroundColor: p.surface }]}>
        <Avatar uri={user.photoURL} name={user.nickname} size={48} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={1} style={d.name}>{user.nickname}</Text>{!!user.username && <Text numberOfLines={1} style={d.handle}>@{user.username}</Text>}</View>
        {chattingUids.has(user.uid) && <Text style={d.chip}>대화 중</Text>}
        {pendingUid === user.uid ? <Text style={d.pending}>여는 중…</Text> : <ChevronRight size={18} color={p.light} />}
      </Pressable>)}
    </View>
    {!!startError && <Notice error>{startError}</Notice>}
    <View style={d.note}><Info size={16} color={p.primary} style={{ marginTop: 1 }} /><Text style={d.noteText}>친구를 누르면 바로 대화가 열려요. 이미 대화 중인 친구는 기존 채팅방으로 이동해요.</Text></View>
    <Pressable accessibilityRole="button" disabled={pending} onPress={onCreateGroup} style={({ pressed }) => [d.groupLink, pressed && { opacity: 0.7 }]}>
      <UsersRound size={16} color={p.primary} /><Text style={d.groupText}>여러 명과 대화하려면 단체방 만들기</Text>
    </Pressable>
  </Dialog>;
}

const d = StyleSheet.create({
  count: { color: p.ink, fontSize: 14, fontWeight: '600' },
  state: { alignItems: 'flex-start', gap: 8 },
  empty: { color: p.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', paddingVertical: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingVertical: 12, paddingHorizontal: 4 },
  divider: { borderTopWidth: 1, borderTopColor: p.line },
  name: { color: p.ink, fontSize: 15, fontWeight: '600' }, handle: { color: p.muted, fontSize: 12 },
  chip: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden', color: p.primary, backgroundColor: p.primarySoft, fontSize: 11, fontWeight: '600' },
  pending: { color: p.muted, fontSize: 12 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 8, backgroundColor: p.surface },
  noteText: { flex: 1, color: p.muted, fontSize: 12, lineHeight: 19 },
  groupLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  groupText: { color: p.primary, fontSize: 14, fontWeight: '600' },
});
