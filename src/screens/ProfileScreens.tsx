import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Modal, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../components/Typography';
import { RemoteImage } from '../components/RemoteImage';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, Ban, BookOpen, Camera, Check, ChevronLeft, ChevronRight, Clock, Crop, Ellipsis, Flag, Grid3X3, Heart, Lock, LogOut, MapPin, MessageCircle, RefreshCw, Save, Settings, UserMinus, UserX, UserPlus, UserRoundCheck, X } from 'lucide-react-native'
import { updateProfile } from 'firebase/auth'
import { Avatar, Button, Empty, Field, IconButton, Notice, QuietSurface, Screen, elevation, p, s } from '../components/ui'
import { Dialog } from '../components/Dialog'
import { PinThemeEditor } from '../components/PinThemeEditor'
import { PhotoEditor } from '../components/PhotoEditor'
import { PageHeading } from '../components/PageHeading'
import { ReportDialog } from '../components/ReportButton'
import { BlockUserDialog } from '../components/BlockUserDialog'
import { useBlockedUsers } from '../hooks/useBlockedUsers'
import { unblockUser } from '../services/blockService'
import { formatTimestamp } from '../lib/date'
import { PinAlbumGrid } from '../components/PinAlbumGrid'
import { useAuth } from '../hooks/useAuth'
import { useLikedPosts, useProfileAlbum, type LikedPostsState, type ProfileAlbumState } from '../hooks/useProfileAlbum'
import { policyNavigation } from '../lib/policyNavigation'
import { OPERATOR_PHONE, OPERATOR_PHONE_URL } from '../lib/operatorContact'
import { BIO_MAX_LENGTH, NICKNAME_MAX_LENGTH, USERNAME_MAX_LENGTH, getUsernameError } from '../lib/userProfile'
import { authErrorMessage, logout } from '../services/authService'
import { DeleteAccountDialog } from '../components/DeleteAccountDialog'
import { getOrCreateDirectChat } from '../services/chatService'
import {
  acceptFollowRequest, cancelFollowRequest, declineFollowRequest, followUser,
  getFollowers, getFollowing, getIncomingFollowRequests, hasPendingFollowRequest,
  isFollowing, removeFollower, unfollowUser,
} from '../services/followService'
import { uploadProfilePhoto, type UploadPhoto } from '../services/storageService'
import { getUserProfile, updateUserPrivacy, updateUserProfileDetails } from '../services/userService'
import type { FollowEdge, FollowRequest } from '../types/follow'
import type { ReportTarget } from '../types/moderation'
import type { DaymarkUser } from '../types/user'
import { pickProfilePhoto } from './AuthScreens'

type FollowListKind = 'followers' | 'following'
type ProfileDetails = { user: DaymarkUser | null; followed: boolean; requested: boolean }
const sortedPeople = (people: FollowEdge[]) => [...people].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))

export function ProfileScreen() {
  const { currentUser } = useAuth()
  const { tab } = useLocalSearchParams<{ tab?: string }>()
  return currentUser ? <PersonProfile key={currentUser.uid} userId={currentUser.uid} tab={tab} /> : <Screen title="내 프로필"><Empty title="로그인하고 내 기록을 만나보세요" /><Button title="로그인" onPress={() => router.push('/login')} /></Screen>
}

export function PersonProfileScreen() {
  const { userId, from } = useLocalSearchParams<{ userId: string; from?: string }>()
  return <PersonProfile key={userId} userId={userId || ''} from={from} />
}

// Profile: identity and counts first, then the same square pin grid as the feed.
function PersonProfile({ userId, from, tab: requestedTab }: { userId: string; from?: string; tab?: string }) {
  const { currentUser, profile, refreshProfile } = useAuth()
  const { width } = useWindowDimensions()
  const [details, setDetails] = useState<ProfileDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [action, setAction] = useState('')
  const [revision, setRevision] = useState(0)
  const [list, setList] = useState<FollowListKind | null>(null)
  const actionLock = useRef(false)
  const own = currentUser?.uid === userId
  const viewerUid = currentUser?.uid
  const { ids: blockedIds } = useBlockedUsers()
  const blocked = !own && blockedIds.has(userId)
  // Tabs replace the URL parameter, so returning from a pin lands on the same tab.
  const tab = own && requestedTab === 'likes' ? 'likes' : 'pins'
  const albumState = useProfileAlbum(userId, viewerUid, revision)
  const likedState = useLikedPosts(viewerUid, own && tab === 'likes')
  const pinCount = albumState.album && albumState.album.access !== 'locked' ? albumState.album.posts.length : null

  useFocusEffect(useCallback(() => {
    let active = true
    setLoading(true); setLoadError('')
    Promise.all([
      getUserProfile(userId, true),
      own || !viewerUid ? Promise.resolve(false) : isFollowing(viewerUid, userId),
      own || !viewerUid ? Promise.resolve(false) : hasPendingFollowRequest(viewerUid, userId),
    ]).then(([user, followed, requested]) => {
      if (active) setDetails({ user: user?.onboardingComplete === false ? null : user, followed, requested })
    }).catch(err => { if (active) setLoadError(authErrorMessage(err, '프로필을 불러오지 못했습니다.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [own, viewerUid, userId, revision]))

  const user = own && profile?.onboardingComplete !== false ? profile : details?.user

  async function follow() {
    if (!profile || !viewerUid || !user || own || actionLock.current) return
    actionLock.current = true; setAction('follow'); setActionError('')
    try {
      if (details?.followed) await unfollowUser(viewerUid, userId)
      else if (details?.requested) await cancelFollowRequest(viewerUid, userId)
      else await followUser(profile, user)
      await refreshProfile()
      setRevision(value => value + 1)
    } catch (err) { setActionError(authErrorMessage(err, '팔로우 상태를 변경하지 못했습니다.')) }
    finally { actionLock.current = false; setAction('') }
  }

  async function unblock() {
    if (!viewerUid || actionLock.current) return
    actionLock.current = true; setAction('unblock'); setActionError('')
    try { await unblockUser(viewerUid, userId); setRevision(value => value + 1) }
    catch (err) { setActionError(authErrorMessage(err, '차단을 해제하지 못했습니다.')) }
    finally { actionLock.current = false; setAction('') }
  }

  async function chat() {
    if (!profile || !user || actionLock.current) return
    actionLock.current = true; setAction('chat'); setActionError('')
    try { const chatId = await getOrCreateDirectChat(profile, user); router.push(`/chats/${chatId}`) }
    catch (err) { setActionError(authErrorMessage(err, '채팅을 시작하지 못했습니다.')) }
    finally { actionLock.current = false; setAction('') }
  }

  const followed = !!details?.followed
  const requested = !!details?.requested
  const FollowIcon = followed ? UserRoundCheck : requested ? Clock : UserPlus
  const handle = user ? (user.username ? `@${user.username}` : user.nickname || '피노리 사용자') : (own ? '내 프로필' : '프로필')
  const name = user?.nickname || '피노리 사용자'
  const followers = user?.followerCount || 0
  const following = user?.followingCount || 0
  const edgeToEdge = width <= 640
  return <Screen maxWidth={760} contentStyle={v.page} refreshing={loading} onRefresh={() => setRevision(value => value + 1)}>
    <View style={v.topbar}>
      {!own && <IconButton label="사람 목록으로 돌아가기" onPress={() => router.push(from && /^\/people(?:\?|$)/.test(from) ? from : '/people')} style={{ marginLeft: -10 }}><ChevronLeft size={24} color={p.ink} /></IconButton>}
      <Text numberOfLines={1} style={v.handle}>{handle}</Text>
      {own ? <IconButton label="프로필 설정" onPress={() => router.push('/profile/settings')}><Settings size={22} color={p.ink} /></IconButton>
        : !!user && <ProfileMoreMenu user={user} blocked={blocked} onUnblock={() => void unblock()} />}
    </View>
    {loading && !user && <Text style={v.state}>프로필을 불러오는 중입니다.</Text>}
    {!!loadError && <View style={{ gap: 10 }}><Notice error>{loadError}</Notice><Button title="다시 시도" variant="secondary" disabled={loading} onPress={() => setRevision(value => value + 1)} /></View>}
    {!loading && !loadError && !user && <Empty title="프로필을 찾을 수 없습니다." description="탈퇴했거나 아직 프로필을 완성하지 않은 사용자입니다." />}
    {user && <View accessibilityLabel="프로필" style={v.header}>
      <View style={v.profileSummary}>
        {user.photoURL ? <RemoteImage uri={user.photoURL} accessibilityLabel={`${name} 프로필 사진`} style={v.avatar} />
          : <View style={[v.avatar, v.initial]}><Text style={v.initialText}>{name.slice(0, 1) || 'S'}</Text></View>}
        <View style={v.stats}>
          <View accessibilityLabel={pinCount === null ? '핀 수를 볼 수 없어요' : `핀 ${pinCount}개`} style={v.stat}><Text style={v.statNumber}>{pinCount ?? '–'}</Text><Text style={v.statLabel}>핀</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`팔로워 ${followers}명 보기`} onPress={() => setList('followers')} style={({ pressed }) => [v.stat, pressed && { backgroundColor: p.surface }]}><Text style={v.statNumber}>{followers}</Text><Text style={v.statLabel}>팔로워</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`팔로잉 ${following}명 보기`} onPress={() => setList('following')} style={({ pressed }) => [v.stat, pressed && { backgroundColor: p.surface }]}><Text style={v.statNumber}>{following}</Text><Text style={v.statLabel}>팔로잉</Text></Pressable>
        </View>
      </View>
      <View style={v.identity}>
        <Text accessibilityRole="header" style={v.name}>{name}</Text>
        <Text selectable style={[v.bio, !user.bio && { color: p.muted }]}>{user.bio || '아직 소개글이 없습니다.'}</Text>
        {!!user.isPrivate && <View style={v.profilePrivacy}><Lock size={14} color={p.muted} style={{ marginTop: 2 }} /><Text style={v.privacyText}>{own ? '비공개 계정 · 새 팔로우 요청은 설정에서 승인할 수 있습니다.' : '비공개 계정 · 팔로우 요청을 승인받아야 합니다.'}</Text></View>}
      </View>
      <View style={v.actions}>
        {own ? <Button title="프로필 편집" variant="secondary" style={v.action} onPress={() => router.push('/profile/settings')} /> : blocked ? <Button title={action === 'unblock' ? '해제 중…' : '차단 해제'} variant="secondary" style={v.action} icon={<Ban size={17} color={p.ink} />} disabled={!!action} onPress={() => void unblock()} /> : <>
          <Button title={action === 'follow' ? '처리 중…' : followed ? '팔로잉' : requested ? '요청 취소' : user.isPrivate ? '팔로우 요청' : '팔로우'} style={v.action}
            icon={<FollowIcon size={17} color={followed || requested ? p.ink : p.paper} />}
            variant={followed || requested ? 'secondary' : 'primary'} disabled={!!action || loading || !!loadError || !profile} onPress={follow} />
          <Button title={action === 'chat' ? '채팅 여는 중…' : '채팅'} variant="secondary" style={v.action} icon={<MessageCircle size={17} color={p.ink} />} disabled={!!action || !profile} onPress={chat} />
        </>}
      </View>
    </View>}
    {!!actionError && <Notice error>{actionError}</Notice>}
    {user && blocked && <View style={v.stateBox}><Ban color={p.muted} size={26} /><Text style={v.stateText}>차단한 사용자입니다.</Text><Text style={v.stateSmall}>차단을 해제하면 이 사용자의 핀과 댓글, 메시지를 다시 볼 수 있어요.</Text></View>}
    {user && !blocked && <>
      {own ? <View accessibilityRole="tablist" accessibilityLabel="프로필 핀 보기" style={v.tabs}>
        <ProfileTab label="핀" icon={Grid3X3} selected={tab === 'pins'} onPress={() => router.setParams({ tab: '' })} />
        <ProfileTab label="좋아요" icon={Heart} selected={tab === 'likes'} onPress={() => router.setParams({ tab: 'likes' })} />
      </View> : <View style={v.tabs}><ProfileTab label="핀" icon={Grid3X3} selected /></View>}
      <View style={[v.grid, edgeToEdge && { marginHorizontal: -16 }]}>
        {tab === 'likes' ? <LikedPinAlbum state={likedState} /> : <ProfilePinAlbum state={albumState} own={own} />}
      </View>
    </>}
    {user && list && <FollowList user={user} kind={list} onClose={() => setList(null)} />}
  </Screen>
}

function ProfileTab({ label, icon: Icon, selected, onPress }: { label: string; icon: typeof Grid3X3; selected: boolean; onPress?: () => void }) {
  const color = selected ? p.ink : p.light
  return <Pressable accessibilityRole={onPress ? 'tab' : 'header'} accessibilityState={{ selected }} disabled={!onPress} onPress={onPress} style={[v.tab, selected && v.tabActive]}>
    <Icon size={18} color={color} /><Text style={[v.tabText, { color }, selected && { fontWeight: '700' }]}>{label}</Text>
  </Pressable>
}

// Reports live in an overflow menu so they stay reachable without competing with follow and chat.
function ProfileMoreMenu({ user, blocked, onUnblock }: { user: DaymarkUser; blocked: boolean; onUnblock: () => void }) {
  const { width } = useWindowDimensions()
  const buttonRef = useRef<View>(null)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)
  const [report, setReport] = useState<ReportTarget | null>(null)
  const [blocking, setBlocking] = useState(false)
  const name = user.nickname || '피노리 사용자'
  const items: { label: string; target: ReportTarget }[] = [
    { label: '사용자 신고', target: { kind: 'user', targetId: user.uid, label: name } },
    ...(user.photoURL ? [{ label: '프로필 사진 신고', target: { kind: 'photo', sourceKind: 'user', targetId: user.uid, photoUrl: user.photoURL, label: `${name} 프로필 사진` } as ReportTarget }] : []),
  ]
  function open() {
    buttonRef.current?.measureInWindow((x, y, w, h) => setAnchor({ top: y + h + 4, right: Math.max(8, width - (x + w)) }))
  }
  return <>
    <View ref={buttonRef} collapsable={false}><IconButton label="더보기" selected={!!anchor} onPress={open}><Ellipsis size={22} color={p.ink} /></IconButton></View>
    <Modal visible={!!anchor} transparent animationType="fade" onRequestClose={() => setAnchor(null)}>
      <Pressable accessibilityLabel="메뉴 닫기" style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)} />
      {anchor && <View accessibilityLabel={`${name} 더보기`} style={[v.menu, elevation.dialog, anchor]}>
        {items.map(item => <Pressable key={item.label} accessibilityRole="menuitem" onPress={() => { setAnchor(null); setReport(item.target) }} style={({ pressed }) => [v.menuItem, pressed && { backgroundColor: p.surface }]}>
          <Flag size={16} color={p.ink} /><Text style={v.menuText}>{item.label}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="menuitem" onPress={() => { setAnchor(null); if (blocked) onUnblock(); else setBlocking(true) }} style={({ pressed }) => [v.menuItem, pressed && { backgroundColor: p.errorSoft }]}>
          <Ban size={16} color={p.danger} /><Text style={[v.menuText, { color: p.danger }]}>{blocked ? '차단 해제' : '사용자 차단'}</Text>
        </Pressable>
      </View>}
    </Modal>
    {report && <ReportDialog target={report} onClose={() => setReport(null)} />}
    {blocking && <BlockUserDialog target={{ uid: user.uid, nickname: name, photoURL: user.photoURL }} onClose={() => setBlocking(false)} />}
  </>
}

// Settings list of blocked members; each row unblocks in place.
function BlockedUsersSection() {
  const { currentUser } = useAuth()
  const { users, error: loadError } = useBlockedUsers()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  async function unblock(uid: string) {
    if (!currentUser || busy) return
    setBusy(uid); setError('')
    try { await unblockUser(currentUser.uid, uid) } catch (err) { setError(authErrorMessage(err, '차단을 해제하지 못했습니다.')) } finally { setBusy('') }
  }
  return <View style={v.settingsSection}>
    <Text accessibilityRole="header" style={[v.settingsHeading, { marginBottom: 10 }]}>차단한 사용자 {users.length ? users.length : ''}</Text>
    {!!(error || loadError) && <Notice error>{error || loadError}</Notice>}
    {!users.length ? <Text style={[s.muted, { paddingVertical: 12 }]}>차단한 사용자가 없습니다. 프로필이나 기록, 댓글, 채팅 메뉴에서 차단할 수 있어요.</Text>
      : users.map((user, index) => <View key={user.uid} style={[v.listRow, index > 0 && v.policyDivider]}>
        <Pressable style={v.personLink} accessibilityRole="link" accessibilityLabel={`${user.nickname} 프로필`} onPress={() => router.push(`/people/${user.uid}`)}>
          <Avatar uri={user.photoURL} name={user.nickname} size={40} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={1} style={v.listName}>{user.nickname}</Text>{user.createdAt ? <Text style={s.muted}>{formatTimestamp(user.createdAt)} 차단</Text> : null}</View>
        </Pressable>
        <Button title={busy === user.uid ? '해제 중' : '차단 해제'} variant="secondary" style={v.rowButton} disabled={!!busy} onPress={() => void unblock(user.uid)} />
      </View>)}
  </View>
}

function ProfilePinAlbum({ state, own }: { state: ProfileAlbumState; own: boolean }) {
  const { album, loading, error, retry } = state
  return <View accessibilityLabel={own ? '내 핀' : '핀'}>
    {loading && <Text style={v.state}>핀을 불러오는 중입니다.</Text>}
    {!!error && <View style={v.stateBox}><Text style={v.stateText}>{error}</Text><Button title="다시 시도" variant="secondary" onPress={retry} /></View>}
    {!loading && album?.access === 'locked' && <View style={v.stateBox}><Lock color={p.muted} size={26} /><Text style={v.stateText}>비공개 계정입니다.</Text><Text style={v.stateSmall}>팔로우 요청이 승인되면 공개된 핀을 볼 수 있어요.</Text></View>}
    {!loading && album && album.access !== 'locked' && (album.posts.length ? <PinAlbumGrid posts={album.posts} showVisibility={own} />
      : <View style={v.stateBox}><MapPin size={28} color={p.muted} /><Text style={v.stateText}>{own ? '아직 남긴 핀이 없습니다.' : '볼 수 있는 핀이 없습니다.'}</Text></View>)}
  </View>
}

function LikedPinAlbum({ state }: { state: LikedPostsState }) {
  const { posts, loading, error, retry } = state
  return <View accessibilityLabel="좋아요한 핀">
    {loading && <Text style={v.state}>좋아요한 핀을 불러오는 중이에요.</Text>}
    {!!error && <View style={v.stateBox}><Text style={v.stateText}>{error}</Text><Button title="다시 시도" variant="secondary" icon={<RefreshCw size={17} color={p.ink} />} onPress={retry} /></View>}
    {!loading && !error && (posts.length ? <PinAlbumGrid posts={posts} />
      : <View style={v.stateBox}><Heart size={28} color={p.muted} /><Text style={v.stateText}>아직 좋아요한 핀이 없어요.</Text>
        <Text style={v.stateSmall}>피드나 지도에서 마음에 드는 핀에 좋아요를 눌러보세요.</Text>
        <Button title="피드 둘러보기" variant="secondary" onPress={() => router.push('/feed')} style={{ marginTop: 8 }} />
      </View>)}
  </View>
}

function SettingsStats({ user, onOpen }: { user: Pick<DaymarkUser, 'followerCount' | 'followingCount'>; onOpen: (kind: FollowListKind) => void }) {
  return <View style={v.settingsStats}>{(['followers', 'following'] as const).map(kind => {
    const label = kind === 'followers' ? '팔로워' : '팔로잉'
    const count = (kind === 'followers' ? user.followerCount : user.followingCount) || 0
    return <Pressable key={kind} accessibilityRole="button" accessibilityLabel={`${label} ${count}명`} onPress={() => onOpen(kind)} style={({ pressed }) => [v.settingsStat, pressed && { opacity: 0.6 }]}>
      <Text style={v.settingsStatLabel}>{label}</Text><Text style={v.settingsStatNumber}>{count}</Text>
    </Pressable>
  })}</View>
}

function RecordsLink({ style }: { style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="link" onPress={() => router.push('/my')} style={({ pressed }) => [v.recordsLink, pressed && { backgroundColor: p.coralSoft }, style]}><BookOpen size={17} color={p.coral} /><Text style={v.recordsText}>내 기록</Text><ChevronRight size={16} color={p.coral} /></Pressable>
}


function FollowList({ user, kind, manage = false, onClose, onChanged }: {
  user: DaymarkUser; kind: FollowListKind; manage?: boolean; onClose: () => void; onChanged?: () => void
}) {
  const { width } = useWindowDimensions()
  const [people, setPeople] = useState<FollowEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const lock = useRef(false)
  const [revision, setRevision] = useState(0)
  const title = kind === 'followers' ? '팔로워' : '팔로잉'
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const request = kind === 'followers' ? getFollowers(user.uid) : getFollowing(user.uid)
    request.then(next => { if (active) setPeople(sortedPeople(next)) })
      .catch(err => { if (active) setError(authErrorMessage(err, '목록을 불러오지 못했습니다.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user.uid, kind, revision])

  async function remove(person: FollowEdge) {
    if (lock.current) return
    lock.current = true; setBusy(person.uid); setError('')
    try {
      if (kind === 'followers') await removeFollower(user.uid, person.uid)
      else await unfollowUser(user.uid, person.uid)
      setPeople(previous => previous.filter(item => item.uid !== person.uid)); onChanged?.()
    } catch (err) { setError(authErrorMessage(err, '팔로우 관계를 변경하지 못했습니다.')) }
    finally { lock.current = false; setBusy('') }
  }
  return <Dialog visible title={title} onClose={onClose} busy={!!busy}>
    {!manage && <Text style={[v.toolbarText, { marginTop: -10 }]}>{user.nickname}</Text>}
    {!!error && <View style={{ gap: 10 }}><Notice error>{error}</Notice><Button title="다시 시도" variant="secondary" onPress={() => setRevision(value => value + 1)} /></View>}
    {loading && <Text style={v.followEmpty}>목록을 불러오는 중입니다.</Text>}
    {!loading && !error && !people.length && <Text style={v.followEmpty}>{manage ? `아직 ${title} 목록이 없습니다.` : `아직 ${title}가 없습니다.`}</Text>}
    {!loading && people.length > 0 && <View>{people.map(person => manage
      ? <View key={person.uid} style={[v.followRow, width <= 620 && { flexWrap: 'wrap' }]}>
        <Pressable style={v.personLink} accessibilityRole="link" accessibilityLabel={`${person.nickname} 프로필`} onPress={() => { onClose(); router.push(`/people/${person.uid}`) }}>
          <Avatar uri={person.photoURL} name={person.nickname} size={48} /><View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text numberOfLines={1} style={v.personName}>{person.nickname}</Text><Text numberOfLines={1} style={s.muted}>{kind === 'followers' ? '나를 팔로우 중' : '내가 팔로우 중'}</Text></View>
        </Pressable>
        <Button title={busy === person.uid ? '처리 중' : kind === 'followers' ? '제거' : '팔로잉 취소'} variant="secondary" style={width <= 620 ? { width: '100%' } : { minWidth: 112 }} icon={<UserMinus size={17} color={p.ink} />} disabled={!!busy} onPress={() => remove(person)} />
      </View>
      : <Pressable key={person.uid} accessibilityRole="link" accessibilityLabel={`${person.nickname || '사용자'} 프로필 보기`} onPress={() => { onClose(); router.push(`/people/${person.uid}`) }} style={({ pressed }) => [v.summary, pressed && { backgroundColor: p.surface }]}>
        <Avatar uri={person.photoURL} name={person.nickname} size={48} /><Text numberOfLines={2} style={[v.personName, { flex: 1, fontSize: 16 }]}>{person.nickname || '피노리 사용자'}</Text>
      </Pressable>)}</View>}
  </Dialog>
}

export function ProfileSettingsScreen() {
  const { currentUser, profile, refreshProfile } = useAuth()
  const { width } = useWindowDimensions()
  const narrow = width <= 620
  const [username, setUsername] = useState(profile?.username || '')
  const [nickname, setNickname] = useState(profile?.nickname || '')
  const [bio, setBio] = useState(profile?.bio || '')
  const [isPrivate, setPrivate] = useState(!!profile?.isPrivate)
  const [photo, setPhoto] = useState<UploadPhoto | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<UploadPhoto | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [requests, setRequests] = useState<FollowRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [requestsError, setRequestsError] = useState('')
  const [requestAction, setRequestAction] = useState('')
  const [list, setList] = useState<FollowListKind | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const initializedUid = useRef(profile?.uid)
  const actionLock = useRef(false)
  const requestLock = useRef(false)
  const requestRevision = useRef(0)
  const uid = currentUser?.uid

  useEffect(() => {
    if (profile && initializedUid.current !== profile.uid) {
      initializedUid.current = profile.uid
      setUsername(profile.username || ''); setNickname(profile.nickname); setBio(profile.bio || ''); setPrivate(!!profile.isPrivate)
    }
  }, [profile])

  const loadRequests = useCallback(async () => {
    if (!uid) return
    const revision = ++requestRevision.current
    setRequestsLoading(true); setRequestsError('')
    try { const result = await getIncomingFollowRequests(uid); if (revision === requestRevision.current) setRequests(sortedPeople(result)) }
    catch (err) { if (revision === requestRevision.current) setRequestsError(authErrorMessage(err, '팔로우 요청을 불러오지 못했습니다.')) }
    finally { if (revision === requestRevision.current) setRequestsLoading(false) }
  }, [uid])
  useEffect(() => { void loadRequests(); return () => { requestRevision.current++ } }, [loadRequests])

  async function save() {
    if (!currentUser || actionLock.current) return
    const validation = getUsernameError(username) || (!nickname.trim() ? '닉네임을 입력해 주세요.' : '')
    if (validation) { setError(validation); return }
    actionLock.current = true; setBusy('save'); setError(''); setMessage('')
    try {
      const photoURL = removePhoto ? '' : photo ? await uploadProfilePhoto(currentUser.uid, photo) : profile?.photoURL || ''
      await updateUserProfileDetails(currentUser.uid, { username, nickname, bio, photoURL })
      await updateProfile(currentUser, { displayName: nickname.trim(), photoURL })
      await updateUserPrivacy(currentUser.uid, isPrivate)
      await refreshProfile()
      setPhoto(null); setRemovePhoto(false); setMessage('프로필을 저장했습니다.')
    } catch (err) { setError(authErrorMessage(err, '프로필 저장에 실패했습니다.')) }
    finally { actionLock.current = false; setBusy('') }
  }

  async function choosePhoto() {
    try { const result = await pickProfilePhoto(); if (result) { setEditingPhoto(result); setMessage(''); setError('') } }
    catch (err) { setError(authErrorMessage(err)) }
  }

  async function respond(request: FollowRequest, accept: boolean) {
    if (!profile || !uid || requestLock.current) return
    requestLock.current = true; setRequestAction(request.uid); setRequestsError(''); setMessage('')
    try {
      if (accept) await acceptFollowRequest(profile, request)
      else await declineFollowRequest(uid, request.uid)
      setRequests(previous => previous.filter(item => item.uid !== request.uid))
      setMessage(accept ? '팔로우 요청을 승인했습니다.' : '팔로우 요청을 거절했습니다.')
      await Promise.all([loadRequests(), refreshProfile()])
    } catch (err) { setRequestsError(authErrorMessage(err, accept ? '팔로우 요청을 승인하지 못했습니다.' : '팔로우 요청을 거절하지 못했습니다.')) }
    finally { requestLock.current = false; setRequestAction('') }
  }

  async function signOut() {
    if (actionLock.current) return
    actionLock.current = true; setBusy('logout'); setError('')
    try { await logout(); router.replace('/login') }
    catch (err) { setError(authErrorMessage(err)) }
    finally { actionLock.current = false; setBusy('') }
  }

  if (!currentUser || !profile) return <Screen title="프로필 설정" back><Empty title="프로필을 불러오는 중입니다" /><Button title="다시 불러오기" onPress={() => { void refreshProfile().catch(err => setError(authErrorMessage(err))) }} />{!!error && <Notice error>{error}</Notice>}</Screen>

  const shownPhoto = removePhoto ? undefined : photo?.uri || profile.photoURL || undefined
  const hasPhoto = !!(photo || (!removePhoto && profile.photoURL))
  return <Screen maxWidth={808}>
    <Pressable accessibilityRole="link" style={[s.row, v.back]} onPress={() => router.push('/profile')}><ArrowLeft size={18} color={p.muted} /><Text style={v.toolbarText}>내 프로필</Text></Pressable>
    <PageHeading eyebrow="Settings" title="프로필 설정" description="내 계정과 표시 이름을 관리합니다." />
    <View style={[v.panel, narrow && { gap: 8 }]}>
      <View style={[s.row, { gap: narrow ? 14 : 16 }]}>
        <Avatar uri={shownPhoto} name={nickname} size={62} />
        <View style={v.panelIdentity}>
          <Text style={v.panelName}>{profile.nickname || '피노리 사용자'}</Text>
          {!!profile.username && <Text style={v.panelHandle}>@{profile.username}</Text>}
          <SettingsStats user={profile} onOpen={setList} />
          {!!profile.bio && <Text style={v.panelBio}>{profile.bio}</Text>}
          {!!profile.isPrivate && <View style={v.privateBadge}><Lock size={13} color={p.ink} /><Text style={{ color: p.ink, fontSize: 12, fontWeight: '700' }}>비공개</Text></View>}
        </View>
        {!narrow && <RecordsLink />}
      </View>
      {narrow && <RecordsLink style={{ marginLeft: 76, alignSelf: 'flex-start' }} />}
    </View>
    {(profile.isPrivate || requests.length > 0 || requestsLoading) && <View style={v.requestPanel}>
      <View style={s.between}><View style={{ gap: 4 }}><Text style={v.requestLabel}>팔로우 요청</Text><Text style={v.requestCount}>{requests.length}</Text></View>
        <Button title="새로고침" variant="secondary" disabled={requestsLoading} onPress={() => void loadRequests()} /></View>
      {!!requestsError && <Notice error>{requestsError}</Notice>}
      {requestsLoading && <Text style={v.followEmpty}>요청을 불러오는 중입니다.</Text>}
      {!requestsLoading && !requests.length ? <Text style={v.followEmpty}>대기 중인 요청이 없습니다.</Text> : <View>{requests.map(request => <View key={request.uid} style={[v.followRow, narrow && { flexWrap: 'wrap' }]}>
        <Pressable style={v.personLink} accessibilityRole="link" accessibilityLabel={`${request.nickname} 프로필`} onPress={() => router.push(`/people/${request.uid}`)}><Avatar uri={request.photoURL} name={request.nickname} size={48} /><View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text numberOfLines={1} style={v.personName}>{request.nickname}</Text><Text style={s.muted}>승인 대기 중</Text></View></Pressable>
        <View style={[v.requestActions, narrow && { width: '100%' }]}><Button title="승인" style={narrow ? { flex: 1 } : { minWidth: 86 }} icon={<Check size={17} color={p.paper} />} onPress={() => respond(request, true)} disabled={!!requestAction} loading={requestAction === request.uid} /><Button title="거절" variant="secondary" style={narrow ? { flex: 1 } : { minWidth: 86 }} icon={<X size={17} color={p.ink} />} onPress={() => respond(request, false)} disabled={!!requestAction} /></View>
      </View>)}</View>}
    </View>}
    <QuietSurface.Provider value>
      <View style={v.form}>
        <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="프로필 사진 변경 및 자르기" disabled={!!busy} onPress={choosePhoto} style={({ pressed }) => [v.photoPicker, pressed && { opacity: 0.7 }]}><Camera size={18} color={p.muted} /><Text numberOfLines={1} style={v.photoPickerText}>{photo?.name || '프로필 사진 변경'}</Text></Pressable>
          {hasPhoto && <Button title="사진 편집" variant="secondary" tone="outline" icon={<Crop size={17} color={p.ink} />} onPress={() => setEditingPhoto(photo || { uri: profile.photoURL })} disabled={!!busy} />}
          {hasPhoto && <Button title="사진 제거" variant="secondary" tone="outline" icon={<X size={17} color={p.ink} />} onPress={() => { setPhoto(null); setRemovePhoto(true); setMessage('') }} disabled={!!busy} />}
        </View>
        <View style={{ gap: 6 }}>
          <Field label="사용자 이름" icon={<Text style={{ color: p.muted, fontSize: 16, lineHeight: 20 }}>@</Text>} value={username} onChangeText={value => setUsername(value.toLowerCase())} autoCapitalize="none" autoCorrect={false} autoComplete="username" maxLength={USERNAME_MAX_LENGTH} editable={!busy} />
          <Text style={v.hint}>영어, 숫자, 밑줄(_), 점(.) · 최대 30자 · 다른 사용자와 중복될 수 없어요.</Text>
        </View>
        <Field label="닉네임" value={nickname} onChangeText={setNickname} maxLength={NICKNAME_MAX_LENGTH} editable={!busy} />
        <View style={{ gap: 6 }}>
          <Field label="소개글" value={bio} onChangeText={setBio} multiline maxLength={BIO_MAX_LENGTH} placeholder="나를 소개하는 한마디" editable={!busy} />
          <Text style={v.hint}>{bio.length} / {BIO_MAX_LENGTH}</Text>
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isPrivate, disabled: !!busy }} accessibilityLabel="비공개 계정, 새 팔로우를 승인제로 받기" disabled={!!busy} onPress={() => setPrivate(value => !value)} style={v.privacy}>
          <View style={[v.checkbox, isPrivate && v.checkboxOn]}>{isPrivate && <Check size={13} color={p.paper} strokeWidth={3} />}</View>
          <View style={{ flex: 1, gap: 5 }}><View style={[s.row, { gap: 7 }]}><Lock size={17} color={p.ink} /><Text style={{ color: p.ink, fontSize: 15, fontWeight: '700' }}>비공개 계정</Text></View><Text style={s.muted}>새 팔로우를 승인제로 받기</Text></View>
        </Pressable>
        <PinThemeEditor />
        {!!message && <Notice>{message}</Notice>}{!!error && <Notice error>{error}</Notice>}
        <View style={v.saveActions}><Button title={busy === 'save' ? '저장 중' : '변경사항 저장'} icon={<Save size={17} color={p.paper} />} style={{ minHeight: 46, paddingHorizontal: 24 }} onPress={save} loading={busy === 'save'} disabled={!!busy} /></View>
      </View>
    </QuietSurface.Provider>
    <BlockedUsersSection />
    <View style={v.settingsSection}><Text accessibilityRole="header" style={[v.settingsHeading, { marginBottom: 10 }]}>고객센터</Text>
      <Pressable accessibilityRole="link" onPress={() => router.push('/support')} style={({ pressed }) => [v.policyLink, pressed && { opacity: 0.6 }]}><Text style={v.policyText}>문의·신고 내역</Text><ChevronRight size={17} color={p.muted} /></Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel={`운영자에게 전화하기 ${OPERATOR_PHONE}`} onPress={() => void Linking.openURL(OPERATOR_PHONE_URL).catch(() => {})} style={({ pressed }) => [v.policyLink, v.policyDivider, pressed && { opacity: 0.6 }]}><Text style={v.policyText}>운영자 연락처</Text><Text style={[v.policyText, { color: p.primary, fontWeight: '600' }]}>{OPERATOR_PHONE}</Text></Pressable>
    </View>
    <View style={v.settingsSection}><Text accessibilityRole="header" style={[v.settingsHeading, { marginBottom: 10 }]}>약관 및 정책</Text>
      {[...policyNavigation.map(item => ({ title: item.title, href: `/policies/${item.id}` as const })), { title: '오픈소스 라이선스', href: '/licenses' as const }].map((item, index) => <Pressable key={item.href} accessibilityRole="link" onPress={() => router.push(item.href)} style={({ pressed }) => [v.policyLink, index > 0 && v.policyDivider, pressed && { opacity: 0.6 }]}>
        <Text style={v.policyText}>{item.title}</Text><ChevronRight size={17} color={p.muted} />
      </Pressable>)}
    </View>
    <View style={v.settingsSection}><Text accessibilityRole="header" style={[v.settingsHeading, { marginBottom: 10 }]}>계정 관리</Text>
      <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => Alert.alert('로그아웃', '피노리에서 로그아웃할까요?', [{ text: '취소', style: 'cancel' }, { text: '로그아웃', onPress: () => { void signOut() } }])} style={({ pressed }) => [v.logout, pressed && { opacity: 0.6 }]}>
        {busy === 'logout' ? <ActivityIndicator size="small" color={p.muted} /> : <LogOut size={18} color={p.muted} />}<Text style={[v.policyText, { flex: 1 }]}>로그아웃</Text><ChevronRight size={17} color={p.muted} />
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => setDeleteOpen(true)} style={({ pressed }) => [v.logout, v.policyDivider, pressed && { opacity: 0.6 }]}>
        <UserX size={18} color={p.danger} /><Text style={[v.policyText, { flex: 1, color: p.danger }]}>회원 탈퇴</Text><ChevronRight size={17} color={p.muted} />
      </Pressable>
    </View>
    {list && <FollowList user={profile} kind={list} manage onClose={() => setList(null)} onChanged={() => { void refreshProfile().catch(err => setError(authErrorMessage(err))) }} />}
    <PhotoEditor photo={editingPhoto} square onClose={() => setEditingPhoto(null)} onSave={value => { setPhoto(value); setRemovePhoto(false); setEditingPhoto(null); setMessage(''); setError('') }} />
    <DeleteAccountDialog visible={deleteOpen} onClose={() => setDeleteOpen(false)} />
  </Screen>
}

const v = StyleSheet.create({
  toolbarText: { color: p.muted, fontSize: 14.4 }, back: { gap: 8, minHeight: 44, alignSelf: 'flex-start' },
  page: { paddingTop: 8, gap: 0 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 52 },
  handle: { flex: 1, minWidth: 0, color: p.ink, fontSize: 18, fontWeight: '700' },
  state: { color: p.muted, fontSize: 14, lineHeight: 25, textAlign: 'center', paddingVertical: 32 },
  header: { gap: 12, paddingTop: 8, paddingBottom: 16 },
  profileSummary: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: p.surface },
  initial: { alignItems: 'center', justifyContent: 'center', backgroundColor: p.primary }, initialText: { color: p.paper, fontSize: 30, fontWeight: '900' },
  stats: { flex: 1, minWidth: 0, flexDirection: 'row' },
  stat: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 8 },
  statNumber: { color: p.ink, fontSize: 18, lineHeight: 23, fontWeight: '700' }, statLabel: { color: p.muted, fontSize: 12 },
  identity: { gap: 2, minWidth: 0 },
  name: { color: p.ink, fontSize: 15, fontWeight: '700' },
  bio: { color: p.ink, fontSize: 14, lineHeight: 22 },
  profilePrivacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 }, privacyText: { flex: 1, color: p.muted, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 }, action: { flex: 1, minHeight: 44, paddingHorizontal: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: p.line },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: p.transparent },
  tabActive: { borderBottomColor: p.ink }, tabText: { fontSize: 13, fontWeight: '500' },
  grid: { marginTop: 3 },
  settingsStats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 }, settingsStat: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }, settingsStatLabel: { color: p.muted, fontSize: 13.6 }, settingsStatNumber: { color: p.ink, fontSize: 13.6, fontWeight: '700' },
  menu: { position: 'absolute', minWidth: 180, padding: 6, borderRadius: 10, backgroundColor: p.paper },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 6 },
  menuText: { color: p.ink, fontSize: 14 },
  stateBox: { paddingVertical: 48, paddingHorizontal: 16, alignItems: 'center', gap: 8 }, stateText: { color: p.muted, fontSize: 15, lineHeight: 24, textAlign: 'center' }, stateSmall: { color: p.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  followEmpty: { color: p.muted, textAlign: 'center', fontSize: 15, marginTop: 22, marginBottom: 4 },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: p.line },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 }, listName: { color: p.ink, fontSize: 15, fontWeight: '600' }, rowButton: { minHeight: 36, paddingVertical: 6, paddingHorizontal: 12 },
  personLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }, personName: { color: p.ink, fontSize: 17, fontWeight: '700' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 82, paddingVertical: 14, borderRadius: 8 },
  panel: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 }, panelIdentity: { flex: 1, minWidth: 0 },
  panelName: { color: p.ink, fontSize: 16, fontWeight: '700', marginTop: 5 }, panelHandle: { color: p.primary, fontSize: 16, marginTop: 5, marginBottom: 8 }, panelBio: { color: p.muted, fontSize: 13.6, lineHeight: 21, marginTop: 5 },
  privateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 7, minHeight: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: p.coralSoft },
  recordsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8, borderRadius: 8 }, recordsText: { color: p.coral, fontSize: 14, fontWeight: '700' },
  requestPanel: { gap: 12, paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.line },
  requestLabel: { color: p.ink, fontSize: 14, fontWeight: '600' }, requestCount: { color: p.ink, fontSize: 25.6, fontWeight: '700' },
  requestActions: { flexDirection: 'row', gap: 8 },
  form: { padding: 18, gap: 24 },
  photoPicker: { flex: 1, minWidth: 180, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: p.line, borderRadius: 8, backgroundColor: p.surface },
  photoPickerText: { color: p.muted, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  hint: { color: p.muted, fontSize: 12, lineHeight: 19 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.line },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: p.muted, alignItems: 'center', justifyContent: 'center', backgroundColor: p.paper }, checkboxOn: { borderColor: p.primary, backgroundColor: p.primary },
  saveActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 18, borderTopWidth: 1, borderColor: p.line },
  settingsSection: { marginTop: 12, paddingTop: 24, borderTopWidth: 1, borderColor: p.line }, settingsHeading: { color: p.muted, fontSize: 13.6, fontWeight: '700' },
  policyLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, paddingVertical: 8 }, policyDivider: { borderTopWidth: 1, borderColor: p.line }, policyText: { color: p.ink, fontSize: 14.7 },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 8 },
})
