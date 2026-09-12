import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, AppState, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as Clipboard from 'expo-clipboard'
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ImagePlus, Images, MessageCircle, MoreHorizontal, Pin, Plus, Send, UsersRound, X } from 'lucide-react-native'
import { Avatar, Button, Chip, Empty, Field, Notice, Row, Screen, p } from '../components/ui'
import { PhotoEditor } from '../components/PhotoEditor'
import { useAuth } from '../hooks/useAuth'
import { getChatMedia, getPinnedChatMessages } from '../lib/chatCollections'
import { getMessageReaders } from '../lib/chatReadReceipts'
import { formatChatDateSeparator, formatChatTime, formatTimestamp, getTimestampDateKey } from '../lib/date'
import { invalidateAppReads } from '../lib/readCache'
import { addParticipantsToChat, createGroupChat, getChatInviteCandidates, getOtherParticipant, markChatAsRead, refreshChatParticipant, sendChatMessage, setChatMessagePinned, subscribeToChat, subscribeToChatMessages, subscribeToMyChats } from '../services/chatService'
import { submitReport } from '../services/moderationService'
import { uploadChatPhoto, type UploadPhoto } from '../services/storageService'
import { listUsers } from '../services/userService'
import { REPORT_REASONS, type ReportTarget } from '../types/moderation'
import type { ChatMessage, DaymarkChat } from '../types/chat'
import type { DaymarkUser } from '../types/user'

function roomName(chat: DaymarkChat, uid: string) {
  return chat.kind === 'group' ? chat.name || '단체 채팅' : getOtherParticipant(chat, uid)?.nickname || '채팅'
}
function matchesPerson(user: DaymarkUser, query: string) {
  return `${user.nickname} ${user.username || ''}`.toLowerCase().includes(query.trim().toLowerCase().replace(/^@/, ''))
}

export function ChatListScreen() {
  const router = useRouter()
  const { currentUser, profile, firebaseReady } = useAuth()
  const [chats, setChats] = useState<DaymarkChat[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [people, setPeople] = useState<DaymarkUser[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [peopleSearch, setPeopleSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const uid = currentUser?.uid

  useFocusEffect(useCallback(() => {
    setChats([]); setError('')
    if (!uid || !firebaseReady) { setLoading(false); return }
    setLoading(true)
    return subscribeToMyChats(uid, next => { setChats(next); setLoading(false) }, e => { setError(e.message); setLoading(false) })
  }, [uid, firebaseReady, revision]))

  async function openGroup() {
    if (!uid) { router.push('/login'); return }
    setOpen(true); setDialogError(''); setSelected([]); setPeopleSearch(''); setPeopleLoading(true)
    try { setPeople((await listUsers()).filter(user => user.uid !== uid)) }
    catch (e) { setDialogError(errorText(e)) }
    finally { setPeopleLoading(false) }
  }
  async function create() {
    if (!profile || busy || !selected.length) return
    setBusy(true); setDialogError('')
    try {
      const id = await createGroupChat(profile, people.filter(person => selected.includes(person.uid)), name.trim())
      setOpen(false); setName('')
      router.push({ pathname: '/chats/[chatId]', params: { chatId: id } })
    } catch (e) { setDialogError(errorText(e)) }
    finally { setBusy(false) }
  }
  const filtered = chats.filter(chat => `${roomName(chat, uid || '')} ${chat.lastMessage}`.toLowerCase().includes(keyword.trim().toLowerCase()))

  return <Screen title="채팅" refreshing={loading} onRefresh={() => setRevision(value => value + 1)} right={<IconButton label="단체방 만들기" onPress={() => void openGroup()}><Plus color={p.primary} size={24} /></IconButton>}>
    <View style={styles.intro}><MessageCircle size={28} color={p.primary} /><Text style={styles.muted}>발견한 장소에서 시작되는{ '\n' }우리의 대화.</Text></View>
    <Field placeholder="대화방 이름 또는 최근 메시지 검색" accessibilityLabel="채팅 검색" value={keyword} onChangeText={setKeyword} />
    {error ? <Notice error>{error}</Notice> : null}
    {loading ? <ActivityIndicator color={p.primary} style={{ margin: 24 }} /> : null}
    {!uid ? <><Empty title="대화를 시작해 보세요" description="로그인하면 친구와 장소를 나누고 이야기할 수 있어요." /><Button title="로그인" onPress={() => router.push('/login')} /></> : !loading && !filtered.length && !error ? <><Empty title={keyword ? '검색된 채팅이 없습니다' : '아직 채팅이 없어요'} description="친구의 프로필에서 대화를 시작하거나 단체방을 만들어 보세요." /><Button title="사람 찾기" variant="secondary" onPress={() => router.push('/people')} /></> : null}
    {filtered.map(chat => {
      const other = getOtherParticipant(chat, uid || '')
      const unread = Boolean(chat.lastMessageUid !== uid && chat.lastMessageAt && (!chat.readAtBy?.[uid || ''] || chat.lastMessageAt.toMillis() > chat.readAtBy[uid || ''].toMillis()))
      return <Pressable key={chat.id} style={styles.chatRow} accessibilityRole="button" accessibilityLabel={`${roomName(chat, uid || '')}${unread ? ', 읽지 않은 메시지' : ''}`} onPress={() => router.push({ pathname: '/chats/[chatId]', params: { chatId: chat.id } })}>
        {chat.kind === 'group' ? <View style={styles.groupAvatar}><UsersRound color={p.primary} size={27} /></View> : <Avatar uri={other?.photoURL} name={other?.nickname} size={54} />}
        <View style={{ flex: 1, gap: 7 }}><View style={styles.between}><Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{roomName(chat, uid || '')}{chat.kind === 'group' ? `  ${chat.participantIds.length}` : ''}</Text><Text style={styles.tiny}>{formatChatTime(chat.lastMessageAt)}</Text></View><View style={styles.between}><Text numberOfLines={2} style={[styles.muted, { flex: 1 }]}>{chat.lastMessage || '첫 메시지를 보내 보세요.'}</Text>{unread ? <View style={styles.unread} /> : null}</View></View>
      </Pressable>
    })}
    <ChatSheet visible={open} title="단체방 만들기" onClose={() => { if (!busy) setOpen(false) }}>
      <Field label="대화방 이름" value={name} onChangeText={setName} maxLength={40} placeholder="예: 주말 맛집 핀 모임" />
      <Field label="친구 검색" value={peopleSearch} onChangeText={setPeopleSearch} placeholder="닉네임 또는 @사용자 이름" />
      <Text style={styles.muted}>함께할 친구 {selected.length}명 선택</Text>
      {peopleLoading ? <ActivityIndicator color={p.primary} /> : null}
      {people.filter(user => matchesPerson(user, peopleSearch)).map(user => <PersonChoice key={user.uid} user={user} selected={selected.includes(user.uid)} onPress={() => setSelected(ids => ids.includes(user.uid) ? ids.filter(id => id !== user.uid) : [...ids, user.uid])} />)}
      {!peopleLoading && !people.length ? <Empty title="초대할 사람이 없습니다" /> : null}
      {dialogError ? <Notice error>{dialogError}</Notice> : null}<Button title="단체방 만들기" loading={busy} disabled={!selected.length || !name.trim() || peopleLoading} onPress={() => void create()} />
    </ChatSheet>
  </Screen>
}

type RoomSheet = 'menu' | 'invite' | 'pins' | 'media' | 'actions' | 'readers' | 'report' | 'photo' | null

export function ChatRoomScreen() {
  const params = useLocalSearchParams<{ chatId: string }>()
  const chatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { currentUser, profile, firebaseReady } = useAuth()
  const uid = currentUser?.uid
  const [chat, setChat] = useState<DaymarkChat | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
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
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<ChatMessage | null>(null)
  const [highlightedId, setHighlightedId] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(AppState.currentState === 'active')
  const [revision, setRevision] = useState(0)
  const [candidates, setCandidates] = useState<DaymarkUser[]>([])
  const [candidateQuery, setCandidateQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sheetError, setSheetError] = useState('')
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].id)
  const [details, setDetails] = useState('')
  const list = useRef<FlatList<ChatMessage>>(null)
  const atBottom = useRef(true)
  const sendLock = useRef(false)
  const pendingRead = useRef(false)
  const retryJump = useRef<ReturnType<typeof setTimeout> | null>(null)
  const title = chat && uid ? roomName(chat, uid) : '채팅'
  const other = chat && uid ? getOtherParticipant(chat, uid) : null
  const reversed = useMemo(() => [...messages].reverse(), [messages])
  const pinned = useMemo(() => getPinnedChatMessages(messages, chat?.pinnedMessageIds), [messages, chat?.pinnedMessageIds])
  const media = useMemo(() => getChatMedia(messages), [messages])
  const latest = messages[messages.length - 1]

  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false) }, []))
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'))
    return () => listener.remove()
  }, [])
  useEffect(() => () => { if (retryJump.current) clearTimeout(retryJump.current) }, [])
  useEffect(() => {
    setChat(null); setMessages([]); setError(''); setContent(''); setPhoto(null); setSheet(null)
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
  async function openInvite() {
    if (!chat) return
    show('invite'); setCandidates([]); setSelectedIds([]); setCandidateQuery(''); setCandidatesLoading(true)
    try { invalidateAppReads(); setCandidates(await getChatInviteCandidates(chat.id)) }
    catch (e) { setSheetError(errorText(e)) }
    finally { setCandidatesLoading(false) }
  }
  async function invite() {
    if (!chat || busy || !selectedIds.length) return
    setBusy(true); setSheetError('')
    try { await addParticipantsToChat(chat.id, candidates.filter(user => selectedIds.includes(user.uid))); setSheet(null) }
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
  function reportPhoto(message: ChatMessage) {
    if (!message.photoUrl) return
    openReport({ kind: 'photo', sourceKind: 'chat', targetId: chatId, messageId: message.id, photoUrl: message.photoUrl, label: `${message.authorNickname}의 채팅 사진` })
  }
  const titles: Record<Exclude<RoomSheet, null>, string> = { menu: '채팅방 메뉴', invite: '단체방 초대', pins: '고정 메시지', media: '미디어 모아보기', actions: '메시지 메뉴', readers: '읽은 사람', report: '신고하기', photo: '사진 보기' }
  const readers = selectedMessage && chat ? getMessageReaders(selectedMessage, chat) : []
  const selectedIndex = media.findIndex(message => message.id === selectedPhoto?.id)

  if (loading || !uid || !chat) return <Screen title="채팅" back>{loading ? <ActivityIndicator color={p.primary} style={{ margin: 40 }} /> : <><Empty title={uid ? '채팅방을 열 수 없습니다' : '로그인이 필요해요'} />{error ? <Notice error>{error}</Notice> : null}<Button title={uid ? '다시 시도' : '로그인'} onPress={() => uid ? setRevision(value => value + 1) : router.push('/login')} /><Button title="채팅 목록" variant="secondary" onPress={() => router.replace('/chats')} /></>}</Screen>

  return <SafeAreaView style={styles.room} edges={['top', 'left', 'right']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.roomHeader}>
      <IconButton label="채팅 목록으로" onPress={() => router.canGoBack() ? router.back() : router.replace('/chats')}><ArrowLeft size={23} color={p.ink} /></IconButton>
      <Pressable style={styles.roomIdentity} onPress={() => other && chat.kind !== 'group' ? router.push({ pathname: '/people/[userId]', params: { userId: other.uid } }) : show('menu')} accessibilityRole="button">
        <Avatar uri={chat.kind === 'group' ? undefined : other?.photoURL} name={title} size={37} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.name}>{title}</Text><Text style={styles.tiny}>{chat.kind === 'group' ? `${chat.participantIds.length}명과 함께하는 대화` : '장소에서 이어지는 이야기'}</Text></View>
      </Pressable>
      <IconButton label="미디어 모아보기" onPress={() => { setSelectedPhoto(null); show('media') }}><Images size={21} color={p.primary} /></IconButton>
      <IconButton label="채팅방 메뉴" onPress={() => show('menu')}><MoreHorizontal size={24} color={p.ink} /></IconButton>
    </View>
    {pinned.length ? <Pressable style={styles.pinnedBanner} accessibilityRole="button" accessibilityLabel={`고정 메시지 ${pinned.length}개 보기`} onPress={() => show('pins')}><Pin color={p.primary} size={16} /><Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: p.primary }}>{pinned[0].content || '사진 메시지'}</Text><Text style={styles.tiny}>{pinned.length}</Text><ChevronRight color={p.primary} size={16} /></Pressable> : null}
    {error ? <View style={styles.errorWrap}><Notice error>{error}</Notice><Pressable onPress={() => setError('')} accessibilityLabel="안내 닫기"><X color={p.muted} size={17} /></Pressable></View> : null}
    {messageError ? <View style={{ padding: 16, gap: 10 }}><Notice error>{messageError}</Notice><Button title="대화 다시 불러오기" variant="secondary" onPress={() => setRevision(value => value + 1)} /></View> : null}
    {messagesLoading ? <ActivityIndicator color={p.primary} style={{ margin: 18 }} /> : null}
    <FlatList ref={list} data={reversed} inverted keyExtractor={item => item.id} style={{ flex: 1 }} contentContainerStyle={styles.messages} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" initialNumToRender={25} maxToRenderPerBatch={20}
      onScroll={event => { atBottom.current = event.nativeEvent.contentOffset.y < 90 }} scrollEventThrottle={100}
      onScrollToIndexFailed={info => { list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false }); if (retryJump.current) clearTimeout(retryJump.current); retryJump.current = setTimeout(() => list.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.5 }), 300) }}
      ListEmptyComponent={!messagesLoading && !messageError ? <View style={{ transform: [{ scaleY: -1 }] }}><Empty title="첫 인사를 건네 보세요" description="사진과 함께 오늘의 장소를 이야기해 보세요." /></View> : null}
      renderItem={({ item, index }) => {
        const mine = item.uid === uid
        const prev = reversed[index + 1]
        const dateKey = getTimestampDateKey(item.createdAt)
        const dayChanged = dateKey && (!prev || getTimestampDateKey(prev.createdAt) !== dateKey)
        const readCount = getMessageReaders(item, chat).length
        const isPinned = chat.pinnedMessageIds?.includes(item.id)
        return <View>
          {dayChanged ? <Text style={styles.dateSeparator}>{formatChatDateSeparator(dateKey)}</Text> : null}
          <View style={[styles.messageRow, mine && styles.mineRow]}>
            {!mine ? <Pressable accessibilityLabel={`${item.authorNickname} 프로필`} onPress={() => item.uid !== 'deleted-user' && router.push({ pathname: '/people/[userId]', params: { userId: item.uid } })}><Avatar name={item.authorNickname} uri={chat.participants[item.uid]?.photoURL} size={32} /></Pressable> : null}
            <View style={[styles.messageColumn, mine && { alignItems: 'flex-end' }]}>
              {!mine ? <Text style={styles.author}>{item.authorNickname}</Text> : null}
              <Pressable accessibilityLabel={`${item.authorNickname} 메시지. 길게 눌러 메뉴 열기`} onLongPress={() => { if (item.uid !== 'deleted-user') { setSelectedMessage(item); show('actions') } }} delayLongPress={380} style={[styles.bubble, mine && styles.mineBubble, highlightedId === item.id && styles.highlighted]}>
                {isPinned ? <View style={styles.inline}><Pin size={11} color={p.primary} /><Text style={styles.pinnedText}>고정됨</Text></View> : null}
                {item.photoUrl ? <Pressable accessibilityLabel="사진 크게 보기" onPress={() => { setSelectedPhoto(item); show('photo') }} onLongPress={() => { setSelectedMessage(item); show('actions') }}><Image source={{ uri: item.photoUrl }} style={styles.messagePhoto} resizeMode="cover" /></Pressable> : null}
                {item.content ? <Text style={styles.messageText}>{item.content}</Text> : null}
              </Pressable>
              <View style={[styles.messageMeta, mine && { justifyContent: 'flex-end' }]}><Text style={styles.tiny}>{formatChatTime(item.createdAt)}</Text>{readCount > 0 || mine ? <Pressable accessibilityRole="button" accessibilityLabel={`읽은 사람 ${readCount}명 보기`} onPress={() => { setSelectedMessage(item); show('readers') }}><Text style={styles.readStatus}>{readCount ? `${readCount}명 읽음` : '보냄'}</Text></Pressable> : null}{item.uid !== 'deleted-user' ? <Pressable accessibilityLabel="메시지 메뉴" onPress={() => { setSelectedMessage(item); show('actions') }} hitSlop={8}><MoreHorizontal size={17} color={p.muted} /></Pressable> : null}</View>
            </View>
          </View>
        </View>
      }} />
    {photo ? <View style={styles.photoPreview}><Image source={{ uri: photo.uri }} style={{ width: 65, height: 65, borderRadius: 10 }} /><View style={{ flex: 1, gap: 9 }}><Text style={styles.tiny}>선택한 사진</Text><View style={styles.inline}><Pressable disabled={editing || sending} onPress={() => { Keyboard.dismiss(); setEditorOpen(true) }}><Text style={styles.link}>사진 편집</Text></Pressable><Pressable disabled={editing || sending} onPress={() => void editPhoto('rotate')}><Text style={styles.link}>회전</Text></Pressable><Pressable disabled={editing || sending} onPress={() => void editPhoto('flip')}><Text style={styles.link}>반전</Text></Pressable>{editing ? <ActivityIndicator size="small" color={p.primary} /> : null}</View></View><IconButton label="선택한 사진 제거" disabled={sending || editing} onPress={() => setPhoto(null)}><X color={p.muted} size={20} /></IconButton></View> : null}
    <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}><IconButton label="사진 첨부" disabled={sending || editing} onPress={() => Alert.alert('사진 첨부', '사진을 선택하거나 새로 촬영해 보세요.', [{ text: '취소', style: 'cancel' }, { text: '앨범에서 선택', onPress: () => void pickPhoto() }, { text: '사진 촬영', onPress: () => void pickPhoto(true) }])}><ImagePlus color={p.primary} size={24} /></IconButton><TextInput value={content} onChangeText={setContent} multiline maxLength={4000} editable={!sending} placeholder="메시지를 입력하세요" placeholderTextColor={p.muted} style={styles.messageInput} accessibilityLabel="메시지" /><IconButton label="메시지 전송" disabled={sending || editing || (!content.trim() && !photo)} onPress={() => void send()}>{sending ? <ActivityIndicator color={p.primary} /> : <Send color={p.primary} size={24} />}</IconButton></View>
    <ChatSheet visible={sheet !== null} title={sheet ? titles[sheet] : ''} onClose={() => { if (!busy) { setSheet(null); setSelectedPhoto(null) } }}>
      {sheet === 'menu' ? <>
        <Text style={styles.name}>{title}</Text><Text style={styles.muted}>{chat.participantIds.map(id => chat.participants[id]?.nickname || '참여자').join(', ')}</Text>
        {chat.kind === 'group' ? <Row title="친구 초대" subtitle="함께 이야기할 친구를 더 초대해요" onPress={() => void openInvite()} /> : null}
        <Row title={`고정 메시지 ${pinned.length}`} subtitle="중요한 대화를 다시 확인해요" onPress={() => show('pins')} />
        <Row title={`미디어 모아보기 ${media.length}`} subtitle="주고받은 사진을 한눈에 봐요" onPress={() => { setSelectedPhoto(null); show('media') }} />
        <Row title="채팅 신고" onPress={() => openReport({ kind: 'chat', targetId: chatId, label: title })} />
        {chat.kind !== 'group' && other ? <Row title="유저 신고" onPress={() => openReport({ kind: 'user', targetId: other.uid, label: other.nickname })} /> : null}
      </> : null}
      {sheet === 'invite' ? <>
        <Field label="친구 검색" value={candidateQuery} onChangeText={setCandidateQuery} placeholder="닉네임 또는 @사용자 이름" />
        {candidatesLoading ? <ActivityIndicator color={p.primary} /> : null}
        {candidates.filter(user => matchesPerson(user, candidateQuery)).map(user => <PersonChoice key={user.uid} user={user} selected={selectedIds.includes(user.uid)} onPress={() => setSelectedIds(ids => ids.includes(user.uid) ? ids.filter(id => id !== user.uid) : [...ids, user.uid])} />)}
        {!candidatesLoading && !candidates.length && !sheetError ? <Empty title="초대할 사람이 없습니다" /> : null}<Button title={`${selectedIds.length}명 초대하기`} loading={busy} disabled={!selectedIds.length || candidatesLoading} onPress={() => void invite()} />
      </> : null}
      {sheet === 'pins' ? <>
        <Notice>참여자 모두에게 공유된 메시지입니다. 누르면 해당 대화로 이동해요.</Notice>
        {!pinned.length ? <Empty title="아직 고정한 메시지가 없습니다" description="메시지를 길게 눌러 고정해 보세요." /> : null}
        {pinned.map(message => <Pressable key={message.id} style={styles.collectionRow} onPress={() => jumpToMessage(message.id)} accessibilityRole="button">{message.photoUrl ? <Image source={{ uri: message.photoUrl }} style={styles.collectionThumbnail} /> : <Pin size={22} color={p.primary} />}<View style={{ flex: 1, gap: 6 }}><Text style={styles.name}>{message.authorNickname}</Text><Text numberOfLines={3} style={styles.muted}>{message.content || '사진 메시지'}</Text><Text style={styles.tiny}>{formatTimestamp(message.createdAt)}</Text></View><ChevronRight color={p.muted} size={18} /></Pressable>)}
      </> : null}
      {sheet === 'media' && !selectedPhoto ? <>{!media.length ? <Empty title="아직 주고받은 사진이 없습니다" /> : null}<View style={styles.mediaGrid}>{media.map(message => <Pressable key={message.id} style={styles.mediaTile} accessibilityLabel={`${message.authorNickname}의 사진 보기`} onPress={() => setSelectedPhoto(message)}><Image source={{ uri: message.photoUrl }} style={{ width: '100%', height: '100%' }} /></Pressable>)}</View></> : null}
      {(sheet === 'photo' || sheet === 'media') && selectedPhoto ? <>
        <Image source={{ uri: selectedPhoto.photoUrl }} style={styles.viewer} resizeMode="contain" /><Text style={styles.name}>{selectedPhoto.authorNickname}</Text><Text style={styles.tiny}>{formatTimestamp(selectedPhoto.createdAt)}</Text>{selectedPhoto.content ? <Text style={styles.muted}>{selectedPhoto.content}</Text> : null}
        {sheet === 'media' ? <View style={styles.between}><IconButton label="이전 사진" disabled={selectedIndex <= 0} onPress={() => setSelectedPhoto(media[selectedIndex - 1])}><ChevronLeft size={25} color={p.primary} /></IconButton><Text style={styles.muted}>{selectedIndex + 1} / {media.length}</Text><IconButton label="다음 사진" disabled={selectedIndex < 0 || selectedIndex >= media.length - 1} onPress={() => setSelectedPhoto(media[selectedIndex + 1])}><ChevronRight size={25} color={p.primary} /></IconButton></View> : null}
        <Button title="대화로 이동" onPress={() => jumpToMessage(selectedPhoto.id)} />{sheet === 'media' ? <Button title="사진 목록" variant="secondary" onPress={() => setSelectedPhoto(null)} /> : null}{selectedPhoto.uid !== uid && selectedPhoto.uid !== 'deleted-user' ? <Button title="사진 신고" variant="secondary" onPress={() => reportPhoto(selectedPhoto)} /> : null}
      </> : null}
      {sheet === 'actions' && selectedMessage ? <>
        <Text style={styles.name}>{selectedMessage.authorNickname}</Text><Text style={styles.muted}>{selectedMessage.content || '사진 메시지'}</Text>
        <Button title={chat.pinnedMessageIds?.includes(selectedMessage.id) ? '메시지 고정 해제' : '메시지 고정'} loading={busy} onPress={() => void togglePin()} /><Notice>고정한 메시지는 이 방의 모든 참여자에게 보여요.</Notice>
        {selectedMessage.content ? <Button title="메시지 복사" variant="secondary" onPress={() => { void Clipboard.setStringAsync(selectedMessage.content).then(() => { setSheet(null) }).catch(e => setSheetError(errorText(e))) }} /> : null}
        {selectedMessage.uid !== uid ? <Button title="이 메시지 신고" variant="secondary" onPress={() => openReport({ kind: 'chat', targetId: chatId, messageId: selectedMessage.id, label: `${selectedMessage.authorNickname}의 메시지` })} /> : null}
        {selectedMessage.uid !== uid && selectedMessage.photoUrl ? <Button title="이 사진 신고" variant="secondary" onPress={() => reportPhoto(selectedMessage)} /> : null}
      </> : null}
      {sheet === 'readers' ? <>{readers.length ? readers.map(reader => <View key={reader.uid} style={styles.personRow}><Avatar uri={reader.photoURL} name={reader.nickname} size={42} /><Text style={styles.name}>{reader.nickname}{reader.uid === uid ? ' (나)' : ''}</Text></View>) : <Empty title="아직 읽은 사람이 없습니다" />}</> : null}
      {sheet === 'report' ? <>
        <Text style={styles.name}>{reportTarget?.label}</Text><Text style={styles.muted}>신고 사유를 선택해 주세요. 운영팀이 내용을 확인합니다.</Text>
        <View style={styles.reasonList}>{REPORT_REASONS.map(item => <Chip key={item.id} label={item.label} selected={reason === item.id} onPress={() => setReason(item.id)} />)}</View>
        <Field label="상세 내용 (선택)" value={details} onChangeText={setDetails} multiline maxLength={2000} placeholder="어떤 문제가 있는지 알려 주세요." />
        <Button title="신고 접수" loading={busy} onPress={() => void report()} />
      </> : null}
      {sheetError ? <Notice error>{sheetError}</Notice> : null}
    </ChatSheet>
    <PhotoEditor photo={editorOpen ? photo : null} onClose={() => setEditorOpen(false)} onSave={next => { setPhoto(next); setEditorOpen(false) }} />
  </KeyboardAvoidingView></SafeAreaView>
}

function ChatSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.sheet}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><IconButton label="닫기" onPress={onClose}><X size={24} color={p.ink} /></IconButton></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
}
function IconButton({ label, onPress, children, disabled = false }: { label: string; onPress: () => void; children: ReactNode; disabled?: boolean }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}>{children}</Pressable>
}
function PersonChoice({ user, selected, onPress }: { user: DaymarkUser; selected: boolean; onPress: () => void }) {
  return <Pressable style={styles.personRow} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress}><Avatar name={user.nickname} uri={user.photoURL} size={43} /><View style={{ flex: 1, gap: 4 }}><Text style={styles.name}>{user.nickname}</Text><Text style={styles.tiny}>@{user.username || 'spotit'}</Text></View><View style={[styles.checkbox, selected && { backgroundColor: p.primary, borderColor: p.primary }]}>{selected ? <Check size={15} color={p.paper} /> : null}</View></Pressable>
}
function errorText(error: unknown) { return error instanceof Error ? error.message : '처리하지 못했습니다. 다시 시도해 주세요.' }

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }, muted: { fontSize: 14, lineHeight: 21, color: p.muted }, tiny: { fontSize: 11, color: p.muted, lineHeight: 16 }, name: { fontSize: 16, fontWeight: '700', color: p.ink },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, inline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatRow: { padding: 17, borderRadius: 19, backgroundColor: p.paper, borderWidth: 1, borderColor: p.line, flexDirection: 'row', alignItems: 'center', gap: 13 }, groupAvatar: { width: 54, height: 54, borderRadius: 19, backgroundColor: p.primarySoft, alignItems: 'center', justifyContent: 'center' }, unread: { width: 9, height: 9, backgroundColor: p.coral, borderRadius: 9 },
  iconButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }, personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.line }, checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: p.line, alignItems: 'center', justifyContent: 'center' },
  room: { flex: 1, backgroundColor: p.bg }, roomHeader: { minHeight: 70, backgroundColor: p.paper, borderBottomWidth: 1, borderBottomColor: p.line, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 9 }, roomIdentity: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }, pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: p.primarySoft, paddingHorizontal: 20, paddingVertical: 12 },
  errorWrap: { padding: 10, gap: 4 }, messages: { paddingHorizontal: 16, paddingVertical: 14 }, dateSeparator: { fontSize: 11, color: p.muted, backgroundColor: p.surface, alignSelf: 'center', paddingHorizontal: 13, paddingVertical: 5, borderRadius: 20, overflow: 'hidden', marginVertical: 17 }, messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginVertical: 6 }, mineRow: { flexDirection: 'row-reverse' }, messageColumn: { maxWidth: '80%', gap: 4, alignItems: 'flex-start' }, author: { color: p.muted, fontSize: 12, marginBottom: 3 }, bubble: { backgroundColor: p.paper, borderWidth: 1, borderColor: p.line, borderRadius: 17, borderTopLeftRadius: 5, padding: 11, gap: 7, maxWidth: '100%' }, mineBubble: { backgroundColor: p.primarySoft, borderColor: '#CEDFD9', borderTopLeftRadius: 17, borderTopRightRadius: 5 }, highlighted: { borderWidth: 2, borderColor: p.coral, backgroundColor: '#F4DDD5' }, messageText: { fontSize: 15, lineHeight: 23, color: p.ink }, messagePhoto: { width: 205, height: 205, maxWidth: '100%', borderRadius: 11, backgroundColor: p.surface }, messageMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 3 }, readStatus: { color: p.primary, fontSize: 10 }, pinnedText: { color: p.primary, fontSize: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, paddingHorizontal: 10, paddingTop: 9, backgroundColor: p.paper, borderTopWidth: 1, borderTopColor: p.line }, messageInput: { flex: 1, fontSize: 15, lineHeight: 21, color: p.ink, minHeight: 44, maxHeight: 130, backgroundColor: p.bg, borderRadius: 18, paddingVertical: 11, paddingHorizontal: 14 }, photoPreview: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, backgroundColor: p.paper, borderTopWidth: 1, borderTopColor: p.line }, link: { color: p.primary, fontWeight: '600', fontSize: 13 },
  sheet: { flex: 1, backgroundColor: p.bg }, sheetHeader: { paddingHorizontal: 22, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { color: p.ink, fontSize: 20, fontWeight: '700' }, sheetBody: { padding: 22, gap: 16, paddingBottom: 40 }, collectionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: p.paper, borderWidth: 1, borderColor: p.line, borderRadius: 16, padding: 14 }, collectionThumbnail: { width: 57, height: 57, borderRadius: 10 }, mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, mediaTile: { width: '31.9%', aspectRatio: 1, borderRadius: 11, overflow: 'hidden', backgroundColor: p.surface }, viewer: { width: '100%', height: 360, backgroundColor: p.surface, borderRadius: 16 }, reasonList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
