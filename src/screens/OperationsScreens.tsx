import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, AppState, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { randomUUID } from 'expo-crypto'
import { AtSign, Bell, ChevronDown, ChevronRight, Heart, MessageCircle, ShieldCheck, UserPlus, X } from 'lucide-react-native'
import { Avatar, Button, Chip, Empty, Field, Notice, Row, Screen, p } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { formatTimestamp } from '../lib/date'
import { policyNavigation, type PolicyId } from '../lib/policyNavigation'
import { policies, policyOperator, policyPublication, type PolicyDocument, type PolicySection } from '../data/policies'
import licenses from '../data/openSourceLicenses.json'
import { markAllNotificationsAsRead, markNotificationAsRead, subscribeToNotifications } from '../services/notificationService'
import { disablePushNotifications, enablePushNotifications, getPushPermissionStatus, type PushPermissionStatus } from '../services/pushNotificationService'
import { getAdminStats, listAdminCases, listMyCases, loginAdmin, logoutAdmin, manageAdminUser, reviewCase, searchAdminUsers, submitInquiry, type AdminStats } from '../services/moderationService'
import { CASE_LABELS, REPORT_REASONS, STATUS_LABELS, type AdminUser, type CaseStatus, type ModerationCase } from '../types/moderation'
import type { DaymarkNotification } from '../types/notification'

const errorText = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.'
const date = (value: number) => value ? new Date(value).toLocaleString('ko-KR') : '기록 없음'
const reasonLabel = (value: string) => REPORT_REASONS.find(reason => reason.id === value)?.label || (value === 'auto' ? '자동 필터 감지' : '문의')
function Heading({ children, description }: { children: ReactNode; description?: string }) {
  return <View style={st.heading}><Text style={st.title}>{children}</Text>{description ? <Text style={st.description}>{description}</Text> : null}</View>
}
function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return <View style={st.loading} accessibilityRole="progressbar"><ActivityIndicator color={p.primary} /><Text style={st.muted}>{label}</Text></View>
}
function StatusBadge({ status }: { status: CaseStatus }) {
  return <View style={[st.badge, status === 'dismissed' && st.badgeMuted]}><Text style={[st.badgeText, status === 'dismissed' && { color: p.muted }]}>{STATUS_LABELS[status]}</Text></View>
}
function SignedOut({ title }: { title: string }) {
  return <Screen title={title} back><Empty title="로그인이 필요해요" description="로그인하고 내 소식과 접수 내역을 확인해 주세요." /><Button title="로그인" onPress={() => router.push('/login')} /></Screen>
}
function openLink(href: string) {
  if (href.startsWith('/') && !href.startsWith('//')) router.push(href as Href)
  else if (/^(https?:|tel:)/i.test(href)) void Linking.openURL(href).catch(() => {})
}

export function NotificationsScreen() {
  const { currentUser, firebaseReady } = useAuth()
  const [notifications, setNotifications] = useState<DaymarkNotification[]>([])
  const [pushStatus, setPushStatus] = useState<PushPermissionStatus>('prompt')
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [pushError, setPushError] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [readBusy, setReadBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!currentUser || !firebaseReady) { setNotifications([]); setLoading(false); return }
    setLoading(true); setError('')
    try {
      return subscribeToNotifications(currentUser.uid, items => { setNotifications(items); setLoading(false) }, e => { setError(errorText(e)); setLoading(false) })
    } catch (e) { setError(errorText(e)); setLoading(false) }
  }, [currentUser, firebaseReady, version])
  useEffect(() => {
    let active = true
    const refresh = () => { void getPushPermissionStatus().then(status => { if (active) { setPushStatus(status); setPushEnabled(status === 'granted') } }).catch(() => {}) }
    refresh()
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh() })
    return () => { active = false; listener.remove() }
  }, [])
  async function openNotification(item: DaymarkNotification) {
    if (!currentUser) return
    if (!item.readAt) {
      try { await markNotificationAsRead(currentUser.uid, item.id) }
      catch (e) { setError(errorText(e)) }
    }
    if (item.type === 'follow_request') router.push('/profile/settings')
    else if (item.postId) router.push({ pathname: '/posts/[postId]', params: { postId: item.postId, ...(item.commentId ? { commentId: item.commentId } : {}), ...(item.replyId ? { replyId: item.replyId } : {}) } } as Href)
    else if (item.chatId) router.push(`/chats/${item.chatId}` as Href)
    else openLink(item.href)
  }
  async function markAll() {
    if (!currentUser || readBusy) return
    setReadBusy(true); setError('')
    try { await markAllNotificationsAsRead(currentUser.uid) } catch (e) { setError(errorText(e)) } finally { setReadBusy(false) }
  }
  async function togglePush() {
    if (!currentUser || pushBusy) return
    setPushBusy(true); setPushMessage(''); setPushError(false)
    try {
      if (pushEnabled) { await disablePushNotifications(currentUser.uid); setPushEnabled(false); setPushMessage('이 기기의 푸시 알림을 껐습니다.') }
      else { await enablePushNotifications(currentUser.uid); setPushEnabled(true); setPushMessage('이 기기의 푸시 알림이 켜졌습니다.') }
      setPushStatus(await getPushPermissionStatus())
    } catch (e) { setPushError(true); setPushMessage(errorText(e)) } finally { setPushBusy(false) }
  }
  if (!currentUser) return <SignedOut title="알림" />
  const unread = notifications.filter(item => !item.readAt).length
  return <Screen title="알림" back scroll={false}>
    <FlatList data={notifications} keyExtractor={item => item.id} contentContainerStyle={st.listContent} refreshing={loading} onRefresh={() => setVersion(v => v + 1)}
      ListHeaderComponent={<View style={st.stack}>
        <Heading description="채팅, 팔로우, 좋아요, 댓글과 멘션 소식을 모아봅니다.">내게 온 소식 {unread ? `· ${unread}` : ''}</Heading>
        <Button title="모두 읽음" variant="secondary" onPress={() => void markAll()} disabled={!unread} loading={readBusy} />
        {error ? <Notice error>{error}</Notice> : null}
        <View style={st.card}><View style={st.row}><Bell size={21} color={p.primary} /><Text style={st.subtitle}>휴대폰 푸시 알림</Text></View>
          <Text style={st.description}>{pushEnabled ? '이 기기에서 새로운 소식을 받아보세요.' : pushStatus === 'denied' ? '기기 설정에서 알림 권한을 허용해 주세요.' : pushStatus === 'unsupported' ? '실제 휴대폰에서 푸시 알림을 설정할 수 있어요.' : pushStatus === 'not-configured' ? '푸시 설정이 완료된 앱에서 알림을 켤 수 있어요.' : '새로운 소식을 휴대폰 알림으로 받아보세요.'}</Text>
          {pushStatus === 'denied' ? <Button title="기기 설정 열기" onPress={() => void Linking.openSettings().catch(e => setError(errorText(e)))} variant="secondary" /> : <Button title={pushEnabled ? '이 기기 끄기' : '푸시 켜기'} onPress={() => void togglePush()} loading={pushBusy} variant={pushEnabled ? 'secondary' : 'primary'} disabled={pushStatus === 'unsupported' || pushStatus === 'not-configured'} />}
        </View>
        {pushMessage ? <Notice error={pushError}>{pushMessage}</Notice> : null}
      </View>}
      ListEmptyComponent={loading ? <Loading /> : <Empty title="아직 알림이 없어요" description="새로운 소식이 도착하면 여기에 모아드릴게요." />}
      renderItem={({ item }) => {
        const Icon = item.type === 'like' ? Heart : item.type === 'mention' ? AtSign : item.type === 'follow' || item.type === 'follow_request' ? UserPlus : MessageCircle
        return <Pressable accessibilityRole="button" accessibilityLabel={`${item.readAt ? '' : '읽지 않음. '}${item.title}. ${item.message}`} style={[st.notification, !item.readAt && st.unread]} onPress={() => void openNotification(item)}>
          {item.actorPhotoURL ? <Avatar uri={item.actorPhotoURL} name={item.actorNickname} size={44} /> : <View style={st.notificationIcon}><Icon size={20} color={p.primary} /></View>}
          <View style={st.flex}><Text style={st.label}>{item.title}</Text><Text style={st.description}>{item.message}</Text><Text style={st.small}>{formatTimestamp(item.createdAt)}</Text></View>
          {!item.readAt && <View style={st.dot} />}
        </Pressable>
      }} />
  </Screen>
}

export function SupportScreen() {
  const { currentUser, firebaseReady } = useAuth()
  const [cases, setCases] = useState<ModerationCase[]>([])
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const requestId = useRef<string | null>(null)
  const refresh = useCallback(async () => {
    if (!currentUser || !firebaseReady) return
    setLoading(true); setError('')
    try { setCases((await listMyCases()).cases) } catch (e) { setError(errorText(e)) } finally { setLoading(false) }
  }, [currentUser, firebaseReady])
  useEffect(() => { void refresh() }, [refresh])
  async function submit() {
    if (busy || !title.trim() || !details.trim()) return
    setBusy(true); setError(''); setSuccess('')
    try {
      requestId.current ||= randomUUID()
      await submitInquiry(title.trim(), details.trim(), requestId.current)
      requestId.current = null
      setTitle(''); setDetails(''); setSuccess('문의가 접수되었습니다. 아래 내역에서 답변을 확인해 주세요.')
      await refresh()
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  if (!currentUser) return <SignedOut title="문의·신고 내역" />
  return <Screen title="문의·신고 내역" back refreshing={loading} onRefresh={() => void refresh()}>
    <Heading description="궁금한 점이나 불편했던 경험을 알려 주세요.">무엇을 도와드릴까요?</Heading>
    {error ? <Notice error>{error}</Notice> : null}{success ? <Notice>{success}</Notice> : null}
    <View style={st.card}><View style={st.row}><MessageCircle size={22} color={p.primary} /><Text style={st.subtitle}>문의하기</Text></View>
      <Field label="제목" value={title} onChangeText={setTitle} editable={!busy} maxLength={100} placeholder="어떤 도움이 필요하세요?" />
      <Field label="문의 내용" value={details} onChangeText={setDetails} editable={!busy} maxLength={2000} multiline textAlignVertical="top" style={st.textarea} placeholder="상황을 자세히 적어 주시면 확인에 도움이 됩니다." />
      <Text style={st.counter}>{details.length.toLocaleString()} / 2,000자</Text>
      <Button title="문의 보내기" onPress={() => void submit()} loading={busy} disabled={!title.trim() || !details.trim()} />
    </View>
    <View style={st.spaceRow}><Text style={st.subtitle}>내 접수 내역</Text><Pressable accessibilityRole="button" disabled={loading} onPress={() => void refresh()} style={st.textButton}><Text style={st.link}>새로고침</Text></Pressable></View>
    {loading ? <Loading /> : !cases.length ? <Empty title="아직 접수한 내역이 없어요" description="문의나 신고를 보내면 처리 상태와 답변을 여기서 확인할 수 있어요." /> : cases.map(item => <View key={item.id} style={st.card}>
      <View style={st.spaceRow}><Text style={st.small}>{CASE_LABELS[item.kind]} · {new Date(item.createdAt).toLocaleDateString('ko-KR')}</Text><StatusBadge status={item.status} /></View>
      <Text style={st.label}>{item.title}</Text>{item.details ? <Text style={st.body}>{item.details}</Text> : null}
      {item.reply ? <View style={st.reply}><Text style={st.label}>스팟잇 답변</Text><Text style={st.body}>{item.reply}</Text></View> : null}
    </View>)}
  </Screen>
}

const adminStorageKey = 'spotit.admin.session.v1'
type AdminSession = { token: string; expiresAt: number }
async function clearAdminStorage() { if (await SecureStore.isAvailableAsync()) await SecureStore.deleteItemAsync(adminStorageKey) }

export function AdminScreen() {
  const [session, setSession] = useState<AdminSession | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [verified, setVerified] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (!(await SecureStore.isAvailableAsync())) return
        const value = await SecureStore.getItemAsync(adminStorageKey)
        const stored: unknown = value ? JSON.parse(value) : null
        if (stored && typeof stored === 'object' && 'token' in stored && typeof stored.token === 'string' && 'expiresAt' in stored && typeof stored.expiresAt === 'number' && stored.expiresAt > Date.now()) {
          if (active) setSession(stored as AdminSession)
        } else await clearAdminStorage()
      } catch { await clearAdminStorage().catch(() => {}) } finally { if (active) setRestoring(false) }
    })()
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!session) return
    let active = true
    function expire(message: string) {
      if (!active) return
      setVerified(false); setSession(null); setError(message)
      void clearAdminStorage().catch(() => {})
    }
    async function verify() {
      if (!session) return
      if (session.expiresAt <= Date.now()) { expire('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.'); return }
      try { await getAdminStats(session.token); if (active) setVerified(true) } catch (e) { expire(errorText(e)) }
    }
    void verify()
    const timer = setTimeout(() => expire('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.'), Math.max(0, Math.min(2_147_483_647, session.expiresAt - Date.now())))
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void verify() })
    return () => { active = false; clearTimeout(timer); subscription.remove() }
  }, [session])
  async function login() {
    if (!password.trim() || busy) return
    setBusy(true); setError('')
    try {
      const next = await loginAdmin(password)
      if (await SecureStore.isAvailableAsync()) await SecureStore.setItemAsync(adminStorageKey, JSON.stringify(next), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })
      setPassword(''); setSession(next); setVerified(false)
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  async function logout() {
    if (!session) return
    try { await logoutAdmin(session.token) }
    finally { setVerified(false); setSession(null); await clearAdminStorage() }
  }
  if (session && verified) return <AdminDashboard token={session.token} onLogout={logout} />
  return <Screen title="관리실" back><View style={st.adminHero}><ShieldCheck size={50} color={p.primary} /><Text style={st.eyebrow}>SPOTIT ADMIN</Text><Heading description="더 안전하고 즐거운 장소 기록을 위해.">스팟잇 관리실</Heading></View>
    {restoring || session ? <Loading label="관리자 권한을 확인하는 중…" /> : <View style={st.card}>
      <Field label="관리자 비밀번호" value={password} onChangeText={setPassword} editable={!busy} maxLength={200} secureTextEntry autoCapitalize="none" autoComplete="current-password" placeholder="비밀번호를 입력하세요" onSubmitEditing={() => void login()} />
      {error ? <Notice error>{error}</Notice> : null}<Button title="관리자 접속" loading={busy} disabled={!password.trim()} onPress={() => void login()} />
    </View>}
  </Screen>
}

function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => Promise<void> }) {
  const [tab, setTab] = useState<'overview' | 'cases' | 'users'>('overview')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => {
    setBusy(true); setError('')
    try { setStats(await getAdminStats(token)) } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }, [token])
  useEffect(() => { void refresh() }, [refresh])
  const metrics = stats ? [
    { label: '총 사용자', value: stats.users, detail: `최근 7일 가입 ${stats.newUsers}명` },
    { label: '게시 중인 핀', value: stats.posts, detail: `최근 7일 등록 ${stats.newPosts}개` },
    { label: '전체 채팅방', value: stats.chats, detail: '1:1 · 단체 채팅방' },
    { label: '미처리 접수', value: stats.openCases, detail: '신고 · 문의 · 자동 검토' },
  ] : []
  return <Screen title="스팟잇 관리실" back refreshing={busy} onRefresh={() => void refresh()}>
    <View style={st.chips}>{(['overview', 'cases', 'users'] as const).map(value => <Chip key={value} label={value === 'overview' ? '통계' : value === 'cases' ? '신고·문의' : '유저 관리'} selected={tab === value} onPress={() => setTab(value)} />)}</View>
    <Heading description={tab === 'overview' ? '서비스 현황과 지금 확인할 일을 살펴보세요.' : tab === 'cases' ? '접수된 내용을 확인하고 처리 결과를 남겨 주세요.' : '유저를 검색하고 계정 이용 상태를 관리하세요.'}>{tab === 'overview' ? '한눈에 보는 스팟잇' : tab === 'cases' ? '신고·문의 관리' : '유저 관리'}</Heading>
    {error ? <Notice error>{error}</Notice> : null}
    {tab === 'overview' && <>
      {!stats ? <Loading label="통계를 불러오는 중…" /> : <View style={st.metrics}>{metrics.map(metric => <View style={st.metric} key={metric.label}><Text style={st.muted}>{metric.label}</Text><Text style={st.metricValue}>{metric.value.toLocaleString('ko-KR')}</Text><Text style={st.small}>{metric.detail}</Text></View>)}</View>}
      <View style={st.card}><Text style={st.subtitle}>확인이 필요한 항목</Text><Row title="신고·문의 검토" subtitle="접수 및 검토 중인 항목" onPress={() => setTab('cases')} right={<Text style={st.link}>{stats?.openCases ?? '—'}건</Text>} /><Row title="유저 이용 상태" subtitle="현재 이용 정지된 계정" onPress={() => setTab('users')} right={<Text style={st.link}>{stats?.suspendedUsers ?? '—'}명</Text>} /></View>
      <View style={st.card}><Text style={st.subtitle}>핀 검토 기준</Text>{['불법 거래·촬영물 의심 문구와 링크 도배는 자동 검토 목록으로 들어옵니다.', '신고 증거를 확인한 뒤 핀을 숨기거나 다시 복구할 수 있습니다.', '신고 횟수만으로 핀을 삭제하지 않습니다.', '첨부 사진을 직접 확인하고 처리해 주세요.'].map(item => <Text key={item} style={st.body}>• {item}</Text>)}</View>
      <Text style={st.small}>최근 7일은 현재 시각 기준입니다. 핀 통계는 현재 게시된 핀만 집계하며, 숨겨진 핀은 제외됩니다.</Text>
      <Button title="통계 새로고침" variant="secondary" loading={busy} onPress={() => void refresh()} />
    </>}
    {tab === 'cases' && <CasesPanel token={token} onChanged={refresh} />}
    {tab === 'users' && <UsersPanel token={token} onChanged={refresh} />}
    <Button title="관리자 로그아웃" variant="secondary" disabled={busy} onPress={() => { setBusy(true); void onLogout().catch(e => { setError(errorText(e)); setBusy(false) }) }} />
  </Screen>
}

function CasesPanel({ token, onChanged }: { token: string; onChanged: () => Promise<void> }) {
  const [kind, setKind] = useState('all')
  const [status, setStatus] = useState('all')
  const [cases, setCases] = useState<ModerationCase[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<ModerationCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setCases([]); setCursor(null)
    void listAdminCases(token, kind, status).then(result => { if (active) { setCases(result.cases); setCursor(result.nextCursor) } }).catch(e => { if (active) setError(errorText(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, kind, status, version])
  async function more() {
    if (!cursor || loading) return
    setLoading(true); setError('')
    try { const result = await listAdminCases(token, kind, status, cursor); setCases(previous => [...previous, ...result.cases]); setCursor(result.nextCursor) } catch (e) { setError(errorText(e)) } finally { setLoading(false) }
  }
  return <View style={st.stack}>
    <Text style={st.label}>접수 유형</Text><View style={st.chips}>{[['all', '전체 유형'], ...Object.entries(CASE_LABELS)].map(([id, label]) => <Chip key={id} label={label} selected={kind === id} onPress={() => { if (!loading) setKind(id) }} />)}</View>
    <Text style={st.label}>처리 상태</Text><View style={st.chips}>{[['all', '전체 상태'], ...Object.entries(STATUS_LABELS)].map(([id, label]) => <Chip key={id} label={label} selected={status === id} onPress={() => { if (!loading) setStatus(id) }} />)}</View>
    <Button title="내역 새로고침" variant="secondary" disabled={loading} onPress={() => setVersion(v => v + 1)} />
    {error ? <Notice error>{error}</Notice> : null}
    {cases.map(item => <Pressable accessibilityRole="button" key={item.id} style={st.card} onPress={() => setSelected(item)}><View style={st.spaceRow}><Text style={st.small}>{CASE_LABELS[item.kind]} · {reasonLabel(item.reason)}</Text><StatusBadge status={item.status} /></View><Text style={st.label}>{item.title}</Text><Text style={st.description} numberOfLines={3}>{item.details || '상세 내용 없음'}</Text><Text style={st.small}>{item.reporterName || '사용자'} · {date(item.createdAt)}</Text></Pressable>)}
    {loading ? <Loading label="접수 내역을 불러오는 중…" /> : !cases.length && !error ? <Empty title="접수 내역이 없습니다" description="선택한 조건에 해당하는 신고나 문의가 없어요." /> : null}
    {cursor ? <Button title="더 보기" variant="secondary" disabled={loading} onPress={() => void more()} /> : null}
    {selected && <CaseDetail key={selected.id} item={selected} token={token} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); setVersion(v => v + 1); void onChanged() }} />}
  </View>
}

function CaseDetail({ item, token, onClose, onSaved }: { item: ModerationCase; token: string; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(item.status)
  const [note, setNote] = useState(item.note || '')
  const [reply, setReply] = useState(item.reply || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const evidence = item.kind !== 'inquiry' ? item.evidence : undefined
  const canHidePin = ['pin', 'auto'].includes(item.kind) || (item.kind === 'photo' && item.sourceKind === 'pin')
  async function save(action: 'save' | 'hide' | 'restore') {
    if (busy) return
    setBusy(true); setError('')
    try { await reviewCase(token, item.id, action === 'hide' ? 'resolved' : status, note, reply, action); onSaved() } catch (e) { setError(errorText(e)); setBusy(false) }
  }
  return <DetailModal title="접수 상세" busy={busy} onClose={onClose}>
    <View style={st.spaceRow}><Text style={st.eyebrow}>{CASE_LABELS[item.kind]}</Text><StatusBadge status={item.status} /></View><Text style={st.subtitle}>{item.title}</Text><Text style={st.small}>{reasonLabel(item.reason)} · {date(item.createdAt)}</Text><Text style={st.body}>{item.details || '추가 설명 없음'}</Text><Text selectable style={st.small}>신고자: {item.reporterName} · {item.reporterUid}</Text>
    {evidence && <View style={st.card}><Text style={st.subtitle}>접수 당시 콘텐츠</Text>{evidence.title ? <Text style={st.label}>{evidence.title}</Text> : null}{evidence.authorNickname ? <Text style={st.body}>작성자: {evidence.authorNickname}</Text> : null}{evidence.nickname ? <Text style={st.body}>{evidence.nickname} @{evidence.username}</Text> : null}{evidence.placeName ? <Text style={st.body}>{evidence.placeName} · {evidence.address}</Text> : null}{evidence.content || evidence.bio ? <Text selectable style={st.body}>{evidence.content || evidence.bio}</Text> : null}
      {evidence.photoUrls?.map((url, index) => <EvidencePhoto key={`${url}-${index}`} url={url} />)}
      {evidence.messages?.map(message => <View key={message.id} style={st.reply}><Text style={st.label}>{message.authorNickname}</Text><Text style={st.body}>{message.content}</Text>{message.photoUrl ? <EvidencePhoto url={message.photoUrl} /> : null}</View>)}
    </View>}
    {item.targetUid ? <Text selectable style={st.small}>대상 UID: {item.targetUid}</Text> : null}
    {item.kind === 'photo' ? <Notice>{item.sourceKind === 'pin' ? '선택한 사진이 포함된 핀 전체를 숨기거나 복구할 수 있습니다.' : '사진을 검토하고 답변을 남길 수 있습니다. 계정 조치가 필요하면 유저 관리에서 대상 UID를 확인해 주세요.'}</Notice> : null}
    <Text style={st.label}>처리 상태</Text><View style={st.chips}>{Object.entries(STATUS_LABELS).map(([id, label]) => <Chip key={id} label={label} selected={status === id} onPress={() => { if (!busy) setStatus(id as CaseStatus) }} />)}</View>
    <Field label="관리자 메모 (내부용)" value={note} onChangeText={setNote} multiline maxLength={2000} editable={!busy} textAlignVertical="top" style={st.textarea} />
    {item.kind !== 'auto' ? <Field label="사용자에게 보낼 답변" value={reply} onChangeText={setReply} multiline maxLength={2000} editable={!busy} textAlignVertical="top" style={st.textarea} placeholder="사용자의 문의·신고 내역에 표시됩니다." /> : null}
    {error ? <Notice error>{error}</Notice> : null}<Button title="처리 결과 저장" loading={busy} onPress={() => void save('save')} />
    {canHidePin && <><Button title={item.kind === 'photo' ? '연결된 핀 숨김·처리 완료' : '핀 숨김·처리 완료'} variant="danger" disabled={busy} onPress={() => void save('hide')} /><Button title="숨긴 핀 복구" variant="secondary" disabled={busy} onPress={() => void save('restore')} /></>}
  </DetailModal>
}

function EvidencePhoto({ url }: { url: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!/^https?:\/\//i.test(url)) return null
  return <><Pressable accessibilityRole="button" accessibilityLabel="신고 사진 확대" onPress={() => setExpanded(true)}><Image source={{ uri: url }} style={st.evidencePhoto} resizeMode="contain" /></Pressable>{expanded && <Modal animationType="fade" visible onRequestClose={() => setExpanded(false)}><SafeAreaView style={st.fullPhoto}><Pressable accessibilityRole="button" accessibilityLabel="사진 닫기" style={st.photoClose} onPress={() => setExpanded(false)}><X size={26} color="white" /></Pressable><Image source={{ uri: url }} style={st.flex} resizeMode="contain" /></SafeAreaView></Modal>}</>
}

function UsersPanel({ token, onChanged }: { token: string; onChanged: () => Promise<void> }) {
  const [field, setField] = useState('nickname')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ field: 'nickname', search: '', version: 0 })
  const [users, setUsers] = useState<AdminUser[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AdminUser | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setUsers([]); setCursor(null)
    void searchAdminUsers(token, query.field, query.search).then(result => { if (active) { setUsers(result.users); setCursor(result.nextCursor) } }).catch(e => { if (active) setError(errorText(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, query])
  async function more() {
    if (!cursor || loading) return
    setLoading(true); setError('')
    try { const result = await searchAdminUsers(token, query.field, query.search, cursor); setUsers(previous => [...previous, ...result.users]); setCursor(result.nextCursor) } catch (e) { setError(errorText(e)) } finally { setLoading(false) }
  }
  const submitSearch = () => setQuery(previous => ({ field, search: search.trim(), version: previous.version + 1 }))
  return <View style={st.stack}>
    <View style={st.chips}>{[['nickname', '닉네임'], ['username', '사용자 이름'], ['uid', 'UID']].map(([id, label]) => <Chip key={id} label={label} selected={field === id} onPress={() => { if (!loading) setField(id) }} />)}</View>
    <Field label={field === 'uid' ? '정확한 값 입력' : '시작하는 글자로 검색'} value={search} onChangeText={setSearch} maxLength={200} editable={!loading} autoCapitalize="none" placeholder="비워 두면 전체 유저를 보여 드려요" onSubmitEditing={submitSearch} />
    <Button title="검색" disabled={loading} onPress={submitSearch} />{error ? <Notice error>{error}</Notice> : null}
    {users.map(user => <Pressable accessibilityRole="button" accessibilityLabel={`${user.nickname} 관리`} key={user.uid} style={st.card} onPress={() => setSelected(user)}><View style={st.row}><Avatar uri={user.photoURL} name={user.nickname} /><View style={st.flex}><Text style={st.label}>{user.nickname || '이름 없음'}</Text><Text style={st.small}>@{user.username || '미설정'}</Text></View><View style={[st.badge, user.suspended && st.badgeMuted]}><Text style={[st.badgeText, user.suspended && { color: p.coral }]}>{user.suspended ? '이용 정지' : '정상'}</Text></View><ChevronRight size={18} color={p.muted} /></View><Text style={st.small}>가입일: {date(user.createdAt)}</Text></Pressable>)}
    {loading ? <Loading label="유저를 불러오는 중…" /> : !users.length && !error ? <Empty title="검색된 유저가 없습니다" description="검색어를 바꾸거나 전체 목록을 확인해 주세요." /> : null}
    {cursor ? <Button title="더 보기" variant="secondary" disabled={loading} onPress={() => void more()} /> : null}
    {selected && <UserDetail key={selected.uid} user={selected} token={token} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); setQuery(previous => ({ ...previous, version: previous.version + 1 })); void onChanged() }} />}
  </View>
}

function UserDetail({ user, token, onClose, onSaved }: { user: AdminUser; token: string; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    if (busy || !reason.trim()) return
    setBusy(true); setError('')
    try { await manageAdminUser(token, user.uid, !user.suspended, reason.trim()); onSaved() } catch (e) { setError(errorText(e)); setBusy(false) }
  }
  return <DetailModal title="유저 상세·관리" busy={busy} onClose={onClose}>
    <View style={st.row}><Avatar uri={user.photoURL} name={user.nickname} size={60} /><View><Text style={st.subtitle}>{user.nickname}</Text><Text style={st.muted}>@{user.username}</Text></View></View>
    <View style={st.card}>{[['UID', user.uid], ['가입일', date(user.createdAt)], ['상태', user.suspended ? '이용 정지' : '정상'], ['소개', user.bio || '없음'], ...(user.suspensionReason ? [['최근 처리 사유', user.suspensionReason]] : [])].map(([label, value]) => <View key={label} style={st.stackSmall}><Text style={st.small}>{label}</Text><Text style={st.body} selectable>{value}</Text></View>)}</View>
    <Field label={`${user.suspended ? '정지 해제' : '이용 정지'} 사유`} value={reason} onChangeText={setReason} multiline maxLength={500} editable={!busy} textAlignVertical="top" style={st.textarea} placeholder="처리 근거를 남겨 주세요." />
    <Notice>{user.suspended ? '해제하면 다시 로그인해 서비스를 이용할 수 있습니다.' : '정지하면 로그인이 차단되고 기존 로그인 세션에서도 핀·채팅을 이용할 수 없습니다.'}</Notice>
    {error ? <Notice error>{error}</Notice> : null}<Button title={user.suspended ? '이용 정지 해제' : '이용 정지 적용'} variant={user.suspended ? 'primary' : 'danger'} loading={busy} disabled={!reason.trim()} onPress={() => void submit()} />
  </DetailModal>
}

function DetailModal({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose() }}><SafeAreaView style={st.modal}><KeyboardAvoidingView style={st.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={st.modalHeader}><Text style={st.subtitle}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="상세 창 닫기" disabled={busy} style={st.textButton} onPress={onClose}><X color={p.ink} size={24} /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={st.modalContent}>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
}

export function PoliciesScreen() {
  const { policyId: rawPolicyId, section: rawSection, '#': rawHash } = useLocalSearchParams<{ policyId?: string | string[]; section?: string; '#': string }>()
  const policyId = Array.isArray(rawPolicyId) ? rawPolicyId[0] : rawPolicyId
  const targetSection = rawSection || rawHash || ''
  const navigation = policyNavigation.find(item => item.id === policyId)
  const document = navigation ? policies[navigation.id as PolicyId] : undefined
  const scroll = useRef<ScrollView>(null)
  const positions = useRef<Record<string, number>>({})
  const jumped = useRef('')
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState('')
  useEffect(() => {
    jumped.current = ''
    if (!targetSection) scroll.current?.scrollTo({ y: 0, animated: false })
    else if (positions.current[`${policyId}-${targetSection}`] !== undefined) {
      scroll.current?.scrollTo({ y: positions.current[`${policyId}-${targetSection}`] + 20, animated: false })
      jumped.current = `${policyId}-${targetSection}`
    }
  }, [policyId, targetSection])
  async function printDocument() {
    if (!document || !navigation || printing) return
    setPrinting(true); setPrintError('')
    try {
      const Print = await import('expo-print')
      await Print.printAsync({ html: printablePolicy(navigation.title, document) })
    } catch (e) {
      if (!/cancel|closed|printing did not complete/i.test(errorText(e))) setPrintError(errorText(e))
    } finally { setPrinting(false) }
  }
  if (policyId && !document) return <Screen title="약관 및 정책" back><Empty title="문서를 찾을 수 없습니다" /><Button title="약관 및 정책 목록" onPress={() => router.replace('/policies')} /></Screen>
  return <Screen title={navigation?.title || '약관 및 정책'} back scroll={false}><ScrollView ref={scroll} contentContainerStyle={st.listContent}>
    <View style={st.stack}><Heading description={`시행일 ${policyPublication.effectiveDate} · 버전 ${policyPublication.version}`}>{navigation?.title || '약관 및 정책'}</Heading>
      <Notice>약관 및 개인정보처리방침 개정 안내{ '\n' }만 14세 미만 가입 제한, 가입 시 필수·선택 동의, 개인정보 보관·파기와 Firebase 미국 서버로의 국외이전 기준을 안내합니다.</Notice>
      {document ? <>
        <Button title="인쇄" variant="secondary" loading={printing} onPress={() => void printDocument()} />
        {printError ? <Notice error>{printError}</Notice> : null}
        <Text style={st.body}>{document.introduction}</Text>
        <View style={st.card}><Text style={st.subtitle}>목차</Text>{document.sections.map((section, index) => <Pressable key={section.id} accessibilityRole="button" style={st.tocRow} onPress={() => scroll.current?.scrollTo({ y: (positions.current[`${policyId}-${section.id}`] || 0) + 20, animated: true })}><Text style={st.link}>{index + 1}. {section.title}</Text></Pressable>)}</View>
        {document.sections.map(section => <View key={`${policyId}-${section.id}`} onLayout={event => {
          positions.current[`${policyId}-${section.id}`] = event.nativeEvent.layout.y
          if (targetSection === section.id && jumped.current !== `${policyId}-${targetSection}`) {
            jumped.current = `${policyId}-${targetSection}`
            scroll.current?.scrollTo({ y: event.nativeEvent.layout.y + 20, animated: false })
          }
        }}><PolicySectionView section={section} /></View>)}
        <View style={st.card}><Text style={st.subtitle}>다른 약관 및 정책</Text>{policyNavigation.filter(item => item.id !== policyId).map(item => <Row key={item.id} title={item.title} onPress={() => router.push(`/policies/${item.id}` as Href)} />)}<Row title="오픈소스 라이선스" onPress={() => router.push('/licenses')} /></View>
      </> : <>
        <Text style={st.body}>서비스 이용 기준과 개인정보·위치정보 보호에 관한 문서를 한곳에서 확인하세요.</Text>
        <View style={st.card}>{policyNavigation.map(item => <Row key={item.id} title={item.title} subtitle={item.description} onPress={() => router.push(`/policies/${item.id}` as Href)} />)}<Row title="오픈소스 라이선스" subtitle="함께 사용한 오픈소스와 라이선스 고지" onPress={() => router.push('/licenses')} /></View>
        <View style={st.card}><Text style={st.subtitle}>운영자 연락처</Text><Text style={st.body}>{policyOperator.name} · {policyOperator.address}</Text><Button title={policyOperator.phone} variant="secondary" onPress={() => openLink(policyOperator.phoneHref)} /></View>
      </>}
    </View>
  </ScrollView></Screen>
}

function printablePolicy(title: string, document: PolicyDocument): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
  const paragraph = (value: string) => `<p>${escape(value)}</p>`
  const sections = document.sections.map(section => `<section><h2>${escape(section.title)}</h2>${(section.paragraphs || []).map(paragraph).join('')}${section.bullets ? `<ul>${section.bullets.map(value => `<li>${escape(value)}</li>`).join('')}</ul>` : ''}${section.table ? `<table><caption>${escape(section.table.caption)}</caption><thead><tr>${section.table.headers.map(value => `<th>${escape(value)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map(row => `<tr>${row.map(value => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}${section.note ? `<aside>${escape(section.note)}</aside>` : ''}${section.links ? section.links.map(link => `<p>${escape(link.label)}: ${escape(link.href.startsWith('/') ? `${process.env.EXPO_PUBLIC_WEB_URL || 'https://spotitmap.kr'}${link.href}` : link.href)}</p>`).join('') : ''}</section>`).join('')
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} | 스팟잇</title><style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.7;color:#252824}h1{font-size:23pt}h2{font-size:15pt;break-after:avoid}p,li{white-space:pre-wrap}table{width:100%;border-collapse:collapse;font-size:9pt;margin:14px 0}th,td{border:1px solid #aaa;padding:8px;text-align:left;vertical-align:top}thead{display:table-header-group}tr{break-inside:avoid}aside{padding:10px;background:#f3f3ee}caption{text-align:left;font-weight:bold}</style></head><body><h1>${escape(title)}</h1><p>스팟잇 · 시행일 ${escape(policyPublication.effectiveDate)} · ${escape(policyPublication.version)}</p>${paragraph(document.introduction)}${sections}</body></html>`
}

function PolicySectionView({ section }: { section: PolicySection }) {
  return <View style={st.policySection}><Text style={st.subtitle}>{section.title}</Text>
    {section.paragraphs?.map((paragraph, index) => <Text selectable style={st.policyBody} key={index}>{paragraph}</Text>)}
    {section.bullets?.map((paragraph, index) => <View style={st.bulletRow} key={index}><Text style={st.body}>•</Text><Text selectable style={[st.policyBody, st.flex]}>{paragraph}</Text></View>)}
    {section.table ? <View style={st.stackSmall}><Text style={st.label}>{section.table.caption}</Text><ScrollView horizontal showsHorizontalScrollIndicator><View style={st.table}><View style={st.tableRow}>{section.table.headers.map((header, index) => <Text key={index} style={[st.tableCell, st.tableHeader]}>{header}</Text>)}</View>{section.table.rows.map((cells, rowIndex) => <View key={rowIndex} style={st.tableRow}>{cells.map((cell, columnIndex) => <Text key={columnIndex} selectable style={st.tableCell}>{cell}</Text>)}</View>)}</View></ScrollView><Text style={st.small}>표를 좌우로 밀어 전체 내용을 확인하세요.</Text></View> : null}
    {section.note ? <Notice>시행 전 확인{ '\n' }{section.note}</Notice> : null}
    {section.links?.map(link => <Pressable accessibilityRole="link" key={link.href} style={st.tocRow} onPress={() => openLink(link.href)}><Text style={st.link}>{link.label} ↗</Text></Pressable>)}
  </View>
}

const scopeLabels: Record<string, string> = { app: '앱', server: '서버', development: '개발 도구' }
const licenseTexts: Record<string, string> = licenses.texts
type LicensePackage = typeof licenses.packages[number]
function LicenseItem({ entry }: { entry: LicensePackage }) {
  const [expanded, setExpanded] = useState(false)
  return <View style={st.licenseItem}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={st.licenseHeader} onPress={() => setExpanded(!expanded)}><View style={st.flex}><Text style={st.label}>{entry.name}</Text><Text style={st.small}>v{entry.version} · {entry.scopes.map(scope => scopeLabels[scope] || scope).join(' · ')}</Text><Text style={st.licenseBadge}>{entry.license}</Text></View><ChevronDown color={p.muted} size={20} style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined} /></Pressable>
    {expanded ? <View style={st.licenseContent}>{entry.repository.startsWith('https://') ? <Pressable accessibilityRole="link" onPress={() => openLink(entry.repository)}><Text style={st.link}>프로젝트 저장소 ↗</Text></Pressable> : null}{entry.documents.map((document, index) => <View key={`${document.textId}-${index}`} style={st.stack}><Text style={st.subtitle}>{document.title}</Text>{document.source.startsWith('https://') ? <Pressable accessibilityRole="link" onPress={() => openLink(document.source)}><Text style={st.link}>원문 출처 ↗</Text></Pressable> : null}<Text selectable style={st.licenseText}>{licenseTexts[document.textId]}</Text></View>)}</View> : null}
  </View>
}

export function LicensesScreen() {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  const filtered = useMemo(() => licenses.packages.filter(entry => (scope === 'all' || entry.scopes.includes(scope)) && `${entry.name} ${entry.version} ${entry.license}`.toLowerCase().includes(query.trim().toLowerCase())), [query, scope])
  return <Screen title="오픈소스 라이선스" back scroll={false}><FlatList data={filtered} keyExtractor={item => `${item.name}@${item.version}`} contentContainerStyle={st.listContent} initialNumToRender={12} maxToRenderPerBatch={12} keyboardShouldPersistTaps="handled" ListHeaderComponent={<View style={st.stack}><Heading description="스팟잇을 만드는 데 함께한 오픈소스 프로젝트입니다.">오픈소스 라이선스</Heading><Text style={st.body}>항목을 누르면 저작권 고지와 라이선스 원문을 확인할 수 있습니다.</Text><Field label="라이브러리 검색" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="이름 또는 라이선스로 검색" /><View style={st.chips}>{[['all', '전체'], ...Object.entries(scopeLabels)].map(([value, label]) => <Chip key={value} label={label} selected={scope === value} onPress={() => setScope(value)} />)}</View><Text style={st.small}>전체 {licenses.packages.length}개 중 {filtered.length}개</Text></View>} ListEmptyComponent={<View style={st.stack}><Empty title="검색 결과가 없습니다" description="검색어나 사용 범위를 바꿔 보세요." /><Button title="전체 목록 보기" variant="secondary" onPress={() => { setQuery(''); setScope('all') }} /></View>} renderItem={({ item }) => <LicenseItem entry={item} />} /></Screen>
}

const st = StyleSheet.create({
  flex: { flex: 1 }, heading: { gap: 7, paddingVertical: 7 }, title: { color: p.ink, fontSize: 27, fontWeight: '800', letterSpacing: -0.8 }, subtitle: { color: p.ink, fontSize: 18, fontWeight: '700' }, label: { color: p.ink, fontSize: 15, fontWeight: '700', lineHeight: 23 }, body: { color: p.ink, fontSize: 14, lineHeight: 23 }, muted: { color: p.muted, fontSize: 14 }, description: { color: p.muted, fontSize: 14, lineHeight: 22 }, small: { color: p.muted, fontSize: 12, lineHeight: 19 }, link: { color: p.primary, fontSize: 14, lineHeight: 23, fontWeight: '600' }, eyebrow: { fontSize: 12, color: p.primary, letterSpacing: 1.4, fontWeight: '700' },
  stack: { gap: 16 }, stackSmall: { gap: 5 }, listContent: { padding: 20, paddingBottom: 45, gap: 12, flexGrow: 1 }, card: { backgroundColor: p.paper, borderColor: p.line, borderWidth: 1, padding: 18, borderRadius: 21, gap: 13 }, row: { flexDirection: 'row', alignItems: 'center', gap: 11 }, spaceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, textButton: { padding: 8 }, loading: { paddingVertical: 28, alignItems: 'center', gap: 12 },
  notification: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: p.paper, borderRadius: 19, borderWidth: 1, borderColor: p.line }, unread: { backgroundColor: p.primarySoft }, notificationIcon: { backgroundColor: p.paper, borderRadius: 22, height: 44, width: 44, alignItems: 'center', justifyContent: 'center' }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: p.primary },
  textarea: { minHeight: 125 }, counter: { fontSize: 12, color: p.muted, textAlign: 'right', marginTop: -7 }, reply: { backgroundColor: p.primarySoft, borderRadius: 14, padding: 14, gap: 7 }, badge: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 10, backgroundColor: p.primarySoft }, badgeText: { color: p.primary, fontWeight: '700', fontSize: 11 }, badgeMuted: { backgroundColor: p.surface },
  adminHero: { paddingVertical: 35, alignItems: 'center', gap: 14 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, metric: { width: '47%', flexGrow: 1, borderWidth: 1, borderColor: p.line, borderRadius: 20, backgroundColor: p.paper, padding: 18, gap: 9 }, metricValue: { color: p.ink, fontSize: 32, fontWeight: '800' },
  modal: { flex: 1, backgroundColor: p.bg }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: p.line, paddingHorizontal: 20, paddingVertical: 13 }, modalContent: { padding: 20, paddingBottom: 45, gap: 16 }, evidencePhoto: { width: '100%', height: 230, borderRadius: 15, backgroundColor: p.surface }, fullPhoto: { flex: 1, backgroundColor: '#111111' }, photoClose: { padding: 20, alignSelf: 'flex-end' },
  policySection: { gap: 15, paddingVertical: 18, borderBottomWidth: 1, borderColor: p.line }, policyBody: { color: p.ink, fontSize: 15, lineHeight: 26 }, bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, tocRow: { paddingVertical: 6 }, table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: p.line, backgroundColor: p.paper }, tableRow: { flexDirection: 'row' }, tableCell: { width: 220, padding: 12, fontSize: 13, lineHeight: 21, color: p.ink, borderRightWidth: 1, borderBottomWidth: 1, borderColor: p.line }, tableHeader: { fontWeight: '700', backgroundColor: p.surface },
  licenseItem: { backgroundColor: p.paper, borderRadius: 17, borderWidth: 1, borderColor: p.line, overflow: 'hidden' }, licenseHeader: { padding: 17, flexDirection: 'row', alignItems: 'center', gap: 12 }, licenseBadge: { color: p.primary, fontSize: 12, fontWeight: '700', marginTop: 5 }, licenseContent: { padding: 17, gap: 21, borderTopWidth: 1, borderColor: p.line }, licenseText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: p.ink, fontSize: 11, lineHeight: 18 },
})
