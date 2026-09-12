import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import { invalidateAppReads } from '../lib/readCache'
import type { FollowEdge, FollowRequest } from '../types/follow'
import type { DaymarkUser } from '../types/user'
import { createNotification } from './notificationService'

type FollowPerson = Pick<DaymarkUser, 'uid' | 'nickname' | 'photoURL' | 'isPrivate'>
type FollowActionResult = 'followed' | 'requested'

function toFollowEdge(person: FollowPerson): Omit<FollowEdge, 'createdAt'> {
  return {
    uid: person.uid,
    nickname: person.nickname,
    photoURL: person.photoURL || '',
  }
}

export async function isFollowing(viewerUid: string, targetUid: string): Promise<boolean> {
  if (viewerUid === targetUid) {
    return true
  }

  const snapshot = await getDoc(doc(requireDb(), 'users', viewerUid, 'following', targetUid))

  return snapshot.exists()
}

export async function hasPendingFollowRequest(viewerUid: string, targetUid: string): Promise<boolean> {
  const snapshot = await getDoc(doc(requireDb(), 'users', viewerUid, 'sentFollowRequests', targetUid))

  return snapshot.exists()
}

export async function getOutgoingFollowRequestIds(uid: string): Promise<string[]> {
  const snapshot = await getDocs(collection(requireDb(), 'users', uid, 'sentFollowRequests'))

  return snapshot.docs.map((requestDoc) => requestDoc.id)
}

export async function getIncomingFollowRequests(uid: string): Promise<FollowRequest[]> {
  const snapshot = await getDocs(collection(requireDb(), 'users', uid, 'followRequests'))

  return snapshot.docs.map((requestDoc) => requestDoc.data() as FollowRequest)
}

async function createFollowRelationship(currentUser: FollowPerson, targetUser: FollowPerson): Promise<void> {
  const db = requireDb()
  const followingRef = doc(db, 'users', currentUser.uid, 'following', targetUser.uid)
  const followerRef = doc(db, 'users', targetUser.uid, 'followers', currentUser.uid)
  const existing = await getDoc(followingRef)

  if (existing.exists()) {
    return
  }

  const batch = writeBatch(db)
  batch.set(followingRef, {
    ...toFollowEdge(targetUser),
    createdAt: serverTimestamp(),
  })
  batch.set(followerRef, {
    ...toFollowEdge(currentUser),
    createdAt: serverTimestamp(),
  })
  batch.update(doc(db, 'users', currentUser.uid), {
    followingCount: increment(1),
    updatedAt: serverTimestamp(),
  })
  batch.update(doc(db, 'users', targetUser.uid), {
    followerCount: increment(1),
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
  invalidateAppReads()
}

export async function followUser(currentUser: FollowPerson, targetUser: FollowPerson): Promise<FollowActionResult> {
  if (currentUser.uid === targetUser.uid) {
    throw new Error('자기 자신은 팔로우할 수 없습니다.')
  }

  const db = requireDb()
  const followingRef = doc(db, 'users', currentUser.uid, 'following', targetUser.uid)
  const requestRef = doc(db, 'users', targetUser.uid, 'followRequests', currentUser.uid)
  const sentRequestRef = doc(db, 'users', currentUser.uid, 'sentFollowRequests', targetUser.uid)
  const existing = await getDoc(followingRef)

  if (existing.exists()) {
    return 'followed'
  }

  const existingRequest = await getDoc(sentRequestRef)

  if (targetUser.isPrivate) {
    if (!existingRequest.exists()) {
      const batch = writeBatch(db)
      batch.set(requestRef, {
        ...toFollowEdge(currentUser),
        createdAt: serverTimestamp(),
      })
      batch.set(sentRequestRef, {
        ...toFollowEdge(targetUser),
        createdAt: serverTimestamp(),
      })

      await batch.commit()
      invalidateAppReads()

      await createNotification({
        recipientUid: targetUser.uid,
        actor: currentUser,
        type: 'follow_request',
        title: '팔로우 요청',
        message: `${currentUser.nickname}님이 팔로우를 요청했습니다.`,
        href: '/profile/settings',
      })
    }

    return 'requested'
  }

  if (existingRequest.exists()) {
    const batch = writeBatch(db)
    batch.delete(requestRef)
    batch.delete(sentRequestRef)
    await batch.commit()
    invalidateAppReads()
  }

  await createFollowRelationship(currentUser, targetUser)

  await createNotification({
    recipientUid: targetUser.uid,
    actor: currentUser,
    type: 'follow',
    title: '새 팔로워',
    message: `${currentUser.nickname}님이 나를 팔로우하기 시작했습니다.`,
    href: '/people',
  })

  return 'followed'
}

export async function cancelFollowRequest(currentUid: string, targetUid: string): Promise<void> {
  const db = requireDb()
  const batch = writeBatch(db)

  batch.delete(doc(db, 'users', targetUid, 'followRequests', currentUid))
  batch.delete(doc(db, 'users', currentUid, 'sentFollowRequests', targetUid))

  await batch.commit()
  invalidateAppReads()
}

export async function acceptFollowRequest(owner: FollowPerson, requester: FollowRequest): Promise<void> {
  if (owner.uid === requester.uid) {
    return
  }

  const db = requireDb()
  const followingRef = doc(db, 'users', requester.uid, 'following', owner.uid)
  const followerRef = doc(db, 'users', owner.uid, 'followers', requester.uid)
  const requestRef = doc(db, 'users', owner.uid, 'followRequests', requester.uid)
  const sentRequestRef = doc(db, 'users', requester.uid, 'sentFollowRequests', owner.uid)
  const existing = await getDoc(followingRef)
  const batch = writeBatch(db)

  if (!existing.exists()) {
    batch.set(followingRef, {
      ...toFollowEdge(owner),
      createdAt: serverTimestamp(),
    })
    batch.set(followerRef, {
      ...toFollowEdge(requester),
      createdAt: serverTimestamp(),
    })
    batch.update(doc(db, 'users', requester.uid), {
      followingCount: increment(1),
      updatedAt: serverTimestamp(),
    })
    batch.update(doc(db, 'users', owner.uid), {
      followerCount: increment(1),
      updatedAt: serverTimestamp(),
    })
  }

  batch.delete(requestRef)
  batch.delete(sentRequestRef)

  await batch.commit()
  invalidateAppReads()

  await createNotification({
    recipientUid: requester.uid,
    actor: owner,
    type: 'follow',
    title: '팔로우 요청 승인',
    message: `${owner.nickname}님이 팔로우 요청을 승인했습니다.`,
    href: '/people',
  })
}

export async function declineFollowRequest(ownerUid: string, requesterUid: string): Promise<void> {
  await cancelFollowRequest(requesterUid, ownerUid)
}

export async function unfollowUser(currentUid: string, targetUid: string): Promise<void> {
  const db = requireDb()
  const followingRef = doc(db, 'users', currentUid, 'following', targetUid)
  const followerRef = doc(db, 'users', targetUid, 'followers', currentUid)
  const existing = await getDoc(followingRef)

  if (!existing.exists()) {
    return
  }

  const batch = writeBatch(db)
  batch.delete(followingRef)
  batch.delete(followerRef)
  batch.update(doc(db, 'users', currentUid), {
    followingCount: increment(-1),
    updatedAt: serverTimestamp(),
  })
  batch.update(doc(db, 'users', targetUid), {
    followerCount: increment(-1),
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
  invalidateAppReads()
}

export async function removeFollower(ownerUid: string, followerUid: string): Promise<void> {
  await unfollowUser(followerUid, ownerUid)
}

export async function getFollowingIds(uid: string): Promise<string[]> {
  const snapshot = await getDocs(collection(requireDb(), 'users', uid, 'following'))

  return snapshot.docs.map((followDoc) => followDoc.id)
}

export async function getFollowers(uid: string): Promise<FollowEdge[]> {
  const snapshot = await getDocs(collection(requireDb(), 'users', uid, 'followers'))

  return snapshot.docs.map((followDoc) => followDoc.data() as FollowEdge)
}

export async function getFollowing(uid: string): Promise<FollowEdge[]> {
  const snapshot = await getDocs(collection(requireDb(), 'users', uid, 'following'))

  return snapshot.docs.map((followDoc) => followDoc.data() as FollowEdge)
}
