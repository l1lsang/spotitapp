import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, type Timestamp, type Unsubscribe } from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import { invalidateAppReads } from '../lib/readCache'
import { cancelFollowRequest, declineFollowRequest, unfollowUser } from './followService'

export interface BlockedUser { uid: string; nickname: string; photoURL: string; createdAt: Timestamp | null }
export interface BlockTarget { uid: string; nickname: string; photoURL?: string }

// Each block is users/{blocker}/blocks/{blocked}. A server function forwards
// every new block to the moderation queue so the operator reviews the account.
export async function blockUser(blockerUid: string, target: BlockTarget): Promise<void> {
  if (!target.uid || target.uid === blockerUid) throw new Error('본인은 차단할 수 없습니다.')
  await setDoc(doc(requireDb(), 'users', blockerUid, 'blocks', target.uid), {
    uid: target.uid,
    nickname: (target.nickname || '피노리 사용자').slice(0, 24),
    photoURL: target.photoURL || '',
    createdAt: serverTimestamp(),
  })
  // Cut follow ties both ways so neither side keeps seeing followers-only pins.
  await Promise.allSettled([
    unfollowUser(blockerUid, target.uid),
    unfollowUser(target.uid, blockerUid),
    cancelFollowRequest(blockerUid, target.uid),
    declineFollowRequest(blockerUid, target.uid),
  ])
  invalidateAppReads()
}

export async function unblockUser(blockerUid: string, targetUid: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'users', blockerUid, 'blocks', targetUid))
  invalidateAppReads()
}

export function subscribeBlockedUsers(uid: string, onChange: (users: BlockedUser[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(collection(requireDb(), 'users', uid, 'blocks'), snapshot => {
    onChange(snapshot.docs.map(item => {
      const data = item.data()
      return { uid: item.id, nickname: data.nickname || '피노리 사용자', photoURL: data.photoURL || '', createdAt: data.createdAt || null }
    }).sort((a, b) => (b.createdAt?.toMillis?.() || Date.now()) - (a.createdAt?.toMillis?.() || Date.now())))
  }, onError)
}
