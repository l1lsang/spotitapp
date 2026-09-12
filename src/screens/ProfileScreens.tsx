import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Camera, Grid3X3, Heart, List, Lock, MapPin, Settings, X } from 'lucide-react-native'
import { updateProfile } from 'firebase/auth'
import { Avatar, Button, Empty, Field, H, Notice, Row, Screen, Txt, p, s } from '../components/ui'
import { PinThemeEditor } from '../components/PinThemeEditor'
import { PhotoEditor } from '../components/PhotoEditor'
import { PostCard } from '../components/PostCard'
import { ReportButton } from '../components/ReportButton'
import { useAuth } from '../hooks/useAuth'
import { policyNavigation } from '../lib/policyNavigation'
import { BIO_MAX_LENGTH, NICKNAME_MAX_LENGTH, USERNAME_MAX_LENGTH, getUsernameError } from '../lib/userProfile'
import { authErrorMessage, deleteAccount, logout, reauthenticateAccount } from '../services/authService'
import { getOrCreateDirectChat } from '../services/chatService'
import {
  acceptFollowRequest, cancelFollowRequest, declineFollowRequest, followUser,
  getFollowers, getFollowing, getIncomingFollowRequests, hasPendingFollowRequest,
  isFollowing, removeFollower, unfollowUser,
} from '../services/followService'
import { getProfilePosts } from '../services/postService'
import { uploadProfilePhoto, type UploadPhoto } from '../services/storageService'
import { getUserProfile, updateUserPrivacy, updateUserProfileDetails } from '../services/userService'
import type { FollowEdge, FollowRequest } from '../types/follow'
import type { DaymarkUser } from '../types/user'
import { pickProfilePhoto } from './AuthScreens'

type FollowListKind = 'followers' | 'following'
type ProfileDetails = { user: DaymarkUser | null; followed: boolean; requested: boolean }
const sortedPeople = (people: FollowEdge[]) => [...people].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))

export function ProfileScreen() {
  const { currentUser } = useAuth()
  return currentUser ? <PersonProfile key={currentUser.uid} userId={currentUser.uid} /> : <Screen title="내 프로필"><Empty title="로그인하고 내 기록을 만나보세요" /><Button title="로그인" onPress={() => router.push('/login')} /></Screen>
}

export function PersonProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  return <PersonProfile key={userId} userId={userId || ''} />
}

function PersonProfile({ userId }: { userId: string }) {
  const { currentUser, profile, refreshProfile } = useAuth()
  const [details, setDetails] = useState<ProfileDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [action, setAction] = useState('')
  const [revision, setRevision] = useState(0)
  const [list, setList] = useState<FollowListKind | null>(null)
  const actionLock = useRef(false)
  const own = currentUser?.uid === userId
  const viewerUid = currentUser?.uid

  useFocusEffect(useCallback(() => {
    let active = true
    setLoading(true); setError('')
    Promise.all([
      getUserProfile(userId, true),
      own || !viewerUid ? Promise.resolve(false) : isFollowing(viewerUid, userId),
      own || !viewerUid ? Promise.resolve(false) : hasPendingFollowRequest(viewerUid, userId),
    ]).then(([user, followed, requested]) => {
      if (active) setDetails({ user: user?.onboardingComplete === false ? null : user, followed, requested })
    }).catch(err => { if (active) setError(authErrorMessage(err, '프로필을 불러오지 못했습니다.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [own, viewerUid, userId, revision]))

  const user = own && profile?.onboardingComplete !== false ? profile : details?.user

  async function follow() {
    if (!profile || !viewerUid || !user || own || actionLock.current) return
    actionLock.current = true; setAction('follow'); setError('')
    try {
      if (details?.followed) await unfollowUser(viewerUid, userId)
      else if (details?.requested) await cancelFollowRequest(viewerUid, userId)
      else await followUser(profile, user)
      await refreshProfile()
      setRevision(value => value + 1)
    } catch (err) { setError(authErrorMessage(err)) }
    finally { actionLock.current = false; setAction('') }
  }

  async function chat() {
    if (!profile || !user || actionLock.current) return
    actionLock.current = true; setAction('chat'); setError('')
    try { const chatId = await getOrCreateDirectChat(profile, user); router.push(`/chats/${chatId}`) }
    catch (err) { setError(authErrorMessage(err, '채팅을 시작하지 못했습니다.')) }
    finally { actionLock.current = false; setAction('') }
  }

  return <Screen title={own ? '내 프로필' : '프로필'} back={!own} refreshing={loading} onRefresh={() => setRevision(value => value + 1)}
    right={own ? <Pressable style={v.iconButton} accessibilityRole="button" accessibilityLabel="프로필 설정" onPress={() => router.push('/profile/settings')}><Settings color={p.ink} size={23} /></Pressable> : undefined}>
    {loading && !user && <ActivityIndicator color={p.primary} />}
    {!!error && <Notice error>{error}</Notice>}
    {!loading && !user && <Empty title="프로필을 찾을 수 없습니다" description="탈퇴했거나 아직 프로필을 완성하지 않은 사용자입니다." />}
    {user && <>
      <View style={s.card}>
        <View style={v.identity}><Avatar uri={user.photoURL} name={user.nickname} size={90} />
          <View style={v.identityText}><Text style={v.nickname}>{user.nickname || '스팟잇 사용자'}</Text>
            {!!user.username && <Text style={v.handle}>@{user.username}</Text>}
            <View style={v.stats}>
              <Pressable accessibilityRole="button" accessibilityLabel={`팔로워 ${user.followerCount || 0}명`} onPress={() => setList('followers')} style={v.stat}><Text style={v.statNumber}>{user.followerCount || 0}</Text><Text style={s.muted}>팔로워</Text></Pressable>
              <View style={v.statDivider} />
              <Pressable accessibilityRole="button" accessibilityLabel={`팔로잉 ${user.followingCount || 0}명`} onPress={() => setList('following')} style={v.stat}><Text style={v.statNumber}>{user.followingCount || 0}</Text><Text style={s.muted}>팔로잉</Text></Pressable>
            </View>
          </View>
        </View>
        <View style={v.about}><Text style={v.sectionLabel}>소개</Text><Txt>{user.bio || '아직 소개글이 없습니다.'}</Txt></View>
        {!!user.isPrivate && <View style={v.privacyNote}><Lock size={15} color={p.muted} /><Text style={[s.muted, { flex: 1 }]}>{own ? '비공개 계정 · 새 팔로우 요청은 설정에서 승인할 수 있습니다.' : '비공개 계정 · 팔로우 요청을 승인받아야 합니다.'}</Text></View>}
        {own ? <Button title="프로필 편집" variant="secondary" onPress={() => router.push('/profile/settings')} /> : <>
          <View style={v.actions}><View style={{ flex: 1 }}><Button title={details?.followed ? '팔로잉' : details?.requested ? '요청 취소' : user.isPrivate ? '팔로우 요청' : '팔로우'}
            variant={details?.followed || details?.requested ? 'secondary' : 'primary'} loading={action === 'follow'} disabled={!!action || loading || !profile} onPress={follow} /></View>
            <View style={{ flex: 1 }}><Button title="채팅" variant="secondary" loading={action === 'chat'} disabled={!!action || !profile} onPress={chat} /></View></View>
          <View style={v.reportRow}><ReportButton target={{ kind: 'user', targetId: user.uid, label: user.nickname }} compact />
            {!!user.photoURL && <ReportButton target={{ kind: 'photo', sourceKind: 'user', targetId: user.uid, photoUrl: user.photoURL, label: `${user.nickname} 프로필 사진` }} label="사진 신고" compact />}</View>
        </>}
      </View>
      {own && <View style={s.card}><Text style={v.sectionLabel}>내 활동</Text>
        <Row title="좋아요" subtitle="좋아요한 핀 모아보기" onPress={() => router.push('/profile/likes')} right={<Heart size={22} color={p.coral} />} />
        <Row title="내 기록" subtitle="장소와 날짜로 돌아보는 나의 하루" onPress={() => router.push('/my')} />
        <Row title="내 그룹" subtitle="함께 쌓아가는 장소 기록" onPress={() => router.push('/groups')} />
      </View>}
      <ProfileAlbum ownerUid={user.uid} own={own} revision={revision} />
      {list && <FollowList user={user} kind={list} onClose={() => setList(null)} />}
    </>}
  </Screen>
}

function ProfileAlbum({ ownerUid, own, revision }: { ownerUid: string; own: boolean; revision: number }) {
  const { currentUser } = useAuth()
  const viewerUid = currentUser?.uid
  const [album, setAlbum] = useState<Awaited<ReturnType<typeof getProfilePosts>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [term, setTerm] = useState('')
  const [localRevision, setLocalRevision] = useState(0)

  useEffect(() => {
    let active = true
    setAlbum(null); setLoading(true); setError('')
    getProfilePosts(ownerUid, viewerUid).then(result => { if (active) setAlbum(result) })
      .catch(err => { if (active) setError(authErrorMessage(err, '핀을 불러오지 못했습니다.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [ownerUid, viewerUid, revision, localRevision])
  const query = term.trim().toLocaleLowerCase()
  const posts = (album?.posts || []).filter(post => !query || `${post.title} ${post.content} ${post.placeName} ${post.dateKey}`.toLocaleLowerCase().includes(query))

  return <View style={{ gap: 15 }}>
    <View style={s.between}><View style={s.row}><MapPin size={20} color={p.primary} /><H>{own ? '내 핀' : '핀'}</H>{album && album.access !== 'locked' && <Text style={v.count}>{album.posts.length}</Text>}</View>
      <View style={v.actions}><Pressable accessibilityRole="button" accessibilityLabel="사진 앨범 보기" accessibilityState={{ selected: layout === 'grid' }} onPress={() => setLayout('grid')} style={v.iconButton}><Grid3X3 color={layout === 'grid' ? p.primary : p.muted} size={20} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="기록 목록 보기" accessibilityState={{ selected: layout === 'list' }} onPress={() => setLayout('list')} style={v.iconButton}><List color={layout === 'list' ? p.primary : p.muted} size={20} /></Pressable></View>
    </View>
    {loading && <ActivityIndicator color={p.primary} />}
    {!!error && <><Notice error>{error}</Notice><Button title="다시 시도" variant="secondary" onPress={() => setLocalRevision(value => value + 1)} /></>}
    {album?.access === 'locked' && <View style={v.locked}><Lock color={p.muted} size={30} /><Empty title="비공개 계정입니다" description="팔로우 요청이 승인되면 공개된 핀을 볼 수 있어요." /></View>}
    {!loading && album && album.access !== 'locked' && <>
      {album.posts.length > 0 && <Field value={term} onChangeText={setTerm} placeholder="장소, 기록 또는 날짜 검색" accessibilityLabel="핀 검색" />}
      {!posts.length && <Empty title={query ? '검색 결과가 없습니다' : own ? '아직 남긴 핀이 없습니다' : '볼 수 있는 핀이 없습니다'} description={own && !query ? '지도에서 첫 장소를 기록해 보세요.' : undefined} />}
      {layout === 'grid' ? <View style={v.grid}>{posts.map(post => <Pressable key={post.id} style={v.tile} accessibilityRole="button" accessibilityLabel={`${post.title}, ${post.placeName}, ${post.dateKey}`} onPress={() => router.push(`/posts/${post.id}`)}>
        {(post.photoThumbnailUrls?.[0] || post.photoUrls?.[0]) ? <Image source={{ uri: post.photoThumbnailUrls?.[0] || post.photoUrls[0] }} style={v.tileImage} /> : <View style={[v.tileImage, v.textTile, { backgroundColor: `${post.pinColor || p.primary}22` }]}><MapPin color={post.pinColor || p.primary} size={24} /><Text style={v.tileText} numberOfLines={3}>{post.title}</Text></View>}
        <View style={v.tileCaption}><Text style={v.tileTitle} numberOfLines={1}>{post.placeName || post.title}</Text><Text style={v.tileDate}>{post.dateKey}</Text></View>
        {own && post.visibility === 'private' && <View style={v.visibility}><Lock size={12} color="white" /></View>}
      </Pressable>)}</View> : posts.map(post => <PostCard key={post.id} post={post} />)}
    </>}
  </View>
}

function FollowList({ user, kind, manage = false, onClose, onChanged }: {
  user: DaymarkUser; kind: FollowListKind; manage?: boolean; onClose: () => void; onChanged?: () => void
}) {
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
      .catch(err => { if (active) setError(authErrorMessage(err)) })
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
    } catch (err) { setError(authErrorMessage(err)) }
    finally { lock.current = false; setBusy('') }
  }
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <Screen title={`${user.nickname} · ${title}`} right={<Pressable style={v.iconButton} accessibilityRole="button" accessibilityLabel="목록 닫기" onPress={onClose}><X color={p.ink} size={23} /></Pressable>}>
      {loading && <ActivityIndicator color={p.primary} />}
      {!!error && <><Notice error>{error}</Notice><Button title="다시 시도" variant="secondary" onPress={() => setRevision(value => value + 1)} /></>}
      {!loading && !people.length && <Empty title={`아직 ${title}가 없습니다`} />}
      {people.map(person => <View key={person.uid} style={v.personRow}>
        <Pressable style={v.personLink} accessibilityRole="button" accessibilityLabel={`${person.nickname} 프로필`} onPress={() => { onClose(); router.push(`/people/${person.uid}`) }}>
          <Avatar uri={person.photoURL} name={person.nickname} /><View style={{ flex: 1 }}><Txt>{person.nickname}</Txt><Text style={s.muted}>{kind === 'followers' ? '팔로워' : '팔로잉'}</Text></View>
        </Pressable>
        {manage && <Button title={kind === 'followers' ? '제거' : '취소'} variant="secondary" disabled={!!busy} loading={busy === person.uid} onPress={() => remove(person)} />}
      </View>)}
    </Screen>
  </Modal>
}

export function ProfileSettingsScreen() {
  const { currentUser, profile, refreshProfile } = useAuth()
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
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
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
    catch (err) { if (revision === requestRevision.current) setRequestsError(authErrorMessage(err)) }
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
    } catch (err) { setError(authErrorMessage(err, '프로필을 저장하지 못했습니다.')) }
    finally { actionLock.current = false; setBusy('') }
  }

  async function choosePhoto() {
    try { const result = await pickProfilePhoto(); if (result) { setEditingPhoto(result); setMessage('') } }
    catch (err) { setError(authErrorMessage(err)) }
  }

  async function respond(request: FollowRequest, accept: boolean) {
    if (!profile || !uid || requestLock.current) return
    requestLock.current = true; setRequestAction(request.uid); setRequestsError('')
    try {
      if (accept) await acceptFollowRequest(profile, request)
      else await declineFollowRequest(uid, request.uid)
      await Promise.all([loadRequests(), refreshProfile()])
    } catch (err) { setRequestsError(authErrorMessage(err)) }
    finally { requestLock.current = false; setRequestAction('') }
  }

  async function signOut() {
    if (actionLock.current) return
    actionLock.current = true; setBusy('logout'); setError('')
    try { await logout(); router.replace('/') }
    catch (err) { setError(authErrorMessage(err)) }
    finally { actionLock.current = false; setBusy('') }
  }

  async function removeAccount() {
    if (!currentUser || actionLock.current) return
    actionLock.current = true; setBusy('delete'); setDeleteError('')
    try {
      await reauthenticateAccount(currentUser, deletePassword)
      await deleteAccount(currentUser)
      setDeletePassword(''); setDeleteOpen(false); router.replace('/')
    } catch (err) { setDeleteError(authErrorMessage(err, '계정 탈퇴에 실패했습니다.')) }
    finally { actionLock.current = false; setBusy('') }
  }

  if (!currentUser || !profile) return <Screen title="프로필 설정" back><Empty title="프로필을 불러오는 중입니다" /><Button title="다시 불러오기" onPress={() => { void refreshProfile().catch(err => setError(authErrorMessage(err))) }} />{!!error && <Notice error>{error}</Notice>}</Screen>

  return <Screen title="프로필 설정" back>
    <View style={v.settingsPhoto}><Pressable accessibilityRole="button" accessibilityLabel="프로필 사진 변경 및 자르기" onPress={choosePhoto} disabled={!!busy}>
      <Avatar uri={removePhoto ? undefined : photo?.uri || profile.photoURL} name={nickname} size={100} /><View style={v.camera}><Camera size={18} color="white" /></View>
    </Pressable><View style={{ flex: 1, gap: 6 }}><H>{profile.nickname}</H><Text style={s.muted}>{currentUser.email}</Text><Pressable accessibilityRole="button" onPress={choosePhoto} disabled={!!busy}><Text style={v.link}>프로필 사진 변경 · 자르기</Text></Pressable></View></View>
    {(photo || (!removePhoto && profile.photoURL)) && <Button title="프로필 사진 제거" variant="secondary" onPress={() => { setPhoto(null); setRemovePhoto(true) }} disabled={!!busy} />}
    {(photo || (!removePhoto && profile.photoURL)) && <Button title="사진 편집" variant="secondary" onPress={() => setEditingPhoto(photo || { uri: profile.photoURL })} disabled={!!busy} />}
    <View style={s.card}>
      <Field label="사용자 이름" value={username} onChangeText={value => setUsername(value.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={USERNAME_MAX_LENGTH} editable={!busy} />
      <Text style={s.muted}>영어, 숫자, 밑줄(_), 점(.) · 다른 사용자와 중복될 수 없어요.</Text>
      <Field label="닉네임" value={nickname} onChangeText={setNickname} maxLength={NICKNAME_MAX_LENGTH} editable={!busy} />
      <Field label="소개글" value={bio} onChangeText={setBio} multiline maxLength={BIO_MAX_LENGTH} placeholder="나를 소개하는 한마디" editable={!busy} />
      <Text style={s.muted}>{bio.length} / {BIO_MAX_LENGTH}</Text>
      <Row title="비공개 계정" subtitle="새 팔로우를 승인제로 받기" right={<Switch value={isPrivate} onValueChange={setPrivate} disabled={!!busy} accessibilityLabel="비공개 계정" trackColor={{ false: p.line, true: p.primary }} />} />
      {!!error && <Notice error>{error}</Notice>}{!!message && <Notice>{message}</Notice>}
      <Button title="변경사항 저장" onPress={save} loading={busy === 'save'} disabled={!!busy} />
    </View>
    <View style={s.card}><PinThemeEditor /></View>
    <View style={s.card}><H>팔로우 관리</H>
      <Row title="팔로워" subtitle={`${profile.followerCount || 0}명`} onPress={() => setList('followers')} />
      <Row title="팔로잉" subtitle={`${profile.followingCount || 0}명`} onPress={() => setList('following')} />
      <Text style={v.sectionLabel}>팔로우 요청 {requests.length ? `· ${requests.length}` : ''}</Text>
      {requestsLoading && <ActivityIndicator color={p.primary} />}
      {!!requestsError && <><Notice error>{requestsError}</Notice><Button title="다시 시도" variant="secondary" onPress={loadRequests} /></>}
      {!requestsLoading && !requests.length && <Text style={s.muted}>대기 중인 팔로우 요청이 없습니다.</Text>}
      {requests.map(request => <View key={request.uid} style={v.requestCard}>
        <Pressable style={v.personLink} accessibilityRole="button" onPress={() => router.push(`/people/${request.uid}`)}><Avatar uri={request.photoURL} name={request.nickname} /><View><Txt>{request.nickname}</Txt><Text style={s.muted}>승인 대기 중</Text></View></Pressable>
        <View style={v.actions}><Button title="승인" onPress={() => respond(request, true)} disabled={!!requestAction} loading={requestAction === request.uid} /><Button title="거절" variant="secondary" onPress={() => respond(request, false)} disabled={!!requestAction} /></View>
      </View>)}
    </View>
    <View style={s.card}><H>약관 및 정책</H>{policyNavigation.map(item => <Row key={item.id} title={item.title} onPress={() => router.push(`/policies/${item.id}`)} />)}<Row title="오픈소스 라이선스" onPress={() => router.push('/licenses')} /></View>
    <View style={s.card}><H>계정 관리</H><Button title="로그아웃" variant="secondary" loading={busy === 'logout'} disabled={!!busy} onPress={() => Alert.alert('로그아웃', '스팟잇에서 로그아웃할까요?', [{ text: '취소', style: 'cancel' }, { text: '로그아웃', onPress: () => { void signOut() } }])} />
      <Pressable accessibilityRole="button" style={v.deleteLink} disabled={!!busy} onPress={() => { setDeleteError(''); setDeletePassword(''); setDeleteOpen(true) }}><Text style={{ color: p.coral, fontSize: 13 }}>계정 탈퇴</Text></Pressable></View>
    {list && <FollowList user={profile} kind={list} manage onClose={() => setList(null)} onChanged={() => { void refreshProfile().catch(err => setError(authErrorMessage(err))) }} />}
    <PhotoEditor photo={editingPhoto} square onClose={() => setEditingPhoto(null)} onSave={value => { setPhoto(value); setRemovePhoto(false); setEditingPhoto(null) }} />
    <Modal visible={deleteOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) setDeleteOpen(false) }}>
      <Screen title="계정 탈퇴" right={<Pressable style={v.iconButton} disabled={!!busy} accessibilityRole="button" accessibilityLabel="탈퇴 취소" onPress={() => setDeleteOpen(false)}><X color={p.ink} size={23} /></Pressable>}>
        <H>계정을 탈퇴할까요?</H><Txt>탈퇴하면 프로필, 팔로우 관계, 내가 작성한 기록, 댓글, 좋아요가 삭제됩니다.</Txt>
        <Txt>채팅방에 남아 있던 내 메시지는 탈퇴한 사용자 메시지로 익명 처리됩니다.</Txt>
        <Notice>삭제된 기록은 복구할 수 없습니다. 계정 보호를 위해 본인 인증을 한 번 더 진행합니다.</Notice>
        {currentUser.providerData.some(provider => provider.providerId === 'password') && <Field label="현재 비밀번호" value={deletePassword} onChangeText={setDeletePassword} secureTextEntry autoComplete="current-password" editable={!busy} />}
        {!!deleteError && <Notice error>{deleteError}</Notice>}
        <Button title="본인 인증 후 탈퇴하기" variant="danger" loading={busy === 'delete'} disabled={!!busy} onPress={removeAccount} />
        <Button title="취소" variant="secondary" disabled={!!busy} onPress={() => setDeleteOpen(false)} />
      </Screen>
    </Modal>
  </Screen>
}

const v = StyleSheet.create({
  iconButton: { padding: 9 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 18 }, identityText: { flex: 1, gap: 4 }, nickname: { color: p.ink, fontSize: 24, fontWeight: '700' }, handle: { color: p.primary, fontSize: 14 },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 9, gap: 17 }, stat: { alignItems: 'center', gap: 1, minWidth: 40 }, statNumber: { color: p.ink, fontSize: 20, fontWeight: '700' }, statDivider: { width: 1, height: 26, backgroundColor: p.line },
  about: { gap: 8, paddingTop: 10, marginTop: 5, borderTopWidth: 1, borderTopColor: p.line }, sectionLabel: { color: p.ink, fontSize: 14, fontWeight: '700' }, privacyNote: { flexDirection: 'row', gap: 7, alignItems: 'center', paddingTop: 4 }, actions: { flexDirection: 'row', gap: 9, alignItems: 'center' }, reportRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  count: { fontSize: 15, color: p.primary, fontWeight: '700', backgroundColor: p.primarySoft, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 }, locked: { paddingVertical: 26, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tile: { width: '31.7%', borderRadius: 11, overflow: 'hidden', backgroundColor: p.paper, borderWidth: 1, borderColor: p.line }, tileImage: { width: '100%', aspectRatio: 1 }, textTile: { alignItems: 'center', justifyContent: 'center', padding: 8, gap: 6 }, tileText: { color: p.ink, fontSize: 11, lineHeight: 16, textAlign: 'center' }, tileCaption: { padding: 7, gap: 4 }, tileTitle: { fontSize: 10, fontWeight: '600', color: p.ink }, tileDate: { fontSize: 9, color: p.muted }, visibility: { position: 'absolute', right: 5, top: 5, padding: 5, borderRadius: 10, backgroundColor: '#25282488' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: p.line }, personLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsPhoto: { flexDirection: 'row', alignItems: 'center', gap: 20, marginVertical: 12 }, camera: { position: 'absolute', right: -3, bottom: 1, borderRadius: 18, padding: 8, borderWidth: 3, borderColor: p.bg, backgroundColor: p.primary }, link: { color: p.primary, fontSize: 12, fontWeight: '600' },
  requestCard: { gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: p.line }, deleteLink: { alignItems: 'center', paddingVertical: 12 },
})
