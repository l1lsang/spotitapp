import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Text } from './Typography';
import { router } from 'expo-router'
import { Check, MessageCircle, Send } from 'lucide-react-native'
import { useAuth } from '../hooks/useAuth'
import { createPinShareMessage } from '../lib/chatPinShare'
import { getOtherParticipant, sendChatMessage, subscribeToMyChats } from '../services/chatService'
import type { DaymarkChat } from '../types/chat'
import type { Post } from '../types/post'
import { Dialog } from './Dialog'
import { Button, Empty, Notice, SearchBox, p, s } from './ui'

export function SharePinButton({ post }: { post: Post }) {
  const { currentUser, profile, accountReady } = useAuth()
  const uid = currentUser?.uid
  const [open, setOpen] = useState(false)
  const [chats, setChats] = useState<DaymarkChat[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const selected = chats.find(chat => chat.id === selectedId)
  const chatName = (chat: DaymarkChat) => chat.kind === 'group' ? chat.name || '단체방' : getOtherParticipant(chat, uid || '')?.nickname || '채팅방'

  useEffect(() => {
    if (!open || !uid || !accountReady) return
    let active = true
    setLoading(true); setError(''); setChats([])
    const stop = subscribeToMyChats(uid, next => {
      if (active) { setChats(next.filter(chat => chat.participantIds.includes(uid))); setLoading(false) }
    }, () => { if (active) { setError('채팅방 목록을 불러오지 못했습니다. 다시 시도해 주세요.'); setLoading(false) } })
    return () => { active = false; stop() }
  }, [open, uid, accountReady, revision])
  useEffect(() => { setOpen(false); setSelectedId(''); setQuery(''); setError('') }, [post.id, uid])

  async function send() {
    if (!uid || !profile || !accountReady || !selected || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      await sendChatMessage(selected.id, { uid, nickname: profile.nickname, photoURL: profile.photoURL }, createPinShareMessage(post))
      setOpen(false)
      router.push({ pathname: '/chats/[chatId]', params: { chatId: selected.id } })
    } catch (e) { setError(e instanceof Error ? e.message : '핀을 보내지 못했습니다. 다시 시도해 주세요.') }
    finally { lock.current = false; setBusy(false) }
  }

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="핀을 채팅으로 공유" style={({ pressed }) => [s.row, { minHeight: 44, gap: 7, paddingVertical: 4, opacity: pressed ? 0.6 : 1 }]} onPress={() => {
      if (!uid) { router.push('/login'); return }
      setSelectedId(''); setQuery(''); setError(''); setOpen(true)
    }}><MessageCircle size={19} color={p.primary} /><Text style={{ color: p.primary, fontSize: 13.76 }}>채팅 공유</Text></Pressable>
    <Dialog visible={open} title="핀을 채팅으로 공유" onClose={() => setOpen(false)} busy={busy}>
      <View style={{ gap: 6 }}><Text style={{ color: p.ink, fontSize: 16, fontWeight: '600' }}>{post.title}</Text><Text style={{ color: p.muted }}>{post.placeName}</Text></View>
      {post.visibility !== 'public' && <Notice>핀의 제목·장소명·링크를 보냅니다. 상세 기록은 원래 공개 범위에 따라 볼 수 있습니다.</Notice>}
      {!accountReady && <Notice>계정 정보를 확인한 뒤 다시 시도해 주세요.</Notice>}
      <SearchBox accessibilityLabel="채팅방 검색" value={query} onChangeText={setQuery} editable={!busy} placeholder="이름으로 채팅방 찾기" />
      {loading && <ActivityIndicator color={p.primary} />}
      {chats.filter(chat => chatName(chat).toLowerCase().includes(query.trim().toLowerCase())).map(chat => <Pressable key={chat.id}
        accessibilityRole="radio" accessibilityLabel={chatName(chat)} accessibilityState={{ checked: selectedId === chat.id, disabled: busy }} disabled={busy}
        onPress={() => setSelectedId(chat.id)} style={({ pressed }) => [s.between, { minHeight: 56, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6, backgroundColor: selectedId === chat.id || pressed ? p.surface : p.transparent }]}>
        <View style={{ flex: 1, gap: 4 }}><Text style={{ color: selectedId === chat.id ? p.primary : p.ink, fontWeight: '600' }}>{chatName(chat)}</Text><Text style={{ color: p.muted, fontSize: 12 }}>{chat.kind === 'group' ? `${chat.participantIds.length}명 · 단체방` : '1:1 채팅'}</Text></View>
        {selectedId === chat.id && <Check size={19} color={p.primary} />}
      </Pressable>)}
      {!loading && !chats.length && !error && accountReady && <Empty title="공유할 채팅방이 없습니다." description="사람 찾기에서 대화를 시작한 뒤 핀을 공유해 주세요." />}
      {!loading && !!chats.length && !chats.some(chat => chatName(chat).toLowerCase().includes(query.trim().toLowerCase())) && <Notice>검색한 채팅방이 없습니다.</Notice>}
      {!!error && <><Notice error>{error}</Notice><Button title="목록 다시 불러오기" variant="secondary" disabled={busy} onPress={() => setRevision(value => value + 1)} /></>}
      <Button title={busy ? '보내는 중…' : '선택한 채팅방에 보내기'} icon={<Send size={18} color={p.paper} />} disabled={busy || loading || !selected || !accountReady} onPress={() => void send()} />
    </Dialog>
  </>
}
