import {
  collection, doc, getDocFromServer, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp,
  type DocumentData, type QueryDocumentSnapshot, type Unsubscribe, type Transaction,
} from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import { COMMENT_MAX_LENGTH, type PostComment, type PostReply } from '../types/comment'
import type { NotificationActor } from '../types/notification'
import type { Post } from '../types/post'
import { queueNotification } from './notificationService'
import { resolveCommentMentions, type MentionUser } from './mentionService'

function queueMentionNotifications(transaction: Transaction, recipients: MentionUser[], author: NotificationActor,
  target: { postId: string; commentId: string; replyId?: string }) {
  recipients.forEach(user => queueNotification(transaction, {
    ...target, recipientUid: user.uid, actor: author, type: 'mention', title: '새 멘션', mentionUsername: user.username,
    message: `${author.nickname}님이 ${target.replyId ? '답글' : '댓글'}에서 나를 멘션했습니다.`,
    href: `/posts/${target.postId}#${target.replyId ? `reply-${target.replyId}` : `comment-${target.commentId}`}`,
  }))
}

function toComment(snapshot: QueryDocumentSnapshot<DocumentData>): PostComment {
  const data = snapshot.data() as Omit<PostComment, 'id' | 'replies'>
  return { ...data, id: snapshot.id, replyCount: data.replyCount || 0, replies: [] }
}

function toReply(snapshot: QueryDocumentSnapshot<DocumentData>, commentId: string): PostReply {
  return { ...snapshot.data(), id: snapshot.id, commentId } as PostReply
}

function checkedContent(content: string) {
  const trimmed = content.trim()
  if (!trimmed || trimmed.length > COMMENT_MAX_LENGTH) throw new Error(`댓글은 1~${COMMENT_MAX_LENGTH}자로 입력해 주세요.`)
  return trimmed
}

export async function listComments(postId: string): Promise<PostComment[]> {
  const snapshot = await getDocs(query(collection(requireDb(), 'posts', postId, 'comments'), orderBy('createdAt', 'asc')))
  return Promise.all(snapshot.docs.map(async commentDoc => {
    if (commentDoc.data().replyCount === 0) return toComment(commentDoc)
    const replies = await getDocs(query(collection(commentDoc.ref, 'replies'), orderBy('createdAt', 'asc')))
    return { ...toComment(commentDoc), replies: replies.docs.map(reply => toReply(reply, commentDoc.id)) }
  }))
}

// Reply listeners exist only while the thread is visible and stop with their parent.
export function subscribeToComments(postId: string, onChange: (comments: PostComment[]) => void, onError: (error: Error) => void): Unsubscribe {
  const db = requireDb()
  let comments: PostComment[] = []
  let active = true
  const replies = new Map<string, PostReply[]>()
  const subscriptions = new Map<string, Unsubscribe>()
  const emit = () => {
    if (active && comments.every(comment => replies.has(comment.id))) {
      onChange(comments.map(comment => ({ ...comment, replies: replies.get(comment.id) || [] })))
    }
  }
  const fail = (error: Error) => { if (active) onError(error) }
  const stop = onSnapshot(query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc')), snapshot => {
    if (!active) return
    comments = snapshot.docs.map(toComment)
    const commentIds = new Set(comments.map(comment => comment.id))
    replies.forEach((_items, id) => { if (!commentIds.has(id)) replies.delete(id) })
    const ids = new Set(snapshot.docs.filter(item => item.data().replyCount !== 0).map(item => item.id))
    subscriptions.forEach((unsubscribe, id) => {
      if (!ids.has(id)) { unsubscribe(); subscriptions.delete(id); replies.delete(id) }
    })
    comments.forEach(comment => {
      if (!ids.has(comment.id)) { replies.set(comment.id, []); return }
      if (subscriptions.has(comment.id)) return
      subscriptions.set(comment.id, onSnapshot(
        query(collection(db, 'posts', postId, 'comments', comment.id, 'replies'), orderBy('createdAt', 'asc')),
        replySnapshot => {
          if (!active || !subscriptions.has(comment.id)) return
          replies.set(comment.id, replySnapshot.docs.map(reply => toReply(reply, comment.id)))
          emit()
        }, fail,
      ))
    })
    emit()
  }, fail)
  return () => { active = false; stop(); subscriptions.forEach(unsubscribe => unsubscribe()); subscriptions.clear() }
}

export async function addComment(postId: string, author: NotificationActor, content: string): Promise<void> {
  const trimmed = checkedContent(content)
  const db = requireDb()
  const postRef = doc(db, 'posts', postId)
  const commentRef = doc(collection(postRef, 'comments'))
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(postRef)
    if (!snapshot.exists()) throw new Error('삭제되었거나 볼 수 없는 기록입니다.')
    const post = snapshot.data() as Post
    const { mentions, recipients } = await resolveCommentMentions(transaction, trimmed, post, author.uid)
    transaction.set(commentRef, {
      id: commentRef.id, uid: author.uid, authorNickname: author.nickname, authorPhotoURL: author.photoURL || '',
      content: trimmed, mentions, replyCount: 0, createdAt: serverTimestamp(),
    })
    transaction.update(postRef, { commentCount: (post.commentCount || 0) + 1, updatedAt: serverTimestamp() })
    queueMentionNotifications(transaction, recipients, author, { postId, commentId: commentRef.id })
    if (!recipients.some(user => user.uid === post.uid)) queueNotification(transaction, {
      recipientUid: post.uid, actor: author, type: 'comment', title: '새 댓글',
      message: `${author.nickname}님이 "${post.title}"에 댓글을 남겼습니다.`,
      href: `/posts/${postId}#comment-${commentRef.id}`, postId, commentId: commentRef.id,
    })
  })
}

export async function addReply(postId: string, commentId: string, author: NotificationActor, content: string): Promise<void> {
  const trimmed = checkedContent(content)
  const db = requireDb()
  const postRef = doc(db, 'posts', postId)
  const commentRef = doc(collection(postRef, 'comments'), commentId)
  const replyRef = doc(collection(commentRef, 'replies'))
  await runTransaction(db, async transaction => {
    const postSnapshot = await transaction.get(postRef)
    if (!postSnapshot.exists()) throw new Error('삭제되었거나 볼 수 없는 기록입니다.')
    const commentSnapshot = await transaction.get(commentRef)
    if (!commentSnapshot.exists() || commentSnapshot.data().deleted) throw new Error('삭제된 댓글에는 답글을 남길 수 없습니다.')
    const post = postSnapshot.data() as Post
    const comment = commentSnapshot.data()
    const { mentions, recipients } = await resolveCommentMentions(transaction, trimmed, post, author.uid)
    transaction.set(replyRef, {
      id: replyRef.id, commentId, uid: author.uid, authorNickname: author.nickname, authorPhotoURL: author.photoURL || '',
      content: trimmed, mentions, createdAt: serverTimestamp(),
    })
    transaction.update(commentRef, { replyCount: (comment.replyCount || 0) + 1 })
    transaction.update(postRef, { commentCount: (post.commentCount || 0) + 1, updatedAt: serverTimestamp() })
    queueMentionNotifications(transaction, recipients, author, { postId, commentId, replyId: replyRef.id })
    const normalRecipients = new Set<string>([comment.uid, post.uid])
    recipients.forEach(user => normalRecipients.delete(user.uid))
    normalRecipients.forEach(recipientUid => queueNotification(transaction, {
      recipientUid, actor: author, type: 'reply', title: recipientUid === comment.uid ? '내 댓글에 답글' : '새 답글',
      message: recipientUid === comment.uid ? `${author.nickname}님이 내 댓글에 답글을 남겼습니다.`
        : `${author.nickname}님이 "${post.title}"에 답글을 남겼습니다.`,
      href: `/posts/${postId}#reply-${replyRef.id}`, postId, commentId, replyId: replyRef.id,
    }))
  })
}

export async function deleteComment(postId: string, commentId: string, requesterUid: string): Promise<void> {
  const db = requireDb()
  const postRef = doc(db, 'posts', postId)
  const commentRef = doc(collection(postRef, 'comments'), commentId)
  await runTransaction(db, async transaction => {
    const postSnapshot = await transaction.get(postRef)
    const commentSnapshot = await transaction.get(commentRef)
    if (!postSnapshot.exists() || !commentSnapshot.exists() || commentSnapshot.data().deleted) return
    const comment = commentSnapshot.data()
    const post = postSnapshot.data()
    if (comment.uid !== requesterUid && post.uid !== requesterUid) throw new Error('댓글 작성자 또는 글 작성자만 삭제할 수 있습니다.')
    // Retain existing replies and serialize against concurrent additions/deletions.
    if (comment.replyCount > 0) transaction.update(commentRef, { content: '', deleted: true })
    else transaction.delete(commentRef)
    transaction.update(postRef, { commentCount: Math.max(0, (post.commentCount || 0) - 1), updatedAt: serverTimestamp() })
  }).catch(async error => {
    if (error.code !== 'permission-denied') throw error
    // Rules may see a concurrent deletion before transaction preconditions are checked.
    const latest = await getDocFromServer(commentRef)
    if (latest.exists() && !latest.data().deleted) throw error
  })
}

export async function deleteReply(postId: string, commentId: string, replyId: string, requesterUid: string): Promise<void> {
  const db = requireDb()
  const postRef = doc(db, 'posts', postId)
  const commentRef = doc(collection(postRef, 'comments'), commentId)
  const replyRef = doc(collection(commentRef, 'replies'), replyId)
  await runTransaction(db, async transaction => {
    const postSnapshot = await transaction.get(postRef)
    const commentSnapshot = await transaction.get(commentRef)
    const replySnapshot = await transaction.get(replyRef)
    if (!postSnapshot.exists() || !commentSnapshot.exists() || !replySnapshot.exists()) return
    const post = postSnapshot.data()
    const comment = commentSnapshot.data()
    if (![replySnapshot.data().uid, post.uid, comment.uid].includes(requesterUid)) throw new Error('답글을 삭제할 권한이 없습니다.')
    transaction.delete(replyRef)
    transaction.update(commentRef, { replyCount: Math.max(0, (comment.replyCount || 0) - 1) })
    transaction.update(postRef, { commentCount: Math.max(0, (post.commentCount || 0) - 1), updatedAt: serverTimestamp() })
  }).catch(async error => {
    if (error.code !== 'permission-denied') throw error
    if ((await getDocFromServer(replyRef)).exists()) throw error
  })
}
