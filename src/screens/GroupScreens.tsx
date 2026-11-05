import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Check, Compass, Copy, Globe2, KeyRound, Lock, Map, MapPin, Plus, Share2, UsersRound } from 'lucide-react-native';
import { Button, Empty, Field, IconButton, Notice, Screen, SearchBox, p, s } from '../components/ui';
import { Dialog } from '../components/Dialog';
import { PostCard } from '../components/PostCard';
import { useAuth } from '../hooks/useAuth';
import { useBlockedUsers, withoutBlocked } from '../hooks/useBlockedUsers';
import { useGroups } from '../hooks/useGroups';
import { createGroup, getGroupInviteCode, joinGroupWithCode, setGroupMembership } from '../services/groupService';
import { subscribeGroupPosts } from '../services/postService';
import { getGroupInputError, isGroupInviteCode, normalizeGroupInviteCode, type GroupVisibility, type PinGroup } from '../types/group';
import type { Post } from '../types/post';

const errorText = (e: unknown) => e instanceof Error ? e.message : '처리하지 못했습니다. 다시 시도해 주세요.';
function BackLink({ title, to }: { title: string; to: '/map' | '/groups' }) {
  return <Pressable accessibilityRole="link" style={[s.row, { gap: 7, minHeight: 44, alignSelf: 'flex-start' }]} onPress={() => router.push(to)}><ArrowLeft size={17} color={p.muted} /><Text style={{ color: p.muted, fontSize: 14.4 }}>{title}</Text></Pressable>;
}
export function JoinGroupButton({ group, joined, allowLeave = false, compact = false, tone }: { group: Pick<PinGroup, 'id' | 'visibility'>; joined: boolean; allowLeave?: boolean; compact?: boolean; tone?: 'outline' | 'plain' | 'ghost' }) {
  const { currentUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const pending = useRef(false);
  async function change() {
    if (!currentUser || pending.current) return;
    if (!joined && group.visibility === 'private') { setJoining(true); return; }
    pending.current = true; setBusy(true); setError('');
    try { await setGroupMembership(group.id, currentUser.uid, !joined); }
    catch { setError('가입 상태를 변경하지 못했습니다. 다시 시도해 주세요.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <View style={{ gap: 8, maxWidth: compact ? 240 : undefined }}>
    <Button title={busy ? '처리 중…' : joined ? allowLeave ? '그룹 탈퇴' : '가입 완료' : group.visibility === 'private' ? '코드로 가입' : '바로 가입'} variant={joined ? 'secondary' : 'primary'} tone={tone} style={compact ? g.compactButton : undefined} disabled={busy || !currentUser || (joined && !allowLeave)} icon={joined ? <Check size={17} color={p.ink} /> : <Plus size={17} color={p.paper} />} onPress={() => void change()} />
    {!!error && <Notice error>{error}</Notice>}
    <JoinGroupDialog visible={joining} groupId={group.id} onClose={() => setJoining(false)} onJoined={() => setJoining(false)} />
  </View>;
}
function JoinGroupDialog({ visible, groupId, onClose, onJoined }: { visible: boolean; groupId?: string; onClose: () => void; onJoined: (id: string) => void }) {
  const { currentUser } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  useEffect(() => { if (visible) { setCode(''); setError(''); } }, [visible]);
  async function join() {
    if (!currentUser || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { onJoined(await joinGroupWithCode(code, currentUser.uid, groupId)); }
    catch (e) { setError(e instanceof Error && !('code' in e) ? e.message : '가입하지 못했습니다. 초대코드를 확인하고 다시 시도해 주세요.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Dialog visible={visible} title="초대코드로 가입" onClose={onClose} busy={busy}>
    <Text style={g.note}>그룹 멤버에게 받은 12자리 초대코드를 입력해 주세요.</Text>
    <Field label="초대코드" autoFocus value={code} editable={!busy} onChangeText={value => { setCode(value); setError(''); }} autoCapitalize="characters" autoCorrect={false} maxLength={24} placeholder="ABCD-EFGH-2345" style={{ letterSpacing: 1.6 }} />
    {!!error && <Notice error>{error}</Notice>}
    <View style={g.modalActions}><Button title="취소" variant="secondary" style={g.flex} disabled={busy} onPress={onClose} /><Button title={busy ? '가입 중…' : '그룹 가입하기'} style={g.flex} disabled={!currentUser || busy || !isGroupInviteCode(normalizeGroupInviteCode(code))} onPress={() => void join()} /></View>
  </Dialog>;
}
function CreateGroupDialog({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { currentUser } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  useEffect(() => { if (visible) { setName(''); setDescription(''); setVisibility('public'); setError(''); } }, [visible]);
  async function create() {
    if (!currentUser || pending.current) return;
    const input = { name, description, visibility };
    const validation = getGroupInputError(input);
    if (validation) { setError(validation); return; }
    pending.current = true; setBusy(true); setError('');
    try { onCreated(await createGroup(input, currentUser.uid)); }
    catch (e) { setError(errorText(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Dialog visible={visible} title="새 그룹 만들기" eyebrow="함께 만드는 장소 모음" onClose={onClose} busy={busy}>
    <Field label="그룹 이름" autoFocus value={name} editable={!busy} onChangeText={setName} maxLength={40} placeholder="예: 서울의 작은 책방" />
    <Field label="그룹 소개  선택" value={description} editable={!busy} onChangeText={setDescription} maxLength={240} multiline placeholder="어떤 장소를 함께 모으고 싶나요?" />
    <View accessibilityRole="radiogroup" accessibilityLabel="그룹 공개 범위">
      <Text style={[g.label, { marginBottom: 2 }]}>그룹 공개 범위</Text>
      {(['public', 'private'] as const).map(value => {
        const selected = visibility === value;
        return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: busy }} disabled={busy} onPress={() => setVisibility(value)} style={g.visibility}>
          <View style={[g.radio, selected && g.radioOn]} />{value === 'public' ? <Globe2 size={20} color={p.primary} /> : <Lock size={20} color={p.primary} />}
          <View style={{ flex: 1, gap: 4 }}><Text style={[g.label, selected && { color: p.primary }]}>{value === 'public' ? '공개 그룹' : '비공개 그룹'}</Text><Text style={g.small}>{value === 'public' ? '누구나 그룹과 핀을 둘러보고 코드 없이 바로 가입할 수 있어요.' : '검색에 표시되지 않고, 멤버만 그룹과 핀을 볼 수 있어요.'}</Text></View>
        </Pressable>;
      })}
    </View>
    <Text style={g.note}>공개 그룹은 초대코드 없이 바로 가입할 수 있고, 비공개 그룹은 초대코드가 있어야 가입할 수 있어요. 그룹을 만들면 자동으로 가입돼요.</Text>
    {!!error && <Notice error>{error}</Notice>}
    <View style={g.modalActions}><Button title="취소" variant="secondary" style={g.flex} disabled={busy} onPress={onClose} /><Button title={busy ? '만드는 중…' : '그룹 만들기'} style={g.flex} disabled={busy || !currentUser || name.trim().length < 2} onPress={() => void create()} /></View>
  </Dialog>;
}
export function GroupsScreen() {
  const catalog = useGroups();
  const { width } = useWindowDimensions();
  const narrow = width <= 640;
  const [tab, setTab] = useState<'all' | 'joined'>('all');
  const [keyword, setKeyword] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const term = keyword.trim().toLocaleLowerCase();
  const filtered = catalog.groups.filter(group => (tab === 'all' ? group.visibility !== 'private' : catalog.joinedIds.includes(group.id)) && `${group.name} ${group.description}`.toLocaleLowerCase().includes(term));
  const openGroup = (id: string) => router.push({ pathname: '/groups/[groupId]', params: { groupId: id } });
  return <Screen refreshing={catalog.loading} onRefresh={catalog.retry}>
    <BackLink title="지도로 돌아가기" to="/map" />
    <View style={[g.intro, !narrow && { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 28 }]}>
      <View style={{ gap: 14, flexShrink: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={[g.title, !narrow && { fontSize: 38, lineHeight: 50 }]}>{'취향이 닿는 곳,\n함께 핀을 모아요.'}</Text>
        <Text style={g.introText}>{'동네 맛집부터 나만 아는 산책길까지.\n마음에 드는 그룹에 가입하고 나의 장소를 나눠보세요.'}</Text>
      </View>
      <View style={[g.introActions, narrow && { width: '100%' }]}><Button title="초대코드로 가입" variant="secondary" style={narrow && g.flex} icon={<KeyRound size={18} color={p.ink} />} onPress={() => setJoining(true)} /><Button title="그룹 만들기" style={narrow && g.flex} icon={<Plus size={18} color={p.paper} />} onPress={() => setCreating(true)} /></View>
    </View>
    <View style={[g.tools, !narrow && { flexDirection: 'row', alignItems: 'center' }]}>
      <View accessibilityRole="tablist" accessibilityLabel="그룹 필터" style={[g.filters, !narrow && { width: 320 }]}>
        {(['all', 'joined'] as const).map(value => {
          const selected = tab === value;
          const color = selected ? p.primary : p.muted;
          return <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(value)} style={g.filter}>
            {value === 'all' ? <Compass size={16} color={color} /> : <UsersRound size={16} color={color} />}
            <Text style={{ color, fontSize: 13.76, fontWeight: '600' }}>{value === 'all' ? '그룹 둘러보기' : '내 그룹'}</Text>
            {value === 'joined' && !catalog.loading && !catalog.error && <Text style={[g.count, selected && { backgroundColor: p.primarySoft }]}>{catalog.joinedIds.length}</Text>}
          </Pressable>;
        })}
      </View>
      <SearchBox value={keyword} onChangeText={setKeyword} placeholder="이름이나 관심사로 그룹 찾기" accessibilityLabel="그룹 검색" style={!narrow && { flex: 1 }} />
    </View>
    {!!catalog.error && <><Notice error>{catalog.error}</Notice><Button title="다시 시도" variant="secondary" onPress={catalog.retry} /></>}
    {catalog.loading && <Text style={g.emptyText}>함께할 그룹을 불러오는 중입니다.</Text>}
    {!catalog.loading && !catalog.error && !filtered.length && <View style={g.empty}><Compass size={36} color={p.muted} strokeWidth={1.3} /><Empty title={term ? '검색 결과가 없어요' : tab === 'joined' ? '아직 가입한 그룹이 없어요' : '첫 그룹을 만들어 보세요'} description={term ? '다른 이름이나 관심사로 찾아보세요.' : '좋아하는 장소를 모으며 같은 취향의 사람들을 만나보세요.'} />{tab === 'joined' && !term && <Button title="그룹 둘러보기" variant="secondary" onPress={() => setTab('all')} />}</View>}
    {!catalog.loading && !catalog.error && filtered.length > 0 && <View accessibilityLabel="그룹 목록">{filtered.map(group => <View key={group.id} style={[g.listRow, width <= 620 && { flexWrap: 'wrap', alignItems: 'flex-start', gap: 0 }]}>
      <Pressable accessibilityRole="link" accessibilityLabel={group.name + ' 그룹 보기'} onPress={() => openGroup(group.id)} style={({ pressed }) => [g.listMain, width <= 620 && { flexBasis: '100%' }, pressed && { opacity: 0.7 }]}>
        <View style={g.listSymbol}>{group.visibility === 'private' ? <Lock size={22} color={p.muted} /> : <Compass size={22} color={p.muted} />}</View>
        <View style={g.listCopy}>
          <Text style={g.listName}>{group.name}</Text>
          {!!group.description && <Text style={g.listDescription}>{group.description}</Text>}
          <Text style={g.tiny}>{group.visibility === 'private' ? '비공개' : '공개'} · 멤버 {group.memberCount}명</Text>
        </View>
      </Pressable>
      <View style={width <= 620 ? { paddingLeft: 56 } : undefined}><JoinGroupButton group={group} joined={catalog.joinedIds.includes(group.id)} compact tone="ghost" /></View>
    </View>)}</View>}
    <CreateGroupDialog visible={creating} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); openGroup(id); }} />
    <JoinGroupDialog visible={joining} onClose={() => setJoining(false)} onJoined={id => { setJoining(false); openGroup(id); }} />
  </Screen>;
}
export function GroupDetailScreen() {
  const { groupId = '' } = useLocalSearchParams<{ groupId: string }>();
  const { currentUser, firebaseReady } = useAuth();
  const catalog = useGroups();
  const { width } = useWindowDimensions();
  const narrow = width <= 640;
  const group = catalog.groups.find(item => item.id === groupId);
  const joined = catalog.joinedIds.includes(groupId);
  const canRead = Boolean(group && (group.visibility !== 'private' || joined));
  const [allPosts, setPosts] = useState<Post[]>([]);
  const { ids: blockedIds } = useBlockedUsers();
  const posts = useMemo(() => withoutBlocked(allPosts, blockedIds), [allPosts, blockedIds]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [shareMessage, setShareMessage] = useState('');
  const [gridWidth, setGridWidth] = useState(0);
  const map = () => router.push({ pathname: '/map', params: { group: groupId } });
  useEffect(() => {
    setPosts([]); setError('');
    if (!currentUser || !firebaseReady || !canRead) { setLoading(false); return; }
    setLoading(true);
    return subscribeGroupPosts(groupId, next => { setPosts(next); setLoading(false); }, () => { setPosts([]); setError('그룹 핀을 불러오지 못했습니다.'); setLoading(false); }, group?.visibility);
  }, [groupId, currentUser?.uid, firebaseReady, canRead, group?.visibility, revision]);
  async function share() {
    const url = (process.env.EXPO_PUBLIC_WEB_URL || 'https://www.pinori.kr').replace(/\/$/, '') + '/groups/' + groupId;
    try { await Share.share({ title: group?.name, message: (group?.visibility === 'private' ? '함께 장소를 모아요. 그룹 멤버에게 초대코드를 받아 가입해 주세요.' : '함께 장소를 모아요. 초대코드 없이 바로 가입할 수 있어요.') + '\n' + url }); }
    catch { setShareMessage('공유하지 못했습니다. 다시 시도해 주세요.'); }
  }
  if (catalog.loading) return <Screen><Text style={g.emptyText}>그룹을 불러오는 중입니다.</Text></Screen>;
  if (catalog.error || !group || !canRead) return <Screen><Empty title={catalog.error ? '그룹을 불러오지 못했어요' : '가입이 필요하거나 찾을 수 없는 그룹이에요'} description={catalog.error || '비공개 그룹은 초대코드로 가입한 뒤 볼 수 있어요.'} />{catalog.error ? <Button title="다시 시도" variant="secondary" onPress={catalog.retry} /> : <JoinGroupButton group={{ id: groupId, visibility: 'private' }} joined={false} />}<Button title="그룹 둘러보기" onPress={() => router.push('/groups')} /></Screen>;
  // Same column rule as the web grid: as many 280px cards as fit, one column on phones.
  const columns = width <= 620 ? 1 : Math.max(1, Math.floor((gridWidth + 24) / 304));
  const cardWidth = gridWidth ? (gridWidth - (columns - 1) * 24) / columns : undefined;
  return <Screen refreshing={loading} onRefresh={() => setRevision(value => value + 1)}>
    <BackLink title="그룹 둘러보기" to="/groups" />
    <View style={[g.home, narrow && { paddingTop: 8 }]}>
      <View style={[s.row, { gap: narrow ? 12 : 18 }]}>
        <View style={[g.symbol, { width: 46, height: 46, borderRadius: 23 }]}>{group.visibility === 'private' ? <Lock size={30} color={p.primary} /> : <Compass size={30} color={p.primary} />}</View>
        <View style={{ flex: 1, minWidth: 0, gap: 7 }}><Text style={g.eyebrow}>{group.visibility === 'private' ? '비공개 그룹' : '공개 그룹'}</Text><Text accessibilityRole="header" style={[g.homeTitle, !narrow && { fontSize: 32, lineHeight: 40 }]}>{group.name}</Text></View>
        <IconButton label="그룹 공유" variant="round" onPress={() => void share()}><Share2 size={19} color={p.ink} /></IconButton>
      </View>
      {!!group.description && <Text style={g.groupDescription}>{group.description}</Text>}
      <View style={[g.homeFooter, !narrow && { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <View style={[s.row, { flexWrap: 'wrap', gap: 14 }]}>
          <View style={[s.row, { gap: 6 }]}><UsersRound size={16} color={p.muted} /><Text style={g.small}>멤버 {group.memberCount}명</Text></View>
          <View style={[s.row, { gap: 6 }]}><MapPin size={16} color={p.muted} /><Text style={g.small}>{loading ? '핀 불러오는 중' : `핀 ${posts.length}개`}</Text></View>
          {group.ownerUid === currentUser?.uid && <Text style={g.pill}>내가 만든 그룹</Text>}
        </View>
        <JoinGroupButton group={group} joined={joined} allowLeave tone="plain" />
      </View>
      {!!shareMessage && <Text accessibilityLiveRegion="polite" style={g.note}>{shareMessage}</Text>}
    </View>
    {joined && group.visibility === 'private' && <GroupInvitePanel groupId={groupId} />}
    <View style={[g.participation, !narrow && { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
      <View style={{ flexShrink: 1, gap: 5 }}><Text style={{ color: p.ink, fontSize: 16, lineHeight: 25.6 }}>{joined ? '지도 탭에서 장소를 검색하거나 지도를 한 번 눌러 그룹 핀을 남겨보세요.' : '이 그룹이 마음에 드나요? 바로 가입하고 나의 장소도 함께 모아보세요.'}</Text>{joined && <Text style={g.small}>탈퇴해도 남긴 핀은 유지되며, 내 핀은 언제든 수정·삭제할 수 있어요.</Text>}</View>
      <Button title={joined ? '지도에서 핀 남기기' : '지도에서 그룹 핀 보기'} icon={joined ? <Plus size={17} color={p.paper} /> : <Map size={17} color={p.paper} />} onPress={map} />
    </View>
    <View style={[s.between, { flexWrap: 'wrap', marginTop: 2 }]}><Text accessibilityRole="header" style={{ color: p.ink, fontSize: 19.2, fontWeight: '700' }}>함께 모은 핀</Text><Button title="지도에서 모아보기" variant="secondary" tone="plain" icon={<Map size={16} color={p.ink} />} onPress={map} /></View>
    {!!error && <><Notice error>{error}</Notice><Button title="다시 시도" variant="secondary" onPress={() => setRevision(value => value + 1)} /></>}
    {loading && <Text style={g.emptyText}>그룹 핀을 불러오는 중입니다.</Text>}
    {!loading && !error && !posts.length && <View style={g.empty}><MapPin size={30} color={p.muted} strokeWidth={1.3} /><Empty title="아직 모은 핀이 없어요" description={joined ? '지도 탭에서 좋아하는 장소에 이 그룹의 첫 핀을 남겨보세요.' : '가입하고 이 그룹의 첫 장소를 소개해 보세요.'} /></View>}
    {posts.length > 0 && <View onLayout={event => setGridWidth(event.nativeEvent.layout.width)} style={g.grid}>{posts.map(post => <View key={post.id} style={{ width: cardWidth ?? '100%' }}><PostCard post={post} /></View>)}</View>}
  </Screen>;
}
function GroupInvitePanel({ groupId }: { groupId: string }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setCode(''); setError(''); setMessage('');
    void getGroupInviteCode(groupId).then(next => { if (!cancelled) setCode(next); }, () => { if (!cancelled) setError('초대코드를 불러오지 못했습니다.'); });
    return () => { cancelled = true; };
  }, [groupId, revision]);
  return <View style={g.invite}>
    <View style={{ gap: 6 }}><View style={[s.row, { gap: 8 }]}><KeyRound size={17} color={p.ink} /><Text style={g.label}>그룹 초대코드</Text></View><Text style={g.note}>함께할 사람에게 이 코드를 알려주세요. 그룹 페이지에서 코드로 가입할 수 있어요.</Text></View>
    {!!code && <View style={[s.row, { flexWrap: 'wrap', gap: 12 }]}><Text selectable style={g.code}>{code.match(/.{4}/g)?.join('-')}</Text><Button title="코드 복사" variant="secondary" icon={<Copy size={16} color={p.ink} />} onPress={() => { void Clipboard.setStringAsync(code).then(() => setMessage('초대코드를 복사했습니다.')).catch(() => setMessage('복사하지 못했습니다. 표시된 코드를 선택해서 복사해 주세요.')); }} /></View>}
    {!code && !error && <Text style={g.small}>초대코드를 불러오는 중…</Text>}
    {!!error && <><Notice error>{error}</Notice><Button title="다시 시도" variant="secondary" onPress={() => setRevision(value => value + 1)} /></>}
    {!!message && <Text accessibilityLiveRegion="polite" style={g.note}>{message}</Text>}
  </View>;
}
const g = StyleSheet.create({
  flex: { flex: 1 },
  intro: { paddingBottom: 32, gap: 24 },
  introActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  introText: { color: p.muted, fontSize: 14, lineHeight: 25.2 },
  eyebrow: { fontSize: 13, fontWeight: '700', color: p.primary },
  title: { color: p.ink, fontSize: 28.8, fontWeight: '600', lineHeight: 37.44, letterSpacing: -1.3 },
  homeTitle: { color: p.ink, fontSize: 25, fontWeight: '700', lineHeight: 32, letterSpacing: -0.6 },
  note: { color: p.muted, fontSize: 13.9, lineHeight: 23.6 },
  label: { color: p.ink, fontSize: 16, fontWeight: '700' }, small: { color: p.muted, fontSize: 13.12, lineHeight: 21 }, tiny: { color: p.muted, fontSize: 12, lineHeight: 18 },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tools: { gap: 16, marginTop: 2 },
  filters: { flexDirection: 'row' },
  filter: { flex: 1, flexDirection: 'row', minHeight: 44, padding: 8, gap: 6, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 21, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 11, overflow: 'hidden', textAlign: 'center', color: p.primary, backgroundColor: `${p.primary}12`, fontSize: 11.7 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  listMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 12 },
  listSymbol: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  listCopy: { flex: 1, minWidth: 0, gap: 4 },
  listName: { color: p.ink, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  listDescription: { color: p.muted, fontSize: 14, lineHeight: 22 },
  compactButton: { minHeight: 36, paddingVertical: 8, paddingHorizontal: 11 },
  symbol: { width: 44, height: 44, borderRadius: 22, backgroundColor: p.primarySoft, alignItems: 'center', justifyContent: 'center' },
  visibility: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }, radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: p.muted }, radioOn: { borderColor: p.primary, borderWidth: 5 },
  empty: { alignItems: 'center', padding: 18, marginVertical: 30 }, emptyText: { color: p.muted, fontSize: 14, lineHeight: 25, textAlign: 'center', paddingVertical: 32 },
  home: { paddingTop: 32, gap: 22 },
  groupDescription: { color: p.muted, fontSize: 16, lineHeight: 28.8 },
  homeFooter: { paddingTop: 18, gap: 14, flexWrap: 'wrap' },
  pill: { minHeight: 24, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 4, overflow: 'hidden', color: p.primary, backgroundColor: p.primarySoft, fontSize: 11.5, fontWeight: '600' },
  participation: { paddingVertical: 16, paddingHorizontal: 20, gap: 18 },
  invite: { padding: 20, gap: 14 },
  code: { color: p.ink, backgroundColor: p.oliveSoft, padding: 12, borderRadius: 8, overflow: 'hidden', fontSize: 17, letterSpacing: 1.2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 32 },
});
