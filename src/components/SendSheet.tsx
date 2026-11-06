import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { Check, Link2, Share as ShareIcon, UsersRound } from 'lucide-react-native'
import { useAuth } from '../hooks/useAuth'
import { useBlockedUsers } from '../hooks/useBlockedUsers'
import { usePeopleSearch } from '../hooks/usePeopleSearch'
import { getDirectChatPartnerIds } from '../lib/chatCandidates'
import { getOrCreateDirectChat, getOtherParticipant, sendChatMessage, subscribeToMyChats } from '../services/chatService'
import type { DaymarkChat } from '../types/chat'
import type { DaymarkUser } from '../types/user'
import { KeyboardPane } from './keyboard'
import { Text, TextInput } from './Typography'
import { Avatar, Button, Notice, SearchBox, p } from './ui'

type Target =
  | { key: string; kind: 'chat'; chat: DaymarkChat; name: string; photoURL?: string; group: boolean }
  | { key: string; kind: 'person'; user: DaymarkUser; name: string; photoURL?: string; group: false }

// Instagram-style "send" sheet: tap recent rooms or people you follow, add a note, send in-app.
// Link sharing stays available underneath for sending outside the app.
type SendSheetProps = {
  visible: boolean
  onClose: () => void
  /** Small card describing what is being sent. */
  preview: ReactNode
  /** The chat message to send; null while it is still being prepared. */
  message: string | null
  link: { url: string; text: string }
  /** Error that kept the message from being prepared. */
  prepare?: { error: string; retry: () => void }
}

// The body mounts on every open, so each share starts with an empty selection.
export function SendSheet(props: SendSheetProps) {
  return props.visible ? <SendSheetBody {...props} /> : null
}

function SendSheetBody({ visible, onClose, preview, message, link, prepare }: SendSheetProps) {
  const { currentUser, profile, accountReady } = useAuth()
  const uid = currentUser?.uid
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [chats, setChats] = useState<DaymarkChat[]>([])
  const [loadingChats, setLoadingChats] = useState(Boolean(currentUser?.uid && accountReady))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const people = usePeopleSearch(query, visible)
  const { ids: blockedIds } = useBlockedUsers()

  useEffect(() => {
    if (!uid || !accountReady) return
    return subscribeToMyChats(uid, next => { setChats(next); setLoadingChats(false) }, () => { setError('대화 목록을 불러오지 못했어요.'); setLoadingChats(false) })
  }, [uid, accountReady])

  const targets = useMemo<Target[]>(() => {
    if (!uid) return []
    const term = query.trim().toLowerCase()
    const fromChats: Target[] = chats.flatMap(chat => {
      const other = chat.kind === 'group' ? null : getOtherParticipant(chat, uid)
      if (other && blockedIds.has(other.uid)) return []
      const name = chat.kind === 'group' ? chat.name || '단체방' : other?.nickname || '대화'
      if (term && !name.toLowerCase().includes(term.replace(/^@/, ''))) return []
      return [{ key: `chat:${chat.id}`, kind: 'chat' as const, chat, name, photoURL: other?.photoURL, group: chat.kind === 'group' }]
    })
    const chatting = getDirectChatPartnerIds(chats, uid)
    const fromPeople: Target[] = people.people.filter(user => !chatting.has(user.uid))
      .map(user => ({ key: `person:${user.uid}`, kind: 'person' as const, user, name: user.nickname, photoURL: user.photoURL, group: false as const }))
    return [...fromChats, ...fromPeople]
  }, [chats, people.people, query, uid, blockedIds])

  const columns = width >= 560 ? 5 : 4
  const cell = Math.floor((Math.min(width, 640) - 32) / columns)

  function toggle(key: string) {
    setError('')
    setSelected(list => list.includes(key) ? list.filter(item => item !== key) : [...list, key])
  }

  async function send() {
    if (!profile || !uid || !message || !selected.length || lock.current) return
    lock.current = true; setBusy(true); setError('')
    const author = { uid, nickname: profile.nickname, photoURL: profile.photoURL }
    const chosen = targets.filter(target => selected.includes(target.key))
    let failed = 0
    for (const target of chosen) {
      try {
        const chatId = target.kind === 'chat' ? target.chat.id : await getOrCreateDirectChat(profile, target.user)
        await sendChatMessage(chatId, author, message)
        if (note.trim()) await sendChatMessage(chatId, author, note)
      } catch { failed += 1 }
    }
    lock.current = false; setBusy(false)
    if (failed) { setError(failed === chosen.length ? '보내지 못했어요. 다시 시도해 주세요.' : `${chosen.length - failed}곳에 보냈고 ${failed}곳은 보내지 못했어요.`); return }
    setSent(true)
    setTimeout(onClose, 700)
  }

  async function shareLink() {
    try { await Share.share({ message: `${link.text}\n${link.url}` }) } catch { setNotice('공유하지 못했어요. 다시 시도해 주세요.') }
  }

  const loading = loadingChats || people.loading
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!busy) onClose() }}>
    <KeyboardPane style={styles.pane}>
    <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} accessibilityRole="button" accessibilityLabel="닫기" onPress={() => { if (!busy) onClose() }} />
    <View style={[styles.sheet, { maxHeight: height * 0.86, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.handle} />
      <Text accessibilityRole="header" style={styles.title}>보내기</Text>
      <View style={styles.preview}>{preview}</View>
      <SearchBox accessibilityLabel="보낼 사람 검색" value={query} onChangeText={setQuery} editable={!busy} autoCapitalize="none" autoCorrect={false} placeholder="검색" />
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
        {targets.map(target => {
          const on = selected.includes(target.key)
          return <Pressable key={target.key} accessibilityRole="checkbox" accessibilityLabel={target.name} accessibilityState={{ checked: on, disabled: busy }} disabled={busy || sent}
            onPress={() => toggle(target.key)} style={[styles.cell, { width: cell }]}>
            <View style={[styles.avatarWrap, on && styles.avatarOn]}>
              {target.group ? <View style={styles.groupAvatar}><UsersRound size={26} color={p.ink} /></View> : <Avatar uri={target.photoURL} name={target.name} size={60} />}
              {on ? <View style={styles.badge}><Check size={13} strokeWidth={3} color={p.paper} /></View> : null}
            </View>
            <Text numberOfLines={2} style={[styles.name, on && { color: p.ink, fontWeight: '600' }]}>{target.name}</Text>
          </Pressable>
        })}
        {loading && !targets.length ? <ActivityIndicator color={p.primary} style={{ width: '100%', paddingVertical: 24 }} /> : null}
        {!loading && !targets.length ? <Text style={styles.empty}>{query.trim() ? '검색 결과가 없어요.' : '대화 상대가 없어요. 사람을 팔로우하거나 검색해 보세요.'}</Text> : null}
      </ScrollView>
      {prepare?.error ? <View style={{ gap: 8 }}><Notice error>{prepare.error}</Notice><Button title="다시 시도" variant="secondary" onPress={prepare.retry} /></View> : null}
      {error ? <Notice error>{error}</Notice> : null}
      {notice ? <Text style={styles.empty}>{notice}</Text> : null}
      {selected.length ? <View style={styles.footer}>
        <TextInput accessibilityLabel="함께 보낼 메시지" value={note} onChangeText={setNote} editable={!busy && !sent} maxLength={1000} placeholder="메시지 쓰기…" placeholderTextColor={p.muted} style={styles.note} />
        <Button title={sent ? '보냈어요' : busy ? '보내는 중…' : selected.length > 1 ? `${selected.length}곳에 보내기` : '보내기'} loading={busy}
          icon={sent ? <Check size={17} color={p.paper} /> : undefined} disabled={busy || sent || !message || !accountReady} onPress={() => void send()} />
      </View> : <View style={styles.actions}>
        <LinkAction icon={<Link2 size={22} color={p.ink} />} label="링크 복사" onPress={() => void Clipboard.setStringAsync(link.url).then(() => setNotice('링크를 복사했어요.'), () => setNotice('복사하지 못했어요.'))} />
        <LinkAction icon={<ShareIcon size={22} color={p.ink} />} label="다른 앱으로 공유" onPress={() => void shareLink()} />
      </View>}
    </View>
    </KeyboardPane>
  </Modal>
}

function LinkAction({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
    <View style={styles.actionIcon}>{icon}</View><Text style={styles.actionLabel}>{label}</Text>
  </Pressable>
}

const styles = StyleSheet.create({
  pane: { justifyContent: 'flex-end' },
  scrim: { backgroundColor: p.overlay },
  sheet: { width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: p.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 8, gap: 12, boxShadow: '0 -8px 32px #19211D1F' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: p.line },
  title: { textAlign: 'center', color: p.ink, fontSize: 16, fontWeight: '700' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 4 },
  cell: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  avatarWrap: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: p.transparent },
  avatarOn: { borderColor: p.primary },
  groupAvatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: p.oliveSoft },
  badge: { position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primary, borderWidth: 2, borderColor: p.paper },
  name: { color: p.muted, fontSize: 12, lineHeight: 16, textAlign: 'center', paddingHorizontal: 4 },
  empty: { width: '100%', color: p.muted, fontSize: 13.5, lineHeight: 21, textAlign: 'center', paddingVertical: 12 },
  footer: { gap: 10 },
  note: { minHeight: 44, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: p.surface, color: p.ink, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 20, paddingTop: 4, paddingBottom: 4 },
  action: { alignItems: 'center', gap: 6, width: 76 },
  actionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: p.surface },
  actionLabel: { color: p.ink, fontSize: 12, textAlign: 'center' },
})
