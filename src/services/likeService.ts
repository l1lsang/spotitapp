import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import type { NotificationActor } from '../types/notification'
import { queueNotification } from './notificationService'

type ReactionCounts = { likeCount: number; commentCount: number }

// The server recounts likes a moment after the like itself is saved. Until the
// stored count moves away from the one this viewer acted on, show their change.
const pendingLikes = new Map<string, { base: number; delta: number }>()
const reactionListeners = new Map<string, Set<() => void>>()

function withPendingLike(postId: string, counts: ReactionCounts): ReactionCounts {
  const pending = pendingLikes.get(postId)
  return pending && pending.base === counts.likeCount
    ? { ...counts, likeCount: Math.max(0, counts.likeCount + pending.delta) }
    : counts
}

export function subscribeToPostReactions(
  postId: string,
  onChange: (counts: ReactionCounts | null) => void,
  onError: (error: Error) => void,
) {
  let latest: ReactionCounts | null = null
  const emit = () => { if (latest) onChange(withPendingLike(postId, latest)) }
  const listeners = reactionListeners.get(postId) || new Set()
  reactionListeners.set(postId, listeners.add(emit))
  const stop = onSnapshot(doc(requireDb(), 'posts', postId), snapshot => {
    const data = snapshot.data()
    latest = data ? { likeCount: data.likeCount || 0, commentCount: data.commentCount || 0 } : null
    if (latest && pendingLikes.get(postId)?.base !== latest.likeCount) pendingLikes.delete(postId)
    if (latest) emit()
    else onChange(null)
  }, onError)
  return () => {
    stop()
    listeners.delete(emit)
    if (!listeners.size) reactionListeners.delete(postId)
  }
}

export function subscribeToLikeStatus(postId: string, uid: string, onChange: (liked: boolean) => void, onError: (error: Error) => void) {
  return onSnapshot(doc(requireDb(), 'posts', postId, 'likes', uid), snapshot => onChange(snapshot.exists()), onError)
}

export async function togglePostLike(postId: string, actor: NotificationActor): Promise<boolean> {
  const db = requireDb()
  const likeRef = doc(db, 'posts', postId, 'likes', actor.uid)
  const postRef = doc(db, 'posts', postId)
  const { liked, base } = await runTransaction(db, async transaction => {
    const postSnapshot = await transaction.get(postRef)
    if (!postSnapshot.exists()) throw new Error('삭제되었거나 볼 수 없는 기록입니다.')
    const likeSnapshot = await transaction.get(likeRef)
    const post = postSnapshot.data()
    const liked = !likeSnapshot.exists()
    if (liked) {
      transaction.set(likeRef, { uid: actor.uid, createdAt: serverTimestamp() })
      queueNotification(transaction, {
        recipientUid: post.uid, actor, type: 'like', title: '새 좋아요',
        message: `${actor.nickname}님이 "${post.title}"을 좋아합니다.`,
        href: `/posts/${postId}`, postId,
      })
    } else transaction.delete(likeRef)
    return { liked, base: (post.likeCount as number | undefined) || 0 }
  })
  const pending = pendingLikes.get(postId)
  const delta = (pending?.base === base ? pending.delta : 0) + (liked ? 1 : -1)
  if (delta) pendingLikes.set(postId, { base, delta })
  else pendingLikes.delete(postId)
  reactionListeners.get(postId)?.forEach(emit => emit())
  return liked
}
