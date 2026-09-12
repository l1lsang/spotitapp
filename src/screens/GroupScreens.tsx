import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { ChevronRight, Globe2, KeyRound, LockKeyhole, MapPin, UsersRound, X } from 'lucide-react-native'
import { Button, Chip, Empty, Field, Notice, Screen, p } from '../components/ui'
import { PostCard } from '../components/PostCard'
import { useAuth } from '../hooks/useAuth'
import { createGroup, getGroupInviteCode, joinGroupWithCode, setGroupMembership, subscribeGroup, subscribeGroups, subscribeMyGroupIds } from '../services/groupService'
import { subscribeGroupPosts } from '../services/postService'
import { getGroupInputError, type GroupVisibility, type PinGroup } from '../types/group'
import type { Post } from '../types/post'

function useGroupCatalog(uid?: string, ready?: boolean) {
  const [groups, setGroups] = useState<PinGroup[]>([])
  const [joinedIds, setJoinedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, retry] = useState(0)
  useEffect(() => {
    setGroups([]); setJoinedIds([]); setError('')
    if (!uid || !ready) { setLoading(false); return }
    setLoading(true)
    let publicReady = false
    let membersReady = false
    let publicGroups: PinGroup[] = []
    const members = new Map<string, PinGroup>()
    const subscriptions = new Map<string, () => void>()
    const pending = new Set<string>()
    const publish = () => {
      const merged = new Map(publicGroups.map(group => [group.id, group]))
      members.forEach((group, id) => merged.set(id, group))
      setGroups([...merged.values()].sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)))
      if (publicReady && membersReady && !pending.size) setLoading(false)
    }
    const fail = (e: Error) => { setError(e.message); setLoading(false) }
    const stopPublic = subscribeGroups(next => { publicGroups = next; publicReady = true; publish() }, fail)
    const stopMember = subscribeMyGroupIds(uid, ids => {
      setJoinedIds(ids); membersReady = true
      for (const [id, stop] of subscriptions) {
        if (!ids.includes(id)) { stop(); subscriptions.delete(id); members.delete(id); pending.delete(id) }
      }
      for (const id of ids) {
        if (subscriptions.has(id)) continue
        pending.add(id); setLoading(true)
        subscriptions.set(id, subscribeGroup(id, group => {
          if (group) members.set(id, group)
          else members.delete(id)
          pending.delete(id); publish()
        }, e => {
          members.delete(id); pending.delete(id); publish()
          // A departing member can lose document permission before the membership update arrives.
          if ((e as Error & { code?: string }).code !== 'permission-denied') fail(e)
        }))
      }
      publish()
    }, fail)
    return () => { stopPublic(); stopMember(); subscriptions.forEach(stop => stop()) }
  }, [uid, ready, revision])
  return { groups, joinedIds, loading, error, retry: () => retry(value => value + 1) }
}

export function GroupsScreen() {
  const router = useRouter()
  const { currentUser, firebaseReady } = useAuth()
  const catalog = useGroupCatalog(currentUser?.uid, firebaseReady)
  const [tab, setTab] = useState<'discover' | 'mine'>('discover')
  const [keyword, setKeyword] = useState('')
  const [dialog, setDialog] = useState<'create' | 'join' | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<GroupVisibility>('public')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const groups = catalog.groups.filter(group => (tab === 'mine' ? catalog.joinedIds.includes(group.id) : group.visibility === 'public') && `${group.name} ${group.description}`.toLowerCase().includes(keyword.trim().toLowerCase()))

  async function submit() {
    if (!currentUser || busy) return
    setError('')
    if (dialog === 'create') {
      const validation = getGroupInputError({ name, description, visibility })
      if (validation) { setError(validation); return }
    }
    setBusy(true)
    try {
      const id = dialog === 'create' ? await createGroup({ name, description, visibility }, currentUser.uid) : await joinGroupWithCode(code, currentUser.uid)
      setDialog(null); setName(''); setDescription(''); setCode('')
      router.push({ pathname: '/groups/[groupId]', params: { groupId: id } })
    } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }

  return <Screen title="함께 모으는 장소" back refreshing={catalog.loading} onRefresh={catalog.retry}>
    <View style={styles.hero}><View style={styles.heroIcon}><UsersRound size={27} color={p.primary} /></View><Text style={styles.heroTitle}>우리만의 장소 지도</Text><Text style={styles.description}>친구와 함께, 취향이 비슷한 사람과 함께.{ '\n' }좋아하는 장소를 한곳에 모아 보세요.</Text></View>
    {!currentUser ? <><Empty title="로그인이 필요해요" description="로그인하고 그룹을 둘러보거나 만들어 보세요." /><Button title="로그인" onPress={() => router.push('/login')} /></> : <>
      <View style={styles.actions}><View style={{ flex: 1 }}><Button title="그룹 만들기" onPress={() => { setError(''); setDialog('create') }} /></View><View style={{ flex: 1 }}><Button title="초대코드로 가입" variant="secondary" onPress={() => { setError(''); setDialog('join') }} /></View></View>
      <View style={styles.actions}><Chip label="공개 그룹" selected={tab === 'discover'} onPress={() => setTab('discover')} /><Chip label={`내 그룹 ${catalog.joinedIds.length}`} selected={tab === 'mine'} onPress={() => setTab('mine')} /></View>
      <Field value={keyword} onChangeText={setKeyword} placeholder="그룹 이름이나 소개 검색" accessibilityLabel="그룹 검색" />
      {catalog.error ? <Notice error>{catalog.error}</Notice> : null}
      {catalog.loading ? <ActivityIndicator color={p.primary} style={{ margin: 24 }} /> : null}
      {!catalog.loading && !groups.length && !catalog.error ? <Empty title={tab === 'mine' ? '아직 가입한 그룹이 없어요' : '검색된 그룹이 없어요'} description={tab === 'mine' ? '공개 그룹을 둘러보거나 초대코드로 가입해 보세요.' : '새로운 취향의 모임을 직접 만들어 보세요.'} /> : null}
      {groups.map(group => <Pressable key={group.id} style={styles.groupCard} accessibilityRole="button" onPress={() => router.push({ pathname: '/groups/[groupId]', params: { groupId: group.id } })}>
        <View style={styles.row}><View style={styles.groupIcon}>{group.visibility === 'private' ? <LockKeyhole size={23} color={p.primary} /> : <Globe2 size={23} color={p.primary} />}</View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{group.name}</Text><Text style={styles.small}>{group.visibility === 'private' ? '비공개 그룹' : '공개 그룹'} · {group.memberCount}명</Text></View><ChevronRight color={p.muted} size={20} /></View>
        {group.description ? <Text numberOfLines={3} style={styles.description}>{group.description}</Text> : null}
        {catalog.joinedIds.includes(group.id) ? <Text style={styles.joined}>가입한 그룹</Text> : <Text style={styles.small}>초대코드 없이 바로 가입할 수 있어요</Text>}
      </Pressable>)}
    </>}
    <GroupSheet visible={dialog !== null} title={dialog === 'create' ? '새 그룹 만들기' : '초대코드로 가입'} onClose={() => { if (!busy) setDialog(null) }}>
      {dialog === 'create' ? <>
        <Field label="그룹 이름" value={name} onChangeText={setName} maxLength={40} placeholder="예: 우리 동네 작은 카페" />
        <Field label="그룹 소개" value={description} onChangeText={setDescription} maxLength={240} multiline placeholder="어떤 장소를 함께 모으고 싶나요?" />
        <Text style={styles.cardTitle}>공개 범위</Text><View style={styles.actions}><Chip label="공개" selected={visibility === 'public'} onPress={() => setVisibility('public')} /><Chip label="비공개" selected={visibility === 'private'} onPress={() => setVisibility('private')} /></View>
        <Notice>{visibility === 'public' ? '로그인한 누구나 그룹을 찾고 바로 가입할 수 있어요.' : '초대코드로 가입한 멤버만 그룹과 핀을 볼 수 있어요.'} 그룹을 만든 뒤 공개 범위는 변경할 수 없어요.</Notice>
      </> : <><KeyRound size={34} color={p.primary} /><Text style={styles.description}>멤버에게 받은 12자리 초대코드를 입력해 주세요.</Text><Field label="초대코드" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={24} placeholder="ABCD EFGH JKLM" /></>}
      {error ? <Notice error>{error}</Notice> : null}<Button title={dialog === 'create' ? '그룹 만들기' : '가입하기'} loading={busy} disabled={!firebaseReady} onPress={() => void submit()} />
    </GroupSheet>
  </Screen>
}

export function GroupDetailScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ groupId: string }>()
  const groupId = Array.isArray(params.groupId) ? params.groupId[0] : params.groupId
  const { currentUser, firebaseReady } = useAuth()
  const [group, setGroup] = useState<PinGroup | null>(null)
  const [joined, setJoined] = useState(false)
  const [membershipLoaded, setMembershipLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [postsLoading, setPostsLoading] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [error, setError] = useState('')
  const [postsError, setPostsError] = useState('')
  const [actionError, setActionError] = useState('')
  const [invite, setInvite] = useState('')
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const uid = currentUser?.uid

  useEffect(() => {
    setJoined(false); setMembershipLoaded(false)
    if (!uid || !firebaseReady) { setMembershipLoaded(true); return }
    return subscribeMyGroupIds(uid, ids => { setJoined(ids.includes(groupId)); setMembershipLoaded(true) }, e => { setError(e.message); setMembershipLoaded(true) })
  }, [uid, firebaseReady, groupId, revision])
  useEffect(() => {
    setGroup(null); setError(''); setInvite('')
    if (!uid || !groupId || !firebaseReady || !membershipLoaded) { setLoading(false); return }
    setLoading(true)
    return subscribeGroup(groupId, next => { setGroup(next); setLoading(false) }, e => { setError(e.message); setLoading(false) })
  }, [groupId, uid, firebaseReady, membershipLoaded, joined, revision])
  const canReadPins = Boolean(group && (group.visibility === 'public' || joined))
  useEffect(() => {
    setPosts([]); setPostsError('')
    if (!uid || !firebaseReady || !canReadPins || !group) { setPostsLoading(false); return }
    setPostsLoading(true)
    return subscribeGroupPosts(groupId, next => { setPosts(next); setPostsLoading(false) }, e => { setPostsError(e.message); setPostsLoading(false) }, group.visibility)
  }, [groupId, group?.visibility, canReadPins, uid, firebaseReady, revision])

  async function changeMembership(shouldJoin: boolean) {
    if (!uid || busy) return
    setBusy(true); setActionError('')
    try {
      if (shouldJoin && (!group || group.visibility === 'private')) await joinGroupWithCode(code, uid, groupId)
      else await setGroupMembership(groupId, uid, shouldJoin)
      setCode(''); setShowCode(false)
      if (!shouldJoin && group?.visibility === 'private') router.replace('/groups')
    } catch (e) { setActionError(errorText(e)) }
    finally { setBusy(false) }
  }
  async function loadInvite() {
    if (busy) return
    setBusy(true); setActionError('')
    try { setInvite(await getGroupInviteCode(groupId)); setShowCode(true) }
    catch (e) { setActionError(errorText(e)) }
    finally { setBusy(false) }
  }
  async function share() {
    const webUrl = (process.env.EXPO_PUBLIC_WEB_URL || 'https://spotitmap.kr').replace(/\/$/, '')
    try { await Share.share({ title: group?.name, message: `${group?.name || '스팟잇 그룹'}에서 함께 장소를 모아요.\n${group?.visibility === 'private' ? '가입하려면 그룹 멤버에게 초대코드를 받아 주세요.\n' : ''}${webUrl}/groups/${groupId}` }) }
    catch (e) { setActionError(errorText(e)) }
  }

  return <Screen title={group?.name || '그룹'} back refreshing={loading || postsLoading} onRefresh={() => setRevision(v => v + 1)}>
    {!uid ? <><Empty title="로그인이 필요해요" /><Button title="로그인" onPress={() => router.push('/login')} /></> : loading ? <ActivityIndicator color={p.primary} style={{ margin: 32 }} /> : !group ? <>
      <Empty title="가입이 필요하거나 찾을 수 없는 그룹이에요" description="비공개 그룹은 멤버에게 받은 초대코드로 가입해 주세요." />
      {error ? <Notice error>{error}</Notice> : null}
      <Field label="초대코드" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="12자리 초대코드" />
      <Button title="초대코드로 가입" loading={busy} onPress={() => void changeMembership(true)} /><Button title="그룹 둘러보기" variant="secondary" onPress={() => router.replace('/groups')} />
    </> : <>
      <View style={styles.hero}><View style={styles.heroIcon}>{group.visibility === 'private' ? <LockKeyhole size={27} color={p.primary} /> : <UsersRound size={27} color={p.primary} />}</View><Text style={styles.small}>{group.visibility === 'private' ? '비공개 그룹 · 멤버만 볼 수 있어요' : '공개 그룹 · 누구나 바로 가입'}</Text><Text style={styles.heroTitle}>{group.name}</Text>{group.description ? <Text style={styles.description}>{group.description}</Text> : null}<Text style={styles.joined}>{group.memberCount}명이 함께 장소를 모으고 있어요</Text></View>
      {joined ? <>
        <Button title="지도에서 핀 남기기" onPress={() => router.push({ pathname: '/map', params: { group: groupId } })} />
        {group.visibility === 'private' ? <Button title="초대코드 보기" variant="secondary" loading={busy} onPress={() => void loadInvite()} /> : null}
        <Pressable accessibilityRole="button" style={styles.leave} onPress={() => Alert.alert('그룹에서 나갈까요?', '남긴 핀은 유지됩니다. 비공개 그룹은 다시 초대코드로 가입해야 해요.', [{ text: '취소', style: 'cancel' }, { text: '그룹 탈퇴', style: 'destructive', onPress: () => void changeMembership(false) }])}><Text style={styles.small}>그룹 탈퇴</Text></Pressable>
      </> : <Button title={group.visibility === 'private' ? '초대코드로 가입' : '그룹 바로 가입'} loading={busy} onPress={() => group.visibility === 'private' ? setShowCode(true) : void changeMembership(true)} />}
      {canReadPins ? <View style={styles.actions}><View style={{ flex: 1 }}><Button title="지도에서 모아보기" variant="secondary" onPress={() => router.push({ pathname: '/map', params: { group: groupId } })} /></View><View style={{ flex: 1 }}><Button title="그룹 공유" variant="secondary" onPress={() => void share()} /></View></View> : null}
      {canReadPins ? <><View style={styles.sectionTitle}><MapPin color={p.primary} size={20} /><Text style={styles.cardTitle}>함께 모은 핀</Text><Text style={styles.small}>{posts.length}</Text></View>{postsError ? <Notice error>{postsError}</Notice> : null}{!posts.length && !postsLoading && !postsError ? <Empty title="첫 번째 핀을 남겨 보세요" description="함께 기억하고 싶은 장소를 지도에 기록해 보세요." /> : null}{posts.map(post => <PostCard key={post.id} post={post} />)}</> : null}
    </>}
    {actionError ? <Notice error>{actionError}</Notice> : null}
    <GroupSheet visible={showCode} title={joined ? '그룹 초대코드' : '초대코드로 가입'} onClose={() => { if (!busy) setShowCode(false) }}>
      {joined ? <><Text style={styles.description}>함께하고 싶은 사람에게 초대코드를 전달해 주세요.</Text><Text selectable style={styles.inviteCode}>{invite}</Text><Button title="초대코드 복사" onPress={() => { void Clipboard.setStringAsync(invite).then(() => Alert.alert('복사했어요', '초대코드를 친구에게 전달해 주세요.')).catch(e => setActionError(errorText(e))) }} /></> : <><Field label="초대코드" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="12자리 초대코드" /><Button title="가입하기" loading={busy} onPress={() => void changeMembership(true)} /></>}
      {actionError ? <Notice error>{actionError}</Notice> : null}
    </GroupSheet>
  </Screen>
}

function GroupSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.modal}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.modalHeader}><Text style={styles.cardTitle}>{title}</Text><Pressable accessibilityLabel="닫기" accessibilityRole="button" onPress={onClose} hitSlop={10}><X size={24} color={p.ink} /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
}
function errorText(e: unknown) { return e instanceof Error ? e.message : '처리하지 못했습니다. 다시 시도해 주세요.' }

const styles = StyleSheet.create({
  hero: { paddingVertical: 22, gap: 12 }, heroIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: p.primarySoft, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: p.ink, fontWeight: '800', fontSize: 27, lineHeight: 36 }, description: { color: p.muted, fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 10, marginVertical: 10 }, row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  groupCard: { backgroundColor: p.paper, borderWidth: 1, borderColor: p.line, borderRadius: 20, padding: 18, gap: 14, marginTop: 12 }, groupIcon: { backgroundColor: p.primarySoft, width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: p.ink, fontSize: 18, fontWeight: '700' }, small: { color: p.muted, fontSize: 12, lineHeight: 19 }, joined: { color: p.primary, fontSize: 12, fontWeight: '600' },
  leave: { paddingVertical: 14, alignItems: 'center' }, sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 16 },
  modal: { flex: 1, backgroundColor: p.bg }, modalHeader: { padding: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: p.line }, modalBody: { padding: 22, gap: 18, paddingBottom: 45 }, inviteCode: { color: p.primary, fontWeight: '800', fontSize: 28, letterSpacing: 3, textAlign: 'center', paddingVertical: 24 },
})
