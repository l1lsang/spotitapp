import * as Clipboard from 'expo-clipboard';
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowUpRight, Ban, Check, ChevronLeft, ChevronRight, Copy, Flag, ImagePlus, Images, MapPin, MessageCircle, MoreHorizontal, Pin, PinOff, RefreshCw, SendHorizontal, ShieldAlert, UserPlus, UsersRound, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Image, Keyboard, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { blockNotice } from '../components/BlockUserDialog';
import { DirectChatDialog } from '../components/chat/DirectChatDialog';
import { NewChatFab } from '../components/chat/NewChatFab';
import { Dialog } from '../components/Dialog';
import { KeyboardPane, useKeyboardVisible } from '../components/keyboard';
import { PhotoEditor } from '../components/PhotoEditor';
import { RemoteImage } from '../components/RemoteImage';
import { Text, TextInput } from '../components/Typography';
import { Avatar, Button, Chip, Empty, Field, IconButton, Notice, Screen, SearchBox, p } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useBlockedUsers, withoutBlocked } from '../hooks/useBlockedUsers';
import { usePeopleSearch } from '../hooks/usePeopleSearch';
import { getDirectChatPartnerIds } from '../lib/chatCandidates';
import { getChatMedia, getPinnedChatMessages } from '../lib/chatCollections';
import { getSharedPinFromMessage } from '../lib/chatPinShare';
import { CHAT_REACTION_OPTIONS, getChatReactionSummaries } from '../lib/chatReactions';
import { getMessageReaders } from '../lib/chatReadReceipts';
import { formatChatDateSeparator, formatChatTime, formatTimestamp, getTimestampDateKey } from '../lib/date';
import { blockUser, type BlockTarget } from '../services/blockService';
import { addParticipantsToChat, createGroupChat, getOrCreateDirectChat, getOtherParticipant, markChatAsRead, refreshChatParticipant, sendChatMessage, setChatMessagePinned, subscribeToChat, subscribeToChatMessages, subscribeToMyChats, toggleChatMessageReaction } from '../services/chatService';
import { submitReport } from '../services/moderationService';
import { uploadChatPhoto, type UploadPhoto } from '../services/storageService';
import type { ChatMessage, ChatParticipant, ChatReactionEmoji, DaymarkChat } from '../types/chat';
import { REPORT_REASONS, type ReportTarget } from '../types/moderation';
import type { DaymarkUser } from '../types/user';

function roomName(chat: DaymarkChat, uid: string) {
  return chat.kind === 'group' ? chat.name || '단체방' : getOtherParticipant(chat, uid)?.nickname || '알 수 없는 사용자'
}

export function ChatListScreen() {
  const router = useRouter()
  const { currentUser, profile, firebaseReady } = useAuth()
  const [allChats, setChats] = useState<DaymarkChat[]>([])
  const { ids: blockedChatIds } = useBlockedUsers()
  // 1:1 rooms with a blocked member leave the list; group rooms stay and hide that member's messages.
  const chats = useMemo(() => !blockedChatIds.size || !currentUser ? allChats : allChats.filter(chat => chat.kind === 'group' || !blockedChatIds.has(getOtherParticipant(chat, currentUser.uid)?.uid || '')), [allChats, blockedChatIds, currentUser])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [open, setOpen] = useState(false)
  const [directOpen, setDirectOpen] = useState(false)
  const [name, setName] = useState('')
  const [peopleSearch, setPeopleSearch] = useState('')
  const [selectedPeople, setSelectedPeople] = useState<DaymarkUser[]>([])
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const uid = currentUser?.uid
  const groupSearch = usePeopleSearch(peopleSearch, open)
  // 1:1 chats start only with people I follow.
  const following = usePeopleSearch('', directOpen)

  useFocusEffect(useCallback(() => {
    setChats([]); setError('')
    if (!uid || !firebaseReady) { setLoading(false); return }
    setLoading(true)
    return subscribeToMyChats(uid, next => { setChats(next); setLoading(false) }, e => { setError(e.message); setLoading(false) })
  }, [uid, firebaseReady, revision]))

  function openGroup() {
    if (!uid) { router.push('/login'); return }
    setDirectOpen(false)
    setOpen(true); setDialogError(''); setPeopleSearch('')
  }
  function openDirect() {
    if (!uid) { router.push('/login'); return }
    setDirectOpen(true)
  }
  async function startDirect(user: DaymarkUser) {
    if (!profile) throw new Error('프로필을 확인한 뒤 다시 시도해 주세요.')
    const chatId = await getOrCreateDirectChat(profile, user)
    setDirectOpen(false)
    router.push({ pathname: '/chats/[chatId]', params: { chatId } })
  }
  function toggle(user: DaymarkUser) {
    setSelectedPeople(list => list.some(item => item.uid === user.uid) ? list.filter(item => item.uid !== user.uid) : [...list, user])
  }
  async function create() {
    if (!profile || busy || !selectedPeople.length) return
    setBusy(true); setDialogError('')
    try {
      const id = await createGroupChat(profile, selectedPeople, name.trim())
      setOpen(false); setName(''); setSelectedPeople([])
      router.push({ pathname: '/chats/[chatId]', params: { chatId: id } })
    } catch (e) { setDialogError(errorText(e)) }
    finally { setBusy(false) }
  }
  // The room list starts right under the header; the floating button starts new chats.
  return <View style={{ flex: 1 }}>
    <Screen contentStyle={styles.listPage} refreshing={loading} onRefresh={() => setRevision(value => value + 1)}>
      {!!error && <View style={styles.errorBlock}><Notice error>{error}</Notice><Button title="다시 시도" variant="secondary" icon={<RefreshCw size={17} color={p.ink} />} style={{ alignSelf: 'flex-start' }} onPress={() => setRevision(value => value + 1)} /></View>}
      {loading && <ActivityIndicator color={p.primary} style={{ marginTop: 24 }} />}
      {!loading && !chats.length && <View style={{ alignItems: 'center', paddingVertical: 38, gap: 16 }}><MessageCircle size={34} color={p.muted} strokeWidth={1.3} /><Empty title="아직 채팅이 없습니다." description="사람 찾기에서 대화를 시작해 보세요." /><Button title="사람 찾기" icon={<UsersRound size={17} color={p.paper} />} onPress={() => router.push('/people')} /></View>}
      {chats.length > 0 && <View accessibilityLabel="채팅 목록" style={styles.chatList}>{chats.map((chat, index) => {
        const other = getOtherParticipant(chat, uid || '')
        const unread = Boolean(chat.lastMessageUid !== uid && chat.lastMessageAt && (!chat.readAtBy?.[uid || ''] || chat.lastMessageAt.toMillis() > chat.readAtBy[uid || ''].toMillis()))
        const lastMessage = chat.lastMessage ? (chat.lastMessageUid === uid ? '나: ' : '') + chat.lastMessage : '새 대화를 시작해 보세요.'
        return <Pressable key={chat.id} style={({ pressed }) => [styles.chatRow, index > 0 && styles.chatRowSeparator, pressed && styles.chatRowPressed]} accessibilityRole="button" accessibilityLabel={`${roomName(chat, uid || '')}${unread ? ', 읽지 않은 메시지' : ''}`} onPress={() => router.push({ pathname: '/chats/[chatId]', params: { chatId: chat.id } })}>
          {chat.kind === 'group' ? <GroupAvatar size={48} /> : <Avatar uri={other?.photoURL} name={other?.nickname} size={48} />}
          <View style={styles.chatRowContent}>
            <Text style={[styles.chatTitle, unread && { color: p.primaryHover }]} numberOfLines={1}>{roomName(chat, uid || '')}</Text>
            <Text numberOfLines={1} style={styles.muted}>{chat.kind === 'group' ? chat.participantIds.length + '명 · ' : ''}{lastMessage}</Text>
          </View>
          {unread ? <View style={styles.unread} /> : null}
        </Pressable>
      })}</View>}
    </Screen>
    {!!currentUser && firebaseReady && !!profile && <NewChatFab onGroup={openGroup} onDirect={openDirect} />}
    {!!uid && <DirectChatDialog visible={directOpen} users={following.people} loading={following.loading} error={following.error}
      chattingUids={getDirectChatPartnerIds(chats, uid)} onRetry={following.retry}
      onStart={startDirect} onClose={() => setDirectOpen(false)} onCreateGroup={openGroup} />}
    <ChatSheet visible={open} title="단체방 만들기" busy={busy} onClose={() => setOpen(false)}>
      <Field label="방 이름" value={name} onChangeText={setName} editable={!busy} maxLength={32} placeholder="예: 주말 맛집 핀 모임" />
      <View style={{ gap: 10 }}>
        <Text style={styles.legend}>초대할 사람</Text>
        <SearchBox accessibilityLabel="친구 검색" value={peopleSearch} onChangeText={setPeopleSearch} editable={!busy} autoCapitalize="none" autoCorrect={false} placeholder="닉네임 또는 @사용자 이름으로 친구 검색" />
        <Text style={styles.muted}>선택한 친구 {selectedPeople.length}명</Text>
        {selectedPeople.length ? <SelectedPeople people={selectedPeople} disabled={busy} onRemove={toggle} /> : null}
        {groupSearch.error ? <View style={styles.errorBlock}><Notice error>{groupSearch.error}</Notice><Button title="다시 불러오기" variant="secondary" onPress={groupSearch.retry} /></View> : null}
        {groupSearch.loading ? <Text style={styles.emptyText}>{groupSearch.searching ? '사람을 찾는 중입니다.' : '친구 목록을 불러오는 중입니다.'}</Text> : null}
        {!groupSearch.loading && !groupSearch.error && !groupSearch.people.length ? <Text style={styles.emptyText}>{groupSearch.searching ? '검색 결과가 없습니다. 다른 닉네임이나 사용자 이름을 입력해 보세요.' : '팔로우하는 사람이 없습니다. 닉네임이나 @사용자 이름으로 찾아보세요.'}</Text> : null}
        {!groupSearch.loading && !groupSearch.error ? <View accessibilityLabel="초대할 친구">{groupSearch.people.map(user => <PersonChoice key={user.uid} user={user} selected={selectedPeople.some(item => item.uid === user.uid)} disabled={busy} onPress={() => toggle(user)} />)}</View> : null}
      </View>
      {dialogError ? <Notice error>{dialogError}</Notice> : null}
      <View style={styles.dialogActions}>
        <Button title="취소" variant="secondary" disabled={busy} style={{ flex: 1 }} onPress={() => setOpen(false)} />
        <Button title={busy ? '만드는 중' : '만들기'} icon={<UsersRound size={17} color={p.paper} />} loading={busy} disabled={!selectedPeople.length} style={{ flex: 1 }} onPress={() => void create()} />
      </View>
    </ChatSheet>
  </View>
}

type RoomSheet = 'menu' | 'invite' | 'pins' | 'media' | 'actions' | 'readers' | 'report' | 'block' | 'photo' | null

export function ChatRoomScreen() {
  const params = useLocalSearchParams<{ chatId: string }>()
  const chatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const keyboardVisible = useKeyboardVisible()
  const { currentUser, profile, firebaseReady } = useAuth()
  const uid = currentUser?.uid
  const [chat, setChat] = useState<DaymarkChat | null>(null)
  const [allMessages, setMessages] = useState<ChatMessage[]>([])
  const { ids: blockedIds } = useBlockedUsers()
  // Messages from blocked members vanish from the room as soon as the block is saved.
  const messages = useMemo(() => withoutBlocked(allMessages, blockedIds), [allMessages, blockedIds])
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null)
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [error, setError] = useState('')
  const [messageError, setMessageError] = useState('')
  const [content, setContent] = useState('')
  const [photo, setPhoto] = useState<UploadPhoto | null>(null)
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [sheet, setSheet] = useState<RoomSheet>(null)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<ChatMessage | null>(null)
  const [highlightedId, setHighlightedId] = useState('')
  const [focused, setFocused] = useState(false)
  const [composerFocused, setComposerFocused] = useState(false)
  const [active, setActive] = useState(AppState.currentState === 'active')
  const [revision, setRevision] = useState(0)
  const [candidateQuery, setCandidateQuery] = useState('')
  const [invitees, setInvitees] = useState<DaymarkUser[]>([])
  const [busy, setBusy] = useState(false)
  const [sheetError, setSheetError] = useState('')
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].id)
  const [details, setDetails] = useState('')
  const list = useRef<FlatList<ChatMessage>>(null)
  const atBottom = useRef(true)
  const sendLock = useRef(false)
  const reactionLock = useRef(false)
  const pendingRead = useRef(false)
  const retryJump = useRef<ReturnType<typeof setTimeout> | null>(null)
  const title = chat && uid ? roomName(chat, uid) : '채팅'
  const other = chat && uid ? getOtherParticipant(chat, uid) : null
  const reversed = useMemo(() => [...messages].reverse(), [messages])
  const pinned = useMemo(() => getPinnedChatMessages(messages, chat?.pinnedMessageIds), [messages, chat?.pinnedMessageIds])
  const media = useMemo(() => getChatMedia(messages), [messages])
  const inviteSearch = usePeopleSearch(candidateQuery, sheet === 'invite')
  const candidates = inviteSearch.people.filter(user => !chat?.participantIds.includes(user.uid))
  const latest = messages[messages.length - 1]
  const selectedMessage = messages.find(message => message.id === selectedMessageId) || null
  // Phones: the 100px header of the mobile design includes the status bar area.
  const narrow = width <= 480
  const headerMinHeight = width <= 640 ? Math.max(0, 100 - insets.top) : undefined
  const rowMaxWidth = width <= 620 ? '88%' : Math.min(width * 0.78, 560)

  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false) }, []))
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'))
    return () => listener.remove()
  }, [])
  useEffect(() => () => { if (retryJump.current) clearTimeout(retryJump.current) }, [])
  useEffect(() => {
    setChat(null); setMessages([]); setError(''); setContent(''); setPhoto(null); setSheet(null); setSelectedMessageId(null)
    if (!uid || !firebaseReady || !chatId) { setLoading(false); return }
    setLoading(true)
    return subscribeToChat(chatId, uid, next => { setChat(next); setLoading(false); if (!next) setError('참여 중인 채팅방을 찾을 수 없습니다.') }, e => { setError(e.message); setLoading(false) })
  }, [chatId, uid, firebaseReady, revision])
  const activeChatId = chat?.id
  useEffect(() => {
    setMessages([]); setMessageError('')
    if (!activeChatId) { setMessagesLoading(false); return }
    setMessagesLoading(true)
    return subscribeToChatMessages(activeChatId, next => { setMessages(next); setMessagesLoading(false) }, e => { setMessages([]); setMessageError(e.message); setMessagesLoading(false) })
  }, [activeChatId, revision])
  useEffect(() => {
    if (chat && uid && focused && active && chat.lastMessageAt && !pendingRead.current && (!chat.readAtBy?.[uid] || chat.readAtBy[uid].toMillis() < chat.lastMessageAt.toMillis())) {
      pendingRead.current = true
      void markChatAsRead(chat.id, uid).catch(e => setError(errorText(e))).finally(() => { pendingRead.current = false })
    }
  }, [chat, uid, focused, active])
  useEffect(() => {
    if (!activeChatId || !profile) return
    void refreshChatParticipant(activeChatId, profile).catch(e => setError(errorText(e)))
  }, [activeChatId, profile?.uid, profile?.nickname, profile?.photoURL])
  useEffect(() => {
    if (atBottom.current || latest?.uid === uid) requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: false }))
  }, [latest?.id, uid])
  useEffect(() => {
    if (!highlightedId) return
    const timer = setTimeout(() => setHighlightedId(''), 3000)
    return () => clearTimeout(timer)
  }, [highlightedId])

  function show(next: RoomSheet) { setSheetError(''); setSheet(next); Keyboard.dismiss() }
  async function pickPhoto(camera = false) {
    if (sending || editing) return
    setError('')
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync()
        if (!permission.granted) { setError('사진을 촬영하려면 카메라 접근을 허용해 주세요.'); return }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 0.9 }
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        setPhoto({ uri: asset.uri, name: asset.fileName || 'chat-photo.jpg', mimeType: asset.mimeType || 'image/jpeg', width: asset.width, height: asset.height })
      }
    } catch (e) { setError(errorText(e)) }
  }
  async function editPhoto(action: 'rotate' | 'flip') {
    if (!photo || editing || sending) return
    setEditing(true)
    try {
      const context = ImageManipulator.manipulate(photo.uri)
      if (action === 'rotate') context.rotate(90)
      else context.flip(FlipType.Horizontal)
      const rendered = await context.renderAsync()
      const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 })
      setPhoto({ ...photo, uri: result.uri, width: result.width, height: result.height, mimeType: 'image/jpeg', name: 'chat-photo.jpg' })
    } catch (e) { setError(errorText(e)) }
    finally { setEditing(false) }
  }
  async function send() {
    if (!chat || !profile || (!content.trim() && !photo) || sendLock.current || editing) return
    sendLock.current = true; setSending(true); setError('')
    try {
      const photoUrl = photo ? await uploadChatPhoto(profile.uid, chat.id, photo) : ''
      await sendChatMessage(chat.id, profile, content, photo ? { photoUrl, photoName: photo.name || '사진' } : undefined)
      setContent(''); setPhoto(null); atBottom.current = true
      list.current?.scrollToOffset({ offset: 0, animated: true })
    } catch (e) { setError(errorText(e)) }
    finally { sendLock.current = false; setSending(false) }
  }
  function openInvite() {
    if (!chat) return
    show('invite'); setInvitees([]); setCandidateQuery('')
  }
  function toggleInvitee(user: DaymarkUser) {
    setInvitees(list => list.some(item => item.uid === user.uid) ? list.filter(item => item.uid !== user.uid) : [...list, user])
  }
  async function invite() {
    if (!chat || busy || !invitees.length) return
    setBusy(true); setSheetError('')
    try { await addParticipantsToChat(chat.id, invitees); setSheet(null) }
    catch (e) { setSheetError(errorText(e)) }
    finally { setBusy(false) }
  }
  async function togglePin() {
    if (!selectedMessage || !uid || busy) return
    setBusy(true); setSheetError('')
    try { await setChatMessagePinned(chatId, selectedMessage.id, uid, !chat?.pinnedMessageIds?.includes(selectedMessage.id)); setSheet(null) }
    catch (e) { setSheetError(errorText(e)) }
    finally { setBusy(false) }
  }
  async function reactToMessage(message: ChatMessage, emoji: ChatReactionEmoji, fromMenu = false) {
    if (!chat || !uid || message.uid === 'deleted-user' || reactionLock.current || busy) return
    reactionLock.current = true; setReactingMessageId(message.id)
    if (fromMenu) setSheetError('')
    else setError('')
    try {
      await toggleChatMessageReaction(chat.id, message.id, uid, emoji)
      if (fromMenu) setSheet(null)
    } catch {
      const message = '반응을 저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'
      if (fromMenu) setSheetError(message)
      else setError(message)
    } finally { reactionLock.current = false; setReactingMessageId(null) }
  }
  function jumpToMessage(messageId: string) {
    const index = reversed.findIndex(message => message.id === messageId)
    if (index < 0) return
    setSheet(null); setSelectedPhoto(null); setHighlightedId(messageId); atBottom.current = false
    requestAnimationFrame(() => list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 }))
  }
  function openReport(target: ReportTarget) { setReportTarget(target); setReason(REPORT_REASONS[0].id); setDetails(''); show('report') }
  async function report() {
    if (!reportTarget || busy) return
    setBusy(true); setSheetError('')
    try { const result = await submitReport(reportTarget, reason, details); setSheet(null); Alert.alert(result.duplicate ? '이미 접수된 신고예요' : '신고를 접수했어요', '검토 결과는 문의·신고 내역에서 확인할 수 있어요.') }
    catch (e) { setSheetError(errorText(e)) }
    finally { setBusy(false) }
  }
  function openBlock(target: BlockTarget) { setBlockTarget(target); show('block') }
  async function confirmBlock() {
    if (!blockTarget || !uid || busy) return
    setBusy(true); setSheetError('')
    try { await blockUser(uid, blockTarget); setSheet(null); setBlockTarget(null) }
    catch (e) { setSheetError(errorText(e)) }
    finally { setBusy(false) }
  }
  function reportPhoto(message: ChatMessage) {
    if (!message.photoUrl) return
    openReport({ kind: 'photo', sourceKind: 'chat', targetId: chatId, messageId: message.id, photoUrl: message.photoUrl, label: `${message.authorNickname}의 채팅 사진` })
  }
  const readers = selectedMessage && chat ? getMessageReaders(selectedMessage, chat) : []
  const titles: Record<Exclude<RoomSheet, null>, string> = { menu: '채팅방 메뉴', invite: '단체방 초대', pins: `고정 메시지 ${pinned.length}`, media: `미디어 모아보기 ${media.length}`, actions: '메시지 메뉴', readers: `읽은 사람 ${readers.length}`, report: '신고하기', block: `${blockTarget?.nickname || '사용자'}님을 차단할까요?`, photo: '사진 보기' }
  const selectedIndex = media.findIndex(message => message.id === selectedPhoto?.id)

  if (loading || !uid || !chat) return <Screen title="채팅" back>{loading ? <ActivityIndicator color={p.primary} style={{ margin: 40 }} /> : <><Empty title={uid ? '채팅방을 열 수 없습니다' : '로그인이 필요해요'} />{error ? <Notice error>{error}</Notice> : null}<Button title={uid ? '다시 시도' : '로그인'} onPress={() => uid ? setRevision(value => value + 1) : router.push('/login')} /><Button title="채팅 목록" variant="secondary" onPress={() => router.replace('/chats')} /></>}</Screen>

  const tool = narrow ? { width: 36 } : undefined
  return <SafeAreaView style={styles.room} edges={['top', 'left', 'right']}><KeyboardPane>
    <View style={[styles.roomHeader, { gap: narrow ? 8 : 12, minHeight: headerMinHeight }]}>
      <IconButton label="채팅 목록으로" onPress={() => router.canGoBack() ? router.back() : router.replace('/chats')}><ArrowLeft size={19} color={p.muted} /></IconButton>
      <Pressable style={[styles.roomIdentity, { gap: narrow ? 8 : 12 }]} onPress={() => other && chat.kind !== 'group' ? router.push({ pathname: '/people/[userId]', params: { userId: other.uid } }) : show('menu')} accessibilityRole="button">
        {chat.kind === 'group' ? <GroupAvatar size={narrow ? 36 : 48} /> : <Avatar uri={other?.photoURL} name={title} size={narrow ? 36 : 48} />}
        <View style={{ flex: 1, minWidth: 0 }}><Text accessibilityRole="header" numberOfLines={1} style={[styles.roomTitle, narrow && { fontSize: 16, lineHeight: 22 }]}>{title}</Text><Text style={styles.meta}>{chat.kind === 'group' ? `${chat.participantIds.length}명` : '1:1 대화'}</Text></View>
      </Pressable>
      <View style={[styles.headerActions, { gap: narrow ? 0 : 4 }]}>
        <IconButton variant="surface" size={42} style={tool} label="미디어 모아보기" onPress={() => { setSelectedPhoto(null); show('media') }}><Images size={19} color={p.muted} /></IconButton>
        {chat.kind === 'group' ? <IconButton variant="surface" size={42} style={tool} label="초대" onPress={() => void openInvite()}><UserPlus size={18} color={p.muted} /></IconButton> : null}
        <IconButton variant="surface" size={42} style={[{ borderRadius: 21 }, tool]} label="채팅방 더보기" selected={sheet === 'menu'} onPress={() => show('menu')}><MoreHorizontal size={21} color={p.muted} /></IconButton>
      </View>
    </View>
    {pinned.length ? <Pressable style={({ pressed }) => [styles.pinnedBanner, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`고정 메시지 ${pinned.length}개 보기`} onPress={() => show('pins')}>
      <Pin color={p.ink} size={17} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={styles.pinnedBannerTitle}>고정 메시지 {pinned.length}</Text><Text numberOfLines={1} style={styles.pinnedBannerText}>{pinned[0].content || pinned[0].photoName || '사진 메시지'}</Text></View><ChevronRight color={p.ink} size={18} />
    </Pressable> : null}
    {error ? <View style={styles.errorWrap}><View style={{ flex: 1 }}><Notice error>{error}</Notice></View><IconButton label="안내 닫기" onPress={() => setError('')}><X color={p.muted} size={17} /></IconButton></View> : null}
    {messageError ? <View style={styles.collectionEmpty}><Text style={styles.muted}>{messageError}</Text><Button title="다시 시도" variant="secondary" onPress={() => setRevision(value => value + 1)} /></View> : null}
    {messagesLoading ? <Text style={styles.emptyText}>메시지를 불러오는 중입니다.</Text> : null}
    <FlatList ref={list} data={reversed} inverted keyExtractor={item => item.id} style={{ flex: 1 }} contentContainerStyle={styles.messages} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" initialNumToRender={25} maxToRenderPerBatch={20}
      onLayout={() => { if (atBottom.current) list.current?.scrollToOffset({ offset: 0, animated: false }) }}
      onScroll={event => { atBottom.current = event.nativeEvent.contentOffset.y < 90 }} scrollEventThrottle={100}
      onScrollToIndexFailed={info => { list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false }); if (retryJump.current) clearTimeout(retryJump.current); retryJump.current = setTimeout(() => list.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.5 }), 300) }}
      ListEmptyComponent={!messagesLoading && !messageError ? <View style={{ transform: [{ scaleY: -1 }] }}><Text style={styles.emptyText}>아직 메시지가 없습니다.</Text></View> : null}
      renderItem={({ item, index }) => {
        const mine = item.uid === uid
        const deleted = item.uid === 'deleted-user'
        const sharedPin = getSharedPinFromMessage(item.content)
        const prev = reversed[index + 1]
        const dateKey = getTimestampDateKey(item.createdAt)
        const dayChanged = dateKey && (!prev || getTimestampDateKey(prev.createdAt) !== dateKey)
        const messageReaders = getMessageReaders(item, chat)
        const isPinned = chat.pinnedMessageIds?.includes(item.id)
        const reactions = deleted ? [] : getChatReactionSummaries(item.reactionsBy, uid)
        const openActions = () => { if (!deleted) { setSelectedMessageId(item.id); show('actions') } }
        const ink = mine ? p.paper : p.ink
        const accent = mine ? p.paper : p.primary
        return <View>
          {dayChanged ? <View style={styles.dateSeparator}><Text style={styles.dateSeparatorText}>{formatChatDateSeparator(dateKey)}</Text></View> : null}
          <View style={[styles.messageRow, { maxWidth: rowMaxWidth, alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
            {!mine ? <Pressable accessibilityLabel={`${item.authorNickname} 프로필`} onPress={() => !deleted && router.push({ pathname: '/people/[userId]', params: { userId: item.uid } })}><Avatar name={item.authorNickname} uri={chat.participants[item.uid]?.photoURL} size={32} /></Pressable> : null}
            <View style={[styles.messageStack, mine && { alignItems: 'flex-end' }]}>
              {!mine ? <Text style={styles.author}>{item.authorNickname}</Text> : null}
              <Pressable accessibilityLabel={`${item.authorNickname} 메시지. 길게 눌러 반응과 메뉴 열기`} onLongPress={openActions} delayLongPress={380} style={[styles.messageContent, mine && { alignItems: 'flex-end' }, highlightedId === item.id && styles.highlighted]}>
                {isPinned ? <View style={styles.inline}><Pin size={12} color={p.muted} /><Text style={styles.pinnedText}>고정됨</Text></View> : null}
                {item.photoUrl ? <Pressable accessibilityLabel="사진 크게 보기" onPress={() => { setSelectedPhoto(item); show('photo') }} onLongPress={openActions}><RemoteImage uri={item.photoUrl} style={[styles.messagePhoto, mine && { borderColor: p.primary }]} contentFit="cover" /></Pressable> : null}
                {sharedPin ? <Pressable accessibilityRole="link" accessibilityLabel={`${sharedPin.title} 핀 보기`} onPress={() => router.push({ pathname: '/posts/[postId]', params: { postId: sharedPin.postId } })} onLongPress={openActions} style={[styles.bubble, mine && styles.mineBubble, { gap: 8, minWidth: 170 }]}>
                  <View style={styles.inline}><MapPin size={17} color={accent} /><Text style={[styles.link, { color: accent }]}>공유한 핀</Text></View>
                  <Text style={[styles.messageText, { fontWeight: '600', color: ink }]}>{sharedPin.title}</Text><Text style={[styles.muted, mine && { color: p.paper }]}>{sharedPin.placeName}</Text>
                  <Text style={[styles.link, { color: accent }]}>핀 보기 →</Text>
                </Pressable> : item.content ? <View style={[styles.bubble, mine && styles.mineBubble]}><Text style={[styles.messageText, { color: ink }]}>{item.content}</Text></View> : null}
              </Pressable>
              {reactions.length ? <View style={[styles.reactions, mine && { justifyContent: 'flex-end' }]}>
                {reactions.map(reaction => <Pressable key={reaction.emoji} accessibilityRole="button" accessibilityLabel={`${reaction.label} ${reaction.count}명, ${reaction.selected ? '내 반응 취소' : '반응하기'}`} accessibilityState={{ selected: reaction.selected, disabled: reactingMessageId !== null || busy }} disabled={reactingMessageId !== null || busy} onPress={() => void reactToMessage(item, reaction.emoji)} style={({ pressed }) => [styles.reactionChip, reaction.selected && styles.reactionSelected, (pressed || reactingMessageId === item.id) && { opacity: 0.6 }]}>
                  <Text style={styles.reactionEmoji}>{reaction.emoji}</Text><Text style={[styles.reactionCount, reaction.selected && { color: p.primary }]}>{reaction.count}</Text>
                </Pressable>)}
              </View> : null}
              <View style={[styles.messageMeta, mine && { justifyContent: 'flex-end' }]}>
                {chat.kind === 'group'
                  ? messageReaders.length ? <Pressable accessibilityRole="button" accessibilityLabel={`읽은 사람 ${messageReaders.length}명 보기`} hitSlop={8} onPress={() => { setSelectedMessageId(item.id); show('readers') }} style={styles.receipts}>
                    <View style={styles.inline}>{messageReaders.slice(0, 3).map((reader, readerIndex) => <ReaderAvatar key={reader.uid} reader={reader} size={14} style={readerIndex ? { marginLeft: -4 } : undefined} />)}</View>
                    {messageReaders.length > 3 ? <Text style={styles.readerOverflow}>+{messageReaders.length - 3}</Text> : null}
                  </Pressable> : mine ? <Text style={styles.readStatus}>보냄</Text> : null
                  : mine ? <Text style={styles.readStatus}>{messageReaders.length ? '읽음' : '보냄'}</Text> : null}
                <Text style={styles.time}>{formatChatTime(item.createdAt)}</Text>
                {!deleted ? <Pressable accessibilityRole="button" accessibilityLabel="메시지 메뉴 열기" onPress={openActions} hitSlop={8} style={({ pressed }) => [styles.optionsButton, pressed && { backgroundColor: p.surface }]}><MoreHorizontal size={17} color={p.muted} /></Pressable> : null}
              </View>
            </View>
          </View>
        </View>
      }} />
    <View style={[styles.composer, { paddingBottom: keyboardVisible ? 10 : Math.max(insets.bottom, 12) }]}>
      {photo ? <View style={styles.photoPreview}>
        <Image source={{ uri: photo.uri }} accessibilityLabel={photo.name || '선택한 사진'} style={styles.photoPreviewImage} />
        <View style={{ gap: 8 }}><Text style={styles.tiny}>선택한 사진</Text><View style={styles.inline}><Pressable disabled={editing || sending} onPress={() => { Keyboard.dismiss(); setEditorOpen(true) }}><Text style={styles.link}>사진 편집</Text></Pressable><Pressable disabled={editing || sending} onPress={() => void editPhoto('rotate')}><Text style={styles.link}>회전</Text></Pressable><Pressable disabled={editing || sending} onPress={() => void editPhoto('flip')}><Text style={styles.link}>반전</Text></Pressable>{editing ? <ActivityIndicator size="small" color={p.primary} /> : null}</View></View>
        <IconButton label="선택한 사진 제거" disabled={sending || editing} onPress={() => setPhoto(null)}><X color={p.muted} size={17} /></IconButton>
      </View> : null}
      <View style={styles.composerRow}>
        <IconButton variant="round" style={styles.attachButton} label="사진 첨부" disabled={sending || editing} onPress={() => Alert.alert('사진 첨부', '사진을 선택하거나 새로 촬영해 보세요.', [{ text: '취소', style: 'cancel' }, { text: '앨범에서 선택', onPress: () => void pickPhoto() }, { text: '사진 촬영', onPress: () => void pickPhoto(true) }])}><ImagePlus color={p.muted} size={19} /></IconButton>
        <TextInput value={content} onChangeText={setContent} multiline maxLength={4000} editable={!sending} placeholder="메시지를 입력하세요" placeholderTextColor={p.muted} onFocus={() => setComposerFocused(true)} onBlur={() => setComposerFocused(false)} style={[styles.messageInput, composerFocused && { borderColor: p.primary }]} accessibilityLabel="메시지" />
        <IconButton variant="round" style={styles.sendButton} label="전송" disabled={sending || editing || (!content.trim() && !photo)} onPress={() => void send()}>{sending ? <ActivityIndicator color={p.paper} /> : <SendHorizontal color={p.paper} size={17} />}</IconButton>
      </View>
    </View>
    <ChatSheet visible={sheet !== null} title={sheet ? titles[sheet] : ''} busy={busy || reactingMessageId !== null} onClose={() => { if (!busy && !reactionLock.current) { setSheet(null); setSelectedPhoto(null) } }}>
      {sheet === 'menu' ? <>
        <Text numberOfLines={1} style={styles.muted}>{title}</Text>
        {chat.kind === 'group' ? <Text style={styles.tiny}>{chat.participantIds.map(id => chat.participants[id]?.nickname || '참여자').join(', ')}</Text> : null}
        <View accessibilityRole="menu" style={styles.menuList}>
          <MenuItem tool icon={<Pin size={20} color={p.olive} />} title="고정 메시지" description="중요한 대화를 다시 확인해요" onPress={() => show('pins')} />
          <MenuItem tool icon={<Images size={20} color={p.olive} />} title="미디어 모아보기" description="주고받은 사진을 한눈에 봐요" onPress={() => { setSelectedPhoto(null); show('media') }} />
          <MenuItem last={chat.kind === 'group' || !other} icon={<Flag size={20} color={p.danger} />} title="채팅 신고" description="이 대화의 내용을 신고해요" onPress={() => openReport({ kind: 'chat', targetId: chatId, label: title })} />
          {chat.kind !== 'group' && other ? <MenuItem icon={<ShieldAlert size={20} color={p.danger} />} title="유저 신고" description={`${other.nickname}님의 계정을 신고해요`} onPress={() => openReport({ kind: 'user', targetId: other.uid, label: other.nickname })} /> : null}
          {chat.kind !== 'group' && other ? <MenuItem last icon={<Ban size={20} color={p.danger} />} title="유저 차단" description={`${other.nickname}님의 메시지를 더 이상 보지 않아요`} onPress={() => openBlock({ uid: other.uid, nickname: other.nickname, photoURL: other.photoURL })} /> : null}
        </View>
      </> : null}
      {sheet === 'invite' ? <>
        <SearchBox accessibilityLabel="친구 검색" value={candidateQuery} onChangeText={setCandidateQuery} editable={!busy} autoCapitalize="none" autoCorrect={false} placeholder="닉네임 또는 @사용자 이름" />
        {invitees.length ? <SelectedPeople people={invitees} disabled={busy} onRemove={toggleInvitee} /> : null}
        {inviteSearch.error ? <View style={styles.errorBlock}><Notice error>{inviteSearch.error}</Notice><Button title="다시 불러오기" variant="secondary" onPress={inviteSearch.retry} /></View> : null}
        {inviteSearch.loading ? <Text style={styles.emptyText}>{inviteSearch.searching ? '사람을 찾는 중입니다.' : '친구 목록을 불러오는 중입니다.'}</Text> : null}
        {!inviteSearch.loading && !inviteSearch.error && !candidates.length ? <Text style={styles.emptyText}>{inviteSearch.searching ? '검색 결과가 없습니다.' : '초대할 팔로잉이 없습니다. 닉네임이나 @사용자 이름으로 찾아보세요.'}</Text> : null}
        <View>{candidates.map(user => <PersonChoice key={user.uid} user={user} disabled={busy} selected={invitees.some(item => item.uid === user.uid)} onPress={() => toggleInvitee(user)} />)}</View>
        <View style={styles.dialogActions}>
          <Button title="취소" variant="secondary" disabled={busy} style={{ flex: 1 }} onPress={() => setSheet(null)} />
          <Button title={busy ? '초대 중' : '초대하기'} icon={<UserPlus size={17} color={p.paper} />} loading={busy} disabled={!invitees.length} style={{ flex: 1 }} onPress={() => void invite()} />
        </View>
      </> : null}
      {sheet === 'pins' ? <>
        {!pinned.length ? <View style={styles.collectionEmpty}><Pin size={30} color={p.muted} /><Text style={styles.muted}>아직 고정한 메시지가 없습니다.</Text><Text style={[styles.tiny, { textAlign: 'center', lineHeight: 19 }]}>메시지를 길게 누르거나 옆의 ··· 메뉴에서 고정해 보세요.</Text></View> : <>
          <Text style={styles.hint}>참여자 모두에게 공유된 메시지입니다. 누르면 해당 대화로 이동해요.</Text>
          {pinned.map(message => <Pressable key={message.id} style={({ pressed }) => [styles.pinnedItem, pressed && { backgroundColor: p.surface }]} onPress={() => jumpToMessage(message.id)} accessibilityRole="button">
            {message.photoUrl ? <RemoteImage uri={message.photoUrl} style={styles.pinnedThumbnail} /> : null}
            <View style={{ flex: 1, gap: 7, minWidth: 0 }}><Text style={styles.pinnedAuthor}>{message.authorNickname}</Text><Text numberOfLines={3} style={styles.pinnedContent}>{message.content || message.photoName || '사진 메시지'}</Text><Text style={styles.time}>{formatTimestamp(message.createdAt)}</Text></View>
            <ArrowUpRight color={p.olive} size={18} />
          </Pressable>)}
        </>}
      </> : null}
      {sheet === 'media' && !selectedPhoto ? <>{!media.length ? <View style={styles.collectionEmpty}><Images size={30} color={p.muted} /><Text style={styles.muted}>아직 주고받은 사진이 없습니다.</Text></View> : null}<View style={styles.mediaGrid}>{media.map(message => <Pressable key={message.id} style={styles.mediaTile} accessibilityLabel={`${message.authorNickname} · ${formatTimestamp(message.createdAt)} 사진 보기`} onPress={() => setSelectedPhoto(message)}><RemoteImage uri={message.photoUrl} style={{ width: '100%', height: '100%' }} /></Pressable>)}</View></> : null}
      {(sheet === 'photo' || sheet === 'media') && selectedPhoto ? <>
        <View style={styles.viewer}><RemoteImage uri={selectedPhoto.photoUrl} accessibilityLabel={selectedPhoto.photoName || `${selectedPhoto.authorNickname}님이 보낸 사진`} style={{ width: '100%', height: '100%' }} contentFit="contain" /></View>
        <View style={{ gap: 7 }}><Text style={styles.pinnedAuthor}>{selectedPhoto.authorNickname}</Text><Text style={styles.time}>{formatTimestamp(selectedPhoto.createdAt)}</Text>{selectedPhoto.content ? <Text style={[styles.messageText, { marginTop: 8 }]}>{selectedPhoto.content}</Text> : null}</View>
        {sheet === 'media' ? <View style={styles.mediaNav}><IconButton label="이전 사진" size={44} style={{ width: 36 }} disabled={selectedIndex <= 0} onPress={() => setSelectedPhoto(media[selectedIndex - 1])}><ChevronLeft size={20} color={p.ink} /></IconButton><Text style={[styles.muted, { minWidth: 40, textAlign: 'center' }]}>{selectedIndex + 1} / {media.length}</Text><IconButton label="다음 사진" size={44} style={{ width: 36 }} disabled={selectedIndex < 0 || selectedIndex >= media.length - 1} onPress={() => setSelectedPhoto(media[selectedIndex + 1])}><ChevronRight size={20} color={p.ink} /></IconButton></View> : null}
        <Button title="대화로 이동" variant="secondary" icon={<ArrowUpRight size={16} color={p.ink} />} onPress={() => jumpToMessage(selectedPhoto.id)} />{sheet === 'media' ? <Button title="사진 목록" variant="secondary" onPress={() => setSelectedPhoto(null)} /> : null}{selectedPhoto.uid !== uid && selectedPhoto.uid !== 'deleted-user' ? <Button title="사진 신고" variant="secondary" icon={<Flag size={16} color={p.ink} />} onPress={() => reportPhoto(selectedPhoto)} /> : null}
      </> : null}
      {sheet === 'actions' && selectedMessage && selectedMessage.uid !== 'deleted-user' ? <>
        <View style={styles.actionsPreview}><Text style={styles.pinnedAuthor}>{selectedMessage.authorNickname}</Text><Text numberOfLines={3} style={styles.muted}>{selectedMessage.content || selectedMessage.photoName || '사진 메시지'}</Text></View>
        <View style={{ gap: 8 }}>
          <Text style={styles.legend}>이모지 반응</Text>
          <View style={styles.reactionPicker}>{CHAT_REACTION_OPTIONS.map(option => {
            const selected = selectedMessage.reactionsBy?.[uid] === option.emoji
            const disabled = busy || reactingMessageId !== null
            return <Pressable key={option.emoji} accessibilityRole="button" accessibilityLabel={`${option.label} ${selected ? '반응 취소' : '반응하기'}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => void reactToMessage(selectedMessage, option.emoji, true)} style={({ pressed }) => [styles.reactionOption, selected && styles.reactionSelected, (pressed || disabled) && { opacity: 0.6 }]}><Text style={styles.reactionOptionEmoji}>{option.emoji}</Text></Pressable>
          })}</View>
         
          {reactingMessageId === selectedMessage.id ? <ActivityIndicator size="small" color={p.primary} accessibilityLabel="반응 저장 중" /> : null}
        </View>
        <View>
          <ActionRow tone="pin" icon={chat.pinnedMessageIds?.includes(selectedMessage.id) ? <PinOff size={18} color={p.ink} /> : <Pin size={18} color={p.ink} />} title={busy ? '변경 중…' : chat.pinnedMessageIds?.includes(selectedMessage.id) ? '메시지 고정 해제' : '메시지 고정'} disabled={busy || reactingMessageId !== null} onPress={() => void togglePin()} />
         
        </View>
        {selectedMessage.content ? <ActionRow icon={<Copy size={18} color={p.ink} />} title="메시지 복사" disabled={busy || reactingMessageId !== null} onPress={() => { void Clipboard.setStringAsync(selectedMessage.content).then(() => { setSheet(null) }).catch(e => setSheetError(errorText(e))) }} /> : null}
        {selectedMessage.uid !== uid ? <ActionRow tone="report" icon={<Flag size={18} color={p.danger} />} title="이 메시지 신고" disabled={busy || reactingMessageId !== null} onPress={() => openReport({ kind: 'chat', targetId: chatId, messageId: selectedMessage.id, label: `${selectedMessage.authorNickname}의 메시지` })} /> : null}
        {selectedMessage.uid !== uid && selectedMessage.photoUrl ? <ActionRow tone="report" icon={<Flag size={18} color={p.danger} />} title="이 사진 신고" disabled={busy || reactingMessageId !== null} onPress={() => reportPhoto(selectedMessage)} /> : null}
        {selectedMessage.uid !== uid ? <ActionRow tone="report" icon={<Ban size={18} color={p.danger} />} title={`${selectedMessage.authorNickname}님 차단`} disabled={busy || reactingMessageId !== null} onPress={() => openBlock({ uid: selectedMessage.uid, nickname: selectedMessage.authorNickname, photoURL: chat.participants[selectedMessage.uid]?.photoURL })} /> : null}
      </> : null}
      {sheet === 'readers' ? <>{readers.length ? <View style={{ gap: 4 }}>{readers.map(reader => <View key={reader.uid} style={styles.readerRow}><ReaderAvatar reader={reader} size={32} /><Text style={styles.readerName}>{reader.nickname || '참여자'}</Text>{reader.uid === uid ? <Text style={styles.selfBadge}>나</Text> : null}</View>)}</View> : <Text style={styles.emptyText}>아직 읽은 사람이 없습니다.</Text>}</> : null}
      {sheet === 'report' ? <>
        <View style={styles.actionsPreview}><Text style={styles.tiny}>신고 대상</Text><Text style={styles.pinnedAuthor}>{reportTarget?.label}</Text></View>
        <Text style={styles.legend}>신고 사유</Text>
        <View style={styles.reasonList}>{REPORT_REASONS.map(item => <Chip key={item.id} label={item.label} selected={reason === item.id} onPress={() => setReason(item.id)} />)}</View>
        <Field label="상세 내용 (선택)" value={details} onChangeText={setDetails} editable={!busy} multiline maxLength={2000} placeholder="어떤 문제가 있는지 알려 주세요." />
        <Text style={styles.hint}>신고자 정보는 상대에게 공개되지 않습니다. 운영팀이 내용을 확인합니다.</Text>
        <View style={styles.dialogActions}>
          <Button title="취소" variant="secondary" disabled={busy} style={{ flex: 1 }} onPress={() => setSheet(null)} />
          <Button title="신고 접수" loading={busy} style={{ flex: 1 }} onPress={() => void report()} />
        </View>
      </> : null}
      {sheet === 'block' && blockTarget ? <>
        <View style={{ gap: 8 }}>{blockNotice(blockTarget.nickname || '사용자').map(line => <Text key={line} style={styles.muted}>{line}</Text>)}</View>
        <View style={styles.dialogActions}>
          <Button title="취소" variant="secondary" disabled={busy} style={{ flex: 1 }} onPress={() => setSheet(null)} />
          <Button title={busy ? '차단 중…' : '차단하기'} variant="danger" loading={busy} style={{ flex: 1 }} icon={<Ban size={17} color={p.paper} />} onPress={() => void confirmBlock()} />
        </View>
      </> : null}
      {sheetError ? <Notice error>{sheetError}</Notice> : null}
    </ChatSheet>
    <PhotoEditor photo={editorOpen ? photo : null} onClose={() => setEditorOpen(false)} onSave={next => { setPhoto(next); setEditorOpen(false) }} />
  </KeyboardPane></SafeAreaView>
}

function ChatSheet({ visible, title, onClose, children, busy = false }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  return <Dialog visible={visible} title={title} onClose={onClose} busy={busy}>{children}</Dialog>
}

function GroupAvatar({ size }: { size: number }) {
  return <View style={[styles.groupAvatar, { width: size, height: size, borderRadius: size / 2 }]}><UsersRound color={p.ink} size={Math.round(size * 0.46)} /></View>
}
function ReaderAvatar({ reader, size, style }: { reader: ChatParticipant; size: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.readerAvatar, { width: size, height: size, borderRadius: size / 2 }, style]}>
    {reader.photoURL ? <RemoteImage uri={reader.photoURL} style={StyleSheet.absoluteFill} /> : <Text style={{ color: p.ink, fontSize: size > 20 ? 13 : 8, fontWeight: '700' }}>{Array.from(reader.nickname.trim())[0] || '?'}</Text>}
  </View>
}
// Room menu entries: tools in ink with olive icons, reports in the danger color.
function MenuItem({ icon, title, description, onPress, tool = false, last = false }: { icon: ReactNode; title: string; description: string; onPress: () => void; tool?: boolean; last?: boolean }) {
  return <Pressable accessibilityRole="menuitem" onPress={onPress} style={({ pressed }) => [styles.menuItem, last && { borderBottomWidth: 0 }, pressed && { backgroundColor: p.surface }]}>
    {icon}<View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text style={[styles.menuItemTitle, { color: tool ? p.ink : p.danger }]}>{title}</Text><Text style={styles.menuItemDescription}>{description}</Text></View><ChevronRight size={17} color={p.light} />
  </Pressable>
}
function ActionRow({ icon, title, onPress, disabled = false, tone }: { icon: ReactNode; title: string; onPress: () => void; disabled?: boolean; tone?: 'pin' | 'report' }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionRow, tone === 'pin' && styles.pinAction, tone === 'report' && styles.reportAction, (pressed || disabled) && { opacity: disabled ? 0.65 : 0.8 }]}>
    {icon}<Text style={[styles.actionRowText, tone === 'report' && { color: p.danger }]}>{title}</Text>
  </Pressable>
}
function SelectedPeople({ people, disabled, onRemove }: { people: DaymarkUser[]; disabled: boolean; onRemove: (user: DaymarkUser) => void }) {
  return <View style={styles.selectedList}>{people.map(user => <Pressable key={user.uid} accessibilityRole="button" accessibilityLabel={`${user.nickname}${user.username ? ` (@${user.username})` : ''} 선택 해제`} disabled={disabled} onPress={() => onRemove(user)} style={styles.selectedChip}>
    <Text numberOfLines={1} style={styles.selectedChipText}>{user.nickname}</Text><X size={14} color={p.ink} />
  </Pressable>)}</View>
}
function PersonChoice({ user, selected, onPress, disabled = false }: { user: DaymarkUser; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable style={({ pressed }) => [styles.personRow, (selected || pressed) && { backgroundColor: p.surface }]} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}>
    <View style={[styles.checkbox, selected && { backgroundColor: p.primary, borderColor: p.primary }]}>{selected ? <Check size={13} color={p.paper} /> : null}</View>
    <Avatar name={user.nickname} uri={user.photoURL} size={48} />
    <View style={{ flex: 1, gap: 3, minWidth: 0 }}><Text style={styles.personName}>{user.nickname}</Text>{user.username ? <Text style={styles.tiny}>@{user.username}</Text> : null}</View>
  </Pressable>
}
function errorText(error: unknown) { return error instanceof Error ? error.message : '처리하지 못했습니다. 다시 시도해 주세요.' }

const styles = StyleSheet.create({
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: '100%' },
  reactionChip: { minWidth: 48, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: p.line, borderRadius: 18, backgroundColor: p.paper },
  reactionSelected: { borderColor: p.primary, backgroundColor: p.primarySoft },
  reactionEmoji: { fontSize: 17 }, reactionCount: { fontSize: 12, fontWeight: '700', color: p.muted },
  reactionPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reactionOption: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.line, borderRadius: 22, backgroundColor: p.bg },
  reactionOptionEmoji: { fontSize: 24 },
  muted: { fontSize: 14, lineHeight: 21, color: p.muted }, tiny: { fontSize: 12, color: p.muted, lineHeight: 17 }, meta: { fontSize: 13, lineHeight: 19, color: p.muted, marginTop: 2 }, time: { fontSize: 12, lineHeight: 17, color: p.light },
  emptyText: { color: p.muted, fontSize: 14, lineHeight: 25, textAlign: 'center', paddingVertical: 18 }, legend: { color: p.ink, fontSize: 14, fontWeight: '600' }, hint: { color: p.muted, fontSize: 12.5, lineHeight: 21 },
  errorBlock: { gap: 10 }, dialogActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatRow: { minHeight: 92, paddingVertical: 24, flexDirection: 'row', alignItems: 'center', gap: 14 },
  chatRowSeparator: { borderTopWidth: 1, borderTopColor: p.line },
  listPage: { paddingTop: 0, gap: 0 },
  // Keep the last conversation clear of the floating button.
  chatList: { marginBottom: 72, paddingTop: 8, borderTopWidth: 1, borderTopColor: p.line },
  chatRowPressed: { backgroundColor: p.surface },
  chatRowContent: { flex: 1, minWidth: 0, gap: 5 }, chatTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: p.ink },
  groupAvatar: { backgroundColor: p.oliveSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, unread: { width: 9, height: 9, flexShrink: 0, backgroundColor: p.primary, borderRadius: 9 },
  selectedList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', minHeight: 36, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: p.line, borderRadius: 20, backgroundColor: p.primarySoft },
  selectedChipText: { maxWidth: 160, fontSize: 12.8, color: p.ink },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, minHeight: 64 }, personName: { fontSize: 15, fontWeight: '600', color: p.ink },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: p.muted, alignItems: 'center', justifyContent: 'center' },
  room: { flex: 1, backgroundColor: p.bg },
  roomHeader: { backgroundColor: p.bg, borderBottomWidth: 1, borderBottomColor: p.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  roomIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }, roomTitle: { fontSize: 19, lineHeight: 26, fontWeight: '600', color: p.ink },
  headerActions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: p.oliveSoft, borderBottomWidth: 1, borderBottomColor: p.line, paddingHorizontal: 18, paddingVertical: 12 },
  pinnedBannerTitle: { fontSize: 12, fontWeight: '600', color: p.ink }, pinnedBannerText: { fontSize: 13.3, color: p.ink },
  errorWrap: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 4 }, messages: { paddingHorizontal: 18, paddingVertical: 18 },
  collectionEmpty: { alignItems: 'center', gap: 12, paddingVertical: 44, paddingHorizontal: 18 },
  dateSeparator: { alignItems: 'center', marginVertical: 12 },
  dateSeparatorText: { fontSize: 12.5, fontWeight: '700', color: p.muted, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: p.line, borderRadius: 999, overflow: 'hidden' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 5 },
  messageStack: { flexShrink: 1, minWidth: 0, gap: 5, alignItems: 'flex-start' }, author: { color: p.muted, fontSize: 13 },
  messageContent: { gap: 5, maxWidth: '100%', alignItems: 'flex-start', borderRadius: 22 },
  bubble: { backgroundColor: p.paper, borderRadius: 14, borderTopLeftRadius: 4, paddingVertical: 12, paddingHorizontal: 16, maxWidth: '100%' },
  mineBubble: { backgroundColor: p.primary, borderTopLeftRadius: 14, borderTopRightRadius: 4 },
  highlighted: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: p.primary, outlineOffset: 5 },
  messageText: { fontSize: 16, lineHeight: 25, color: p.ink },
  messagePhoto: { width: 240, height: 240, maxWidth: '100%', borderRadius: 20, borderWidth: 1, borderColor: p.line, backgroundColor: p.surface },
  messageMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 }, readStatus: { color: p.primaryHover, fontSize: 12, fontWeight: '700' },
  receipts: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 24, minHeight: 24, padding: 3, borderRadius: 12 },
  readerAvatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: p.paper, backgroundColor: p.surface },
  readerOverflow: { color: p.muted, fontSize: 9, fontWeight: '600' },
  readerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, readerName: { flexShrink: 1, fontSize: 14.4, color: p.ink },
  selfBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: p.surface, color: p.muted, fontSize: 11 },
  optionsButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pinnedText: { color: p.muted, fontSize: 11 },
  composer: { gap: 8, paddingHorizontal: 12, paddingTop: 12, backgroundColor: p.paper, borderTopWidth: 1, borderTopColor: p.line, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attachButton: { borderRadius: 6, borderWidth: 1, borderColor: p.line },
  sendButton: { borderRadius: 6, backgroundColor: p.primary },
  messageInput: { flex: 1, fontSize: 15, lineHeight: 21, color: p.ink, minHeight: 44, maxHeight: 120, backgroundColor: p.paper, borderWidth: 1, borderColor: p.line, borderRadius: 22, paddingVertical: 11, paddingHorizontal: 16 },
  photoPreview: { flexDirection: 'row', gap: 10, alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', padding: 9, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, borderRadius: 18 },
  photoPreviewImage: { width: 62, height: 62, borderRadius: 14 }, link: { color: p.primary, fontWeight: '600', fontSize: 13 },
  menuList: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.line },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: p.line },
  menuItemTitle: { fontSize: 14.4, fontWeight: '600' }, menuItemDescription: { color: p.muted, fontSize: 12.2, lineHeight: 18 },
  actionsPreview: { gap: 6, padding: 14, borderWidth: 1, borderColor: p.line, borderRadius: 10, backgroundColor: p.bg },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: p.line },
  pinAction: {}, reportAction: {},
  actionRowText: { color: p.ink, fontSize: 14, fontWeight: '700' }, pinHint: { color: p.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  pinnedItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1, borderColor: p.line, borderRadius: 20, backgroundColor: p.paper },
  pinnedThumbnail: { width: 56, height: 64, borderRadius: 12 }, pinnedAuthor: { color: p.ink, fontSize: 13.3, fontWeight: '600' }, pinnedContent: { color: p.ink, fontSize: 14.4, lineHeight: 23 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, mediaTile: { width: '32.4%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: p.surface },
  viewer: { width: '100%', height: 360, padding: 12, backgroundColor: p.ink, borderRadius: 6, overflow: 'hidden' },
  mediaNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  reasonList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
