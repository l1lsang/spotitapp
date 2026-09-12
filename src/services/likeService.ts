import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import type { NotificationActor } from '../types/notification'
import { queueNotification } from './notificationService'

export function subscribeToPostReactions(
  postId: string,
  onChange: (counts: { likeCount: number; commentCount: number } | null) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(doc(requireDb(), 'posts', postId), snapshot => {
    const data = snapshot.data()
    onChange(data ? { likeCount: data.likeCount || 0, commentCount: data.commentCount || 0 } : null)
  }, onError)
}

export function subscribeToLikeStatus(postId: string, uid: string, onChange: (liked: boolean) => void, onError: (error: Error) => void) {
  return onSnapshot(doc(requireDb(), 'posts', postId, 'likes', uid), snapshot => onChange(snapshot.exists()), onError)
}

export async function togglePostLike(postId: string, actor: NotificationActor): Promise<boolean> {
  const db = requireDb()
  const likeRef = doc(db, 'posts', postId, 'likes', actor.uid)
  const postRef = doc(db, 'posts', postId)
  return runTransaction(db, async transaction => {
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
    transaction.update(postRef, {
      likeCount: Math.max(0, (post.likeCount || 0) + (liked ? 1 : -1)), updatedAt: serverTimestamp(),
    })
    return liked
  })
}
