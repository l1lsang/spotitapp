import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Typography';
import { RemoteImage } from './RemoteImage'
import { router, type Href } from 'expo-router'
import { CornerDownRight, SendHorizontal, Trash2, UserRound } from 'lucide-react-native'
import { Notice, p } from './ui'
import { ReportDialog } from './ReportButton'
import { BlockUserDialog } from './BlockUserDialog'
import { useBlockedUsers, withoutBlocked } from '../hooks/useBlockedUsers'
import type { BlockTarget } from '../services/blockService'
import { useAuth } from '../hooks/useAuth'
import { formatTimestamp } from '../lib/date'
import { getActiveMention, getMentionTokens, getMentionUsernames, insertMention, MAX_COMMENT_MENTIONS } from '../lib/commentMentions'
import { addComment, addReply, deleteComment, deleteReply, subscribeToComments } from '../services/commentService'
import { searchMentionUsers, type MentionUser } from '../services/mentionService'
import { COMMENT_MAX_LENGTH, type PostComment, type PostReply } from '../types/comment'
import type { ReportTarget } from '../types/moderation'
import type { Post } from '../types/post'

const message = (error: unknown) => error instanceof Error ? error.message : '댓글을 처리하지 못했습니다. 다시 시도해 주세요.'
type CommentThreadProps = { post: Post; commentId?: string; replyId?: string; onJump?: (target: View) => void; inputRef?: RefObject<TextInput | null> }

// Comments are a quiet list: spacing separates items, no cards or rules.
export function CommentThread({ post, commentId, replyId, onJump, inputRef }: CommentThreadProps) {
  const { currentUser, profile, firebaseReady } = useAuth()
  const uid = currentUser?.uid
  const [comments, setComments] = useState<PostComment[]>([])
  const [content, setContent] = useState('')
  const [replyingTo, setReplyingTo] = useState('')
  const [replyContent, setReplyContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [report, setReport] = useState<ReportTarget | null>(null)
  const [block, setBlock] = useState<BlockTarget | null>(null)
  const { ids: blockedIds } = useBlockedUsers()
  const pending = useRef(false)
  const container = useRef<View>(null)
  const targets = useRef(new Map<string, View>())
  const didJump = useRef('')
  const targetId = replyId ? `reply-${replyId}` : commentId ? `comment-${commentId}` : ''
  // Blocked members' comments and replies are hidden; a blocked author's comment
  // with others' replies stays as a placeholder so the thread keeps its shape.
  const visible = comments.map(comment => ({ ...comment, replies: withoutBlocked(comment.replies, blockedIds), blocked: blockedIds.has(comment.uid) }))
    .filter(comment => (!comment.deleted && !comment.blocked) || comment.replies.length > 0)
  const targetExists = targetId ? visible.some(comment => targetId === `comment-${comment.id}` || comment.replies.some(reply => targetId === `reply-${reply.id}`)) : true

  useEffect(() => {
    setLoading(true); setLoadError(''); setComments([])
    if (!uid || !firebaseReady) { setLoading(false); return }
    try {
      return subscribeToComments(post.id, next => { setComments(next); setLoading(false) }, e => { setComments([]); setLoading(false); setLoadError(message(e)) })
    } catch (e) { setLoading(false); setLoadError(message(e)) }
  }, [post.id, uid, firebaseReady, revision])
  useEffect(() => {
    if (loading || loadError || !targetId || !onJump) return
    const key = `${post.id}-${targetId}`
    if (didJump.current === key) return
    const frame = requestAnimationFrame(() => {
      const target = targets.current.get(targetId) || container.current
      if (target) { didJump.current = key; onJump(target) }
    })
    return () => cancelAnimationFrame(frame)
  }, [comments, loadError, loading, onJump, post.id, targetId])

  function actor() {
    if (!currentUser || !profile) throw new Error('로그인 후 댓글을 남길 수 있습니다.')
    return { uid: currentUser.uid, nickname: profile.nickname, photoURL: profile.photoURL }
  }
  async function run(action: () => Promise<void>) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { await action() } catch (e) { setError(message(e)) } finally { pending.current = false; setBusy(false) }
  }
  function submit(text: string, parent?: PostComment) {
    if (!text.trim()) return
    if (getMentionUsernames(text).length > MAX_COMMENT_MENTIONS) { setError(`멘션은 ${parent ? '답글' : '댓글'} 하나에 최대 ${MAX_COMMENT_MENTIONS}명까지 할 수 있습니다.`); return }
    void run(async () => {
      if (parent) { await addReply(post.id, parent.id, actor(), text); setReplyContent(''); setReplyingTo('') }
      else { await addComment(post.id, actor(), text); setContent('') }
    })
  }
  function confirmDelete(comment: PostComment, reply?: PostReply) {
    Alert.alert(reply ? '답글 삭제' : '댓글 삭제', '이 내용을 삭제할까요?', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void run(() => reply ? deleteReply(post.id, comment.id, reply.id, actor().uid) : deleteComment(post.id, comment.id, actor().uid)) }])
  }
  const reportable = (author: PostComment | PostReply) => !!uid && author.uid !== uid
  // Long press offers a report of the comment itself or of its author.
  function openReportMenu(comment: PostComment, reply?: PostReply) {
    const author = reply || comment
    const noun = reply ? '답글' : '댓글'
    const target: ReportTarget = { kind: 'comment', targetId: post.id, messageId: comment.id, ...(reply ? { replyId: reply.id } : {}), label: `${author.authorNickname}님의 ${noun}` }
    if (Platform.OS === 'web') { setReport(target); return }
    Alert.alert(`${author.authorNickname}님의 ${noun}`, undefined, [
      { text: `${noun} 신고`, style: 'destructive', onPress: () => setReport(target) },
      { text: '작성자 신고', onPress: () => setReport({ kind: 'user', targetId: author.uid, label: author.authorNickname }) },
      { text: '작성자 차단', style: 'destructive', onPress: () => setBlock({ uid: author.uid, nickname: author.authorNickname, photoURL: author.authorPhotoURL }) },
      { text: '취소', style: 'cancel' },
    ])
  }
  const track = useCallback((id: string, node: View | null) => { if (node) targets.current.set(id, node); else targets.current.delete(id) }, [])
  return <View ref={container} collapsable={false} style={styles.thread} accessibilityLabel="댓글과 답글">
    <Text accessibilityRole="header" style={styles.heading}>댓글</Text>
    {!uid ? <View style={styles.guest}><Text style={styles.status}>로그인 후 댓글을 남길 수 있습니다.</Text><TextAction label="로그인" tone="primary" onPress={() => router.push('/login')} /></View> : <>
      {!loading && !loadError && !targetExists ? <Text style={styles.status}>알림의 댓글이 삭제되었거나 더 이상 표시되지 않습니다.</Text> : null}
      {loading ? <Text style={styles.status}>댓글을 불러오는 중입니다.</Text> : null}
      {loadError ? <View style={styles.stack}><Notice error>{loadError}</Notice><TextAction label="다시 시도" onPress={() => setRevision(value => value + 1)} /></View> : null}
      {!loading && !loadError && !visible.length ? <Text style={styles.status}>첫 댓글을 남겨보세요.</Text> : null}
      {!loadError && visible.map(comment => {
        const replying = !comment.deleted && replyingTo === comment.id
        return <View key={comment.id} ref={node => track(`comment-${comment.id}`, node)} collapsable={false} style={styles.comment}>
          <View style={styles.meta}>
            {comment.blocked && !comment.deleted ? <Text style={styles.deleted}>차단한 사용자</Text> : comment.deleted ? <Text style={styles.deleted}>삭제된 댓글</Text> : <CommentAuthor author={comment} highlighted={targetId === `comment-${comment.id}`} />}
            <Text style={styles.time}>{formatTimestamp(comment.createdAt)}</Text>
            {!comment.deleted && !comment.blocked && (uid === comment.uid || uid === post.uid) ? <DeleteButton label={`${comment.authorNickname}님의 댓글 삭제`} disabled={busy} onPress={() => confirmDelete(comment)} /> : null}
          </View>
          {comment.blocked && !comment.deleted ? <Text style={[styles.body, styles.deleted]}>차단한 사용자의 댓글입니다.</Text> : comment.deleted ? <Text style={[styles.body, styles.deleted]}>삭제된 댓글입니다.</Text> : <LongPressReport enabled={reportable(comment)} onReport={() => openReportMenu(comment)}><CommentContent content={comment.content} mentions={comment.mentions} selectable={!reportable(comment)} /></LongPressReport>}
          {!comment.deleted && !comment.blocked ? <TextAction label={replying ? '답글 취소' : '답글 달기'} icon={<CornerDownRight size={14} color={p.muted} />} disabled={busy} expanded={replying} onPress={() => { setReplyingTo(replying ? '' : comment.id); setReplyContent(''); setError('') }} /> : null}
          {comment.replies.length > 0 && <View style={styles.replies}>{comment.replies.map(reply => <View key={reply.id} ref={node => track(`reply-${reply.id}`, node)} collapsable={false} style={styles.reply}>
            <View style={styles.indent}><CornerDownRight size={16} color={p.muted} /></View>
            <View style={styles.main}>
              <View style={styles.meta}><CommentAuthor author={reply} highlighted={targetId === `reply-${reply.id}`} /><Text style={styles.time}>{formatTimestamp(reply.createdAt)}</Text>
                {[reply.uid, post.uid, comment.uid].includes(uid || '') ? <DeleteButton label={`${reply.authorNickname}님의 답글 삭제`} disabled={busy} onPress={() => confirmDelete(comment, reply)} /> : null}</View>
              <LongPressReport enabled={reportable(reply)} onReport={() => openReportMenu(comment, reply)}><CommentContent content={reply.content} mentions={reply.mentions} selectable={!reportable(reply)} /></LongPressReport>
            </View>
          </View>)}</View>}
          {replying ? <View style={styles.replyForm}><Text style={styles.replyLabel}>{comment.authorNickname}님에게 답글</Text>
            <MentionInput value={replyContent} onChange={setReplyContent} placeholder="답글을 입력하세요" disabled={busy} autoFocus />
            <ComposeActions length={replyContent.length} label={busy ? '등록 중…' : '답글 등록'} disabled={busy || !replyContent.trim()} onPress={() => submit(replyContent, comment)} /></View> : null}
        </View>
      })}
      <View style={styles.form}>
        <MentionInput inputRef={inputRef} value={content} onChange={setContent} placeholder="댓글을 남겨보세요" disabled={busy || !!loadError} />
        <ComposeActions length={content.length} label={busy ? '등록 중…' : '댓글 등록'} disabled={busy || !content.trim() || !!loadError || !profile} onPress={() => submit(content)} />
      </View>
      {error ? <Notice error>{error}</Notice> : null}
    </>}
    {report && <ReportDialog target={report} onClose={() => setReport(null)} />}
    {block && <BlockUserDialog target={block} onClose={() => setBlock(null)} />}
  </View>
}

function TextAction({ label, onPress, icon, disabled = false, expanded, tone = 'muted' }: { label: string; onPress: () => void; icon?: ReactNode; disabled?: boolean; expanded?: boolean; tone?: 'muted' | 'primary' }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, expanded }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.textAction, (disabled || pressed) && { opacity: disabled ? 0.5 : 0.6 }]}>
    {icon}<Text style={[styles.textActionLabel, tone === 'primary' && { color: p.primary }]}>{label}</Text>
  </Pressable>
}
// Selection is off for these texts: on iOS it would swallow the long press.
function LongPressReport({ enabled, onReport, children }: { enabled: boolean; onReport: () => void; children: ReactNode }) {
  if (!enabled) return <>{children}</>
  return <Pressable accessibilityHint="길게 누르면 신고할 수 있어요" accessibilityActions={[{ name: 'longpress', label: '신고' }]}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress') onReport() }} onLongPress={onReport} delayLongPress={380}
    style={({ pressed }) => pressed && { opacity: 0.6 }}>{children}</Pressable>
}
function DeleteButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.delete, (disabled || pressed) && { opacity: 0.5 }]}><Trash2 size={15} color={p.muted} /></Pressable>
}
function ComposeActions({ length, label, disabled, onPress }: { length: number; label: string; disabled: boolean; onPress: () => void }) {
  return <View style={styles.composeActions}>
    <Text style={styles.counter}>{length.toLocaleString()} / {COMMENT_MAX_LENGTH.toLocaleString()}</Text>
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.submit, (disabled || pressed) && { opacity: disabled ? 0.5 : 0.6 }]}><SendHorizontal size={16} color={p.primary} /><Text style={styles.submitLabel}>{label}</Text></Pressable>
  </View>
}
function CommentAvatar({ uri }: { uri?: string }) {
  return uri ? <RemoteImage uri={uri} style={styles.avatar} /> : <View style={styles.avatar}><UserRound size={17} color={p.muted} /></View>
}
function CommentAuthor({ author, highlighted = false }: { author: PostComment | PostReply; highlighted?: boolean }) {
  return <Pressable accessibilityRole="link" accessibilityLabel={`${author.authorNickname} 프로필`} style={styles.author} onPress={() => router.push(`/people/${encodeURIComponent(author.uid)}` as Href)}><CommentAvatar uri={author.authorPhotoURL} /><Text style={[styles.name, highlighted && styles.target]}>{author.authorNickname}</Text></Pressable>
}

export function CommentContent({ content, mentions = {}, selectable = true }: { content: string; mentions?: Record<string, string>; selectable?: boolean }) {
  const tokens = getMentionTokens(content)
  return <Text selectable={selectable} style={styles.body}>{tokens.map((token, index) => {
    const prefix = content.slice(index ? tokens[index - 1].end : 0, token.start)
    const label = content.slice(token.start, token.end)
    const uid = Object.hasOwn(mentions, `@${token.username}`) ? mentions[`@${token.username}`] : ''
    return <Fragment key={token.start}>{prefix}{uid ? <Text accessibilityRole="link" style={styles.mention} onPress={() => router.push(`/people/${encodeURIComponent(uid)}` as Href)}>{label}</Text> : label}</Fragment>
  })}{content.slice(tokens.at(-1)?.end || 0)}</Text>
}

// Underlined composer: no box, the rule turns teal while typing.
export function MentionInput({ value, onChange, placeholder, disabled, autoFocus, inputRef }: { value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean; autoFocus?: boolean; inputRef?: RefObject<TextInput | null> }) {
  const ownRef = useRef<TextInput>(null)
  const ref = inputRef || ownRef
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState('')
  const [search, setSearch] = useState<{ key: string; users: MentionUser[]; loading: boolean; error: string }>({ key: '', users: [], loading: false, error: '' })
  const active = focused && !disabled && selection.start === selection.end ? getActiveMention(value, Math.min(selection.start, value.length)) : null
  const queryKey = active ? `${active.start}:${active.query}` : ''
  const queryText = active?.query || ''
  const open = !!active && queryKey !== dismissed
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSearch({ key: queryKey, users: [], loading: true, error: '' })
    const timer = setTimeout(() => {
      void searchMentionUsers(queryText).then(users => { if (!cancelled) setSearch({ key: queryKey, users, loading: false, error: '' }) }).catch(() => { if (!cancelled) setSearch({ key: queryKey, users: [], loading: false, error: '사용자 검색을 불러오지 못했습니다. 잠시 후 다시 입력해 주세요.' }) })
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, queryKey, queryText])
  function choose(user: MentionUser) {
    if (!active) return
    const next = insertMention(value, active, user.username)
    if (next.content.length > COMMENT_MAX_LENGTH) return
    onChange(next.content); setSelection({ start: next.cursor, end: next.cursor }); setDismissed(queryKey)
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setNativeProps({ selection: { start: next.cursor, end: next.cursor } }) })
  }
  return <View style={styles.composer}>
    <TextInput ref={ref} accessibilityLabel={placeholder} value={value} multiline maxLength={COMMENT_MAX_LENGTH} editable={!disabled} autoFocus={autoFocus} autoCorrect={false} placeholder={placeholder} placeholderTextColor={p.light} style={[styles.input, focused ? styles.inputFocused : null, disabled && { opacity: 0.6 }]} textAlignVertical="top" onChangeText={text => { onChange(text); setDismissed('') }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onSelectionChange={event => setSelection(event.nativeEvent.selection)} />
    {open ? <View style={styles.suggestions}>{search.key !== queryKey || search.loading ? <Text style={styles.status}>사용자를 찾는 중…</Text> : search.error ? <Text style={styles.status}>{search.error}</Text> : !search.users.length ? <Text style={styles.status}>일치하는 사용자 이름이 없습니다.</Text> : search.users.map(user => <Pressable accessibilityRole="button" accessibilityLabel={`${user.nickname}, @${user.username} 멘션`} key={user.uid} onPressIn={() => choose(user)} style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: p.surface }]}>{user.photoURL ? <RemoteImage uri={user.photoURL} style={styles.avatar} /> : <View style={styles.avatar}><Text style={styles.at}>@</Text></View>}<View style={styles.suggestionText}><Text style={styles.suggestionName}>{user.nickname}</Text><Text style={styles.suggestionHandle}>@{user.username}</Text></View></Pressable>)}</View> : null}
    <Text style={styles.hint}>@사용자이름으로 멘션 · 최대 {MAX_COMMENT_MENTIONS}명</Text>
  </View>
}

const styles = StyleSheet.create({
  thread: { minWidth: 0 }, heading: { color: p.ink, fontSize: 16.8, fontWeight: '600', marginBottom: 10 }, stack: { gap: 6 }, main: { flex: 1, minWidth: 0 },
  guest: { gap: 4 }, status: { color: p.muted, fontSize: 13.8, lineHeight: 22, paddingVertical: 12 },
  comment: { paddingVertical: 16 }, meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, columnGap: 10, minWidth: 0 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%', minHeight: 32 }, name: { color: p.ink, fontSize: 14, fontWeight: '600', flexShrink: 1 }, target: { color: p.primary, textDecorationLine: 'underline' },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: p.surface }, at: { color: p.muted, fontSize: 13 },
  time: { color: p.muted, fontSize: 11.7 }, delete: { marginLeft: 'auto', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  body: { marginTop: 8, color: p.ink, fontSize: 14, lineHeight: 23.8 }, deleted: { color: p.muted, fontSize: 13.4 }, mention: { color: p.primary, fontWeight: '600', textDecorationLine: 'underline' },
  textAction: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, minHeight: 36, marginTop: 4 }, textActionLabel: { color: p.muted, fontSize: 13, fontWeight: '600' },
  replies: { marginTop: 4, paddingLeft: 20 }, reply: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 14 }, indent: { marginTop: 7 },
  replyForm: { gap: 4, marginTop: 16, marginLeft: 20 }, replyLabel: { color: p.primary, fontSize: 12.5 }, form: { gap: 4, marginTop: 16 },
  composer: { gap: 4 }, input: { minHeight: 68, paddingVertical: 10, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: p.line, marginBottom: 1, color: p.ink, fontSize: 14, lineHeight: 22.4 },
  inputFocused: { borderBottomWidth: 2, borderBottomColor: p.primary, marginBottom: 0 },
  suggestions: { marginVertical: 6, borderBottomWidth: 1, borderBottomColor: p.line }, suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 6, paddingHorizontal: 8 },
  suggestionText: { flex: 1, minWidth: 0, gap: 3 }, suggestionName: { color: p.ink, fontSize: 13, fontWeight: '600' }, suggestionHandle: { color: p.muted, fontSize: 12 },
  hint: { color: p.muted, fontSize: 11.5 },
  composeActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, counter: { color: p.muted, fontSize: 11.2 },
  submit: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }, submitLabel: { color: p.primary, fontSize: 13, fontWeight: '600' },
})
