import { Fragment, useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { CornerDownRight, Trash2 } from 'lucide-react-native'
import { Avatar, Button, Empty, Notice, p } from './ui'
import { useAuth } from '../hooks/useAuth'
import { formatTimestamp } from '../lib/date'
import { getActiveMention, getMentionTokens, getMentionUsernames, insertMention, MAX_COMMENT_MENTIONS } from '../lib/commentMentions'
import { addComment, addReply, deleteComment, deleteReply, subscribeToComments } from '../services/commentService'
import { searchMentionUsers, type MentionUser } from '../services/mentionService'
import { COMMENT_MAX_LENGTH, type PostComment, type PostReply } from '../types/comment'
import type { Post } from '../types/post'

const message = (error: unknown) => error instanceof Error ? error.message : '댓글을 처리하지 못했습니다. 다시 시도해 주세요.'
type CommentThreadProps = { post: Post; commentId?: string; replyId?: string; onJump?: (target: View) => void; inputRef?: RefObject<TextInput | null> }

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
  const pending = useRef(false)
  const container = useRef<View>(null)
  const targets = useRef(new Map<string, View>())
  const didJump = useRef('')
  const targetId = replyId ? `reply-${replyId}` : commentId ? `comment-${commentId}` : ''
  const visible = comments.filter(comment => !comment.deleted || comment.replies.length > 0)
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
    if (getMentionUsernames(text).length > MAX_COMMENT_MENTIONS) { setError(`멘션은 댓글 하나에 최대 ${MAX_COMMENT_MENTIONS}명까지 할 수 있습니다.`); return }
    void run(async () => {
      if (parent) { await addReply(post.id, parent.id, actor(), text); setReplyContent(''); setReplyingTo('') }
      else { await addComment(post.id, actor(), text); setContent('') }
    })
  }
  function confirmDelete(comment: PostComment, reply?: PostReply) {
    Alert.alert(reply ? '답글 삭제' : '댓글 삭제', '이 내용을 삭제할까요?', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void run(() => reply ? deleteReply(post.id, comment.id, reply.id, actor().uid) : deleteComment(post.id, comment.id, actor().uid)) }])
  }
  const track = useCallback((id: string, node: View | null) => { if (node) targets.current.set(id, node); else targets.current.delete(id) }, [])
  return <View ref={container} collapsable={false} style={styles.thread}>
    <Text style={styles.heading}>댓글</Text>
    {!uid ? <><Empty title="이 장소에 이야기를 더해보세요" description="로그인하고 댓글과 답글을 확인할 수 있어요." /><Button title="로그인" onPress={() => router.push('/login')} /></> : <>
      {!loading && !loadError && !targetExists ? <Notice>알림의 댓글이 삭제되었거나 더 이상 표시되지 않습니다.</Notice> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={p.primary} /><Text style={styles.small}>댓글을 불러오는 중…</Text></View> : null}
      {loadError ? <View style={styles.stack}><Notice error>{loadError}</Notice><Button title="다시 시도" variant="secondary" onPress={() => setRevision(value => value + 1)} /></View> : null}
      {!loading && !loadError && !visible.length ? <Text style={styles.empty}>첫 댓글을 남겨보세요.</Text> : null}
      {!loadError && visible.map(comment => <View key={comment.id} ref={node => track(`comment-${comment.id}`, node)} collapsable={false} style={[styles.comment, targetId === `comment-${comment.id}` && styles.highlight]}>
        <View style={styles.row}>{comment.deleted ? <Text style={styles.small}>삭제된 댓글</Text> : <CommentAuthor author={comment} />}
          {!comment.deleted && (uid === comment.uid || uid === post.uid) ? <Pressable accessibilityRole="button" accessibilityLabel={`${comment.authorNickname}님의 댓글 삭제`} disabled={busy} onPress={() => confirmDelete(comment)} style={styles.iconButton}><Trash2 size={15} color={p.muted} /></Pressable> : null}
        </View>
        <Text style={styles.small}>{formatTimestamp(comment.createdAt)}</Text>
        {comment.deleted ? <Text style={styles.small}>삭제된 댓글입니다.</Text> : <CommentContent content={comment.content} mentions={comment.mentions} />}
        {!comment.deleted ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: replyingTo === comment.id }} disabled={busy} style={styles.replyButton} onPress={() => { setReplyingTo(replyingTo === comment.id ? '' : comment.id); setReplyContent(''); setError('') }}><CornerDownRight size={15} color={p.primary} /><Text style={styles.link}>{replyingTo === comment.id ? '답글 취소' : '답글 달기'}</Text></Pressable> : null}
        {comment.replies.map(reply => <View key={reply.id} ref={node => track(`reply-${reply.id}`, node)} collapsable={false} style={[styles.reply, targetId === `reply-${reply.id}` && styles.highlight]}>
          <View style={styles.row}><CornerDownRight size={15} color={p.muted} /><CommentAuthor author={reply} />{[reply.uid, post.uid, comment.uid].includes(uid || '') ? <Pressable accessibilityRole="button" accessibilityLabel={`${reply.authorNickname}님의 답글 삭제`} disabled={busy} onPress={() => confirmDelete(comment, reply)} style={styles.iconButton}><Trash2 size={15} color={p.muted} /></Pressable> : null}</View>
          <Text style={styles.small}>{formatTimestamp(reply.createdAt)}</Text><CommentContent content={reply.content} mentions={reply.mentions} />
        </View>)}
        {!comment.deleted && replyingTo === comment.id ? <View style={styles.composer}><Text style={styles.label}>{comment.authorNickname}님에게 답글</Text><MentionInput value={replyContent} onChange={setReplyContent} placeholder="답글을 입력하세요" disabled={busy} autoFocus /><Button title="답글 등록" loading={busy} disabled={!replyContent.trim()} onPress={() => submit(replyContent, comment)} /></View> : null}
      </View>)}
      <View style={styles.composer}><MentionInput inputRef={inputRef} value={content} onChange={setContent} placeholder="댓글을 남겨보세요" disabled={busy || !!loadError} /><Button title="댓글 등록" loading={busy} disabled={!content.trim() || !!loadError || !profile} onPress={() => submit(content)} /></View>
      {error ? <Notice error>{error}</Notice> : null}
    </>}
  </View>
}

function CommentAuthor({ author }: { author: PostComment | PostReply }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${author.authorNickname} 프로필`} style={styles.author} onPress={() => router.push(`/people/${encodeURIComponent(author.uid)}` as Href)}><Avatar name={author.authorNickname} uri={author.authorPhotoURL} size={28} /><Text style={styles.label}>{author.authorNickname}</Text></Pressable>
}

export function CommentContent({ content, mentions = {} }: { content: string; mentions?: Record<string, string> }) {
  const tokens = getMentionTokens(content)
  return <Text selectable style={styles.body}>{tokens.map((token, index) => {
    const prefix = content.slice(index ? tokens[index - 1].end : 0, token.start)
    const label = content.slice(token.start, token.end)
    const uid = Object.hasOwn(mentions, `@${token.username}`) ? mentions[`@${token.username}`] : ''
    return <Fragment key={token.start}>{prefix}{uid ? <Text accessibilityRole="link" style={styles.mention} onPress={() => router.push(`/people/${encodeURIComponent(uid)}` as Href)}>{label}</Text> : label}</Fragment>
  })}{content.slice(tokens.at(-1)?.end || 0)}</Text>
}

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
      void searchMentionUsers(queryText).then(users => { if (!cancelled) setSearch({ key: queryKey, users, loading: false, error: '' }) }).catch(() => { if (!cancelled) setSearch({ key: queryKey, users: [], loading: false, error: '사용자 검색을 불러오지 못했습니다.' }) })
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
  return <View style={styles.stack}>
    <TextInput ref={ref} accessibilityLabel={placeholder} value={value} multiline maxLength={COMMENT_MAX_LENGTH} editable={!disabled} autoFocus={autoFocus} autoCorrect={false} placeholder={placeholder} placeholderTextColor={p.muted} style={styles.input} textAlignVertical="top" onChangeText={text => { onChange(text); setDismissed('') }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onSelectionChange={event => setSelection(event.nativeEvent.selection)} />
    {open ? <View style={styles.suggestions}>{search.key !== queryKey || search.loading ? <Text style={styles.small}>사용자를 찾는 중…</Text> : search.error ? <Text style={styles.small}>{search.error}</Text> : !search.users.length ? <Text style={styles.small}>일치하는 사용자 이름이 없습니다.</Text> : search.users.map(user => <Pressable accessibilityRole="button" accessibilityLabel={`${user.nickname}, @${user.username} 멘션`} key={user.uid} onPressIn={() => choose(user)} style={styles.suggestion}><Avatar name={user.nickname} uri={user.photoURL} size={33} /><View style={styles.stackSmall}><Text style={styles.label}>{user.nickname}</Text><Text style={styles.small}>@{user.username}</Text></View></Pressable>)}</View> : null}
    <View style={styles.counter}><Text style={styles.small}>@사용자이름 · 최대 {MAX_COMMENT_MENTIONS}명</Text><Text style={styles.small}>{value.length.toLocaleString()} / {COMMENT_MAX_LENGTH.toLocaleString()}</Text></View>
  </View>
}

const styles = StyleSheet.create({
  thread: { gap: 17 }, heading: { color: p.ink, fontSize: 21, fontWeight: '700' }, stack: { gap: 10 }, stackSmall: { gap: 3 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, author: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }, label: { color: p.ink, fontSize: 14, fontWeight: '700' }, body: { color: p.ink, fontSize: 15, lineHeight: 24 }, small: { color: p.muted, fontSize: 11, lineHeight: 18 }, link: { color: p.primary, fontSize: 12, fontWeight: '600' }, mention: { color: p.primary, fontWeight: '700' },
  comment: { padding: 15, backgroundColor: p.paper, borderRadius: 18, borderWidth: 1, borderColor: p.line, gap: 9 }, reply: { borderLeftWidth: 2, borderColor: p.line, paddingLeft: 12, paddingVertical: 10, gap: 8, marginLeft: 7 }, highlight: { backgroundColor: '#E7EFDC', borderColor: p.primary }, replyButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, alignSelf: 'flex-start' }, iconButton: { padding: 7 }, composer: { gap: 12, paddingTop: 6 }, input: { borderWidth: 1, borderColor: p.line, borderRadius: 14, padding: 14, backgroundColor: p.paper, minHeight: 90, fontSize: 15, lineHeight: 23, color: p.ink },
  suggestions: { borderWidth: 1, borderColor: p.line, borderRadius: 14, padding: 13, gap: 10, backgroundColor: p.paper }, suggestion: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 }, counter: { flexDirection: 'row', justifyContent: 'space-between', gap: 7 }, empty: { color: p.muted, textAlign: 'center', paddingVertical: 20 }, loading: { alignItems: 'center', gap: 10, paddingVertical: 20 },
})
