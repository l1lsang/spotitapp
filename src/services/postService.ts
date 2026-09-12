import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  limit,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
  type QueryConstraint,
  type Timestamp,
} from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import { appReadCache, invalidateAppReads } from '../lib/readCache'
import { getProfilePinAccess, type ProfilePinAccess } from '../lib/profilePinAccess'
import type { LatLng } from '../lib/mapLocation'
import type { GroupVisibility } from '../types/group'
import {
  normalizePinColor,
  type Post,
  type PostFormInput,
} from '../types/post'
import { getFollowingIds, isFollowing } from './followService'
import { uploadPostPhotosWithThumbnails, type UploadPhoto } from './storageService'
import { getUserProfile } from './userService'

interface AuthorInfo {
  uid: string
  nickname: string
}

interface TimestampLike {
  toMillis: () => number
}

function hasToMillis(value: unknown): value is TimestampLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  )
}

function toPost(
  snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>,
): Post | null {
  const data = snapshot.data()

  if (!data) {
    return null
  }

  const post = data as Omit<Post, 'id'> & { id?: string }

  return {
    ...post,
    id: post.id || snapshot.id,
    pinColor: normalizePinColor(post.pinColor),
    photoUrls: post.photoUrls || [],
    likeCount: post.likeCount || 0,
    commentCount: post.commentCount || 0,
  }
}

function sortPostsByCreatedAtDesc(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const left = hasToMillis(a.createdAt) ? a.createdAt.toMillis() : 0
    const right = hasToMillis(b.createdAt) ? b.createdAt.toMillis() : 0

    return right - left
  })
}

export function subscribeToLikedPosts(uid: string, onChange: (posts: Post[]) => void, onError: (error: Error) => void): Unsubscribe {
  const db = requireDb()
  let active = true
  let orderedIds: string[] = []
  const posts = new Map<string, Post | null>()
  const subscriptions = new Map<string, Unsubscribe>()
  const emit = () => {
    if (active && orderedIds.every(id => posts.has(id))) {
      onChange(orderedIds.map(id => posts.get(id)).filter((post): post is Post => Boolean(post)))
    }
  }
  const stop = onSnapshot(query(collectionGroup(db, 'likes'), where('uid', '==', uid)), snapshot => {
    if (!active) return
    const likes = snapshot.docs.flatMap(like => {
      const postRef = like.ref.parent.parent
      if (!postRef || postRef.parent.path !== 'posts') return []
      const createdAt = like.data().createdAt
      return [{ id: postRef.id, likedAt: hasToMillis(createdAt) ? createdAt.toMillis() : 0 }]
    }).sort((a, b) => b.likedAt - a.likedAt || a.id.localeCompare(b.id))
    orderedIds = likes.map(like => like.id)
    const ids = new Set(orderedIds)
    subscriptions.forEach((unsubscribe, id) => {
      if (!ids.has(id)) { unsubscribe(); subscriptions.delete(id); posts.delete(id) }
    })
    orderedIds.forEach(id => {
      if (subscriptions.has(id)) return
      subscriptions.set(id, onSnapshot(doc(db, 'posts', id), postSnapshot => {
        if (!active || !subscriptions.has(id)) return
        posts.set(id, toPost(postSnapshot))
        emit()
      }, error => {
        if (!active || !subscriptions.has(id)) return
        // A saved like must never reveal a deleted pin or bypass its current visibility.
        posts.set(id, null)
        emit()
        if (error.code !== 'permission-denied') onError(error)
      }))
    })
    emit()
  }, error => { if (active) onError(error) })
  return () => { active = false; stop(); subscriptions.forEach(unsubscribe => unsubscribe()); subscriptions.clear() }
}

function assertOwner(post: Post, uid: string): void {
  if (post.uid !== uid) {
    throw new Error('작성자만 수정하거나 삭제할 수 있습니다.')
  }
}

function normalizeVisibility(visibility: Post['visibility']): Post['visibility'] {
  return visibility === 'public' ? 'public' : visibility
}

function distanceKm(from: LatLng, to: LatLng): number {
  const earthRadiusKm = 6371
  const latDelta = ((to.lat - from.lat) * Math.PI) / 180
  const lngDelta = ((to.lng - from.lng) * Math.PI) / 180
  const fromLat = (from.lat * Math.PI) / 180
  const toLat = (to.lat * Math.PI) / 180
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2)

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface PostPageCursor { createdAt: Timestamp; id: string }
export interface VisiblePostPage { posts: Post[]; nextCursor: PostPageCursor | null }

// Use five authors per query to leave room for account and follower rule reads.
// A global timestamp + ID cursor keeps ties stable across all author batches.
export async function getVisiblePostPage(uid: string, cursor: PostPageCursor | null = null, pageSize = 24): Promise<VisiblePostPage> {
  const count = Math.max(1, Math.min(80, Number.isFinite(pageSize) ? Math.floor(pageSize) : 80))
  const key = JSON.stringify(['feed', uid, cursor?.createdAt.seconds, cursor?.createdAt.nanoseconds, cursor?.id, count])
  return appReadCache.read(key, async () => {
    const followingIds = await appReadCache.read(`following:${uid}`, () => getFollowingIds(uid))
    const authors = [...new Set(followingIds)].filter(id => id !== uid)
    const scopes: QueryConstraint[][] = [[where('uid', '==', uid)]]
    for (let index = 0; index < authors.length; index += 5) {
      scopes.push([where('uid', 'in', authors.slice(index, index + 5)), where('visibility', 'in', ['followers', 'public'])])
    }
    const snapshots: QueryDocumentSnapshot<DocumentData>[] = []
    let nextScope = 0
    await Promise.all(Array.from({ length: Math.min(4, scopes.length) }, async () => {
      while (nextScope < scopes.length) {
        const scope = scopes[nextScope++]
        const snapshot = await getDocs(query(collection(requireDb(), 'posts'), ...scope,
          orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'),
          ...(cursor ? [startAfter(cursor.createdAt, cursor.id)] : []), limit(count + 1)))
        snapshots.push(...snapshot.docs)
      }
    }))
    snapshots.sort((a, b) => {
      const left = a.data().createdAt as Timestamp
      const right = b.data().createdAt as Timestamp
      return right.seconds - left.seconds || right.nanoseconds - left.nanoseconds || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
    })
    const page = snapshots.slice(0, count)
    const last = page.at(-1)
    return {
      posts: page.map(toPost).filter((post): post is Post => Boolean(post)),
      nextCursor: snapshots.length > count && last ? { createdAt: last.data().createdAt as Timestamp, id: last.id } : null,
    }
  })
}

export function filterNearbyPosts(posts: Post[], center: LatLng, radiusKm: number): Post[] {
  return posts.filter(post => distanceKm(center, { lat: post.lat, lng: post.lng }) <= radiusKm)
}

export async function createPost(
  input: PostFormInput,
  files: UploadPhoto[],
  author: AuthorInfo,
): Promise<string> {
  const db = requireDb()
  const groupId = input.groupId || ''
  const visibility = await getGroupPostVisibility(groupId, input.visibility, author.uid)
  const postRef = doc(collection(db, 'posts'))
  const photos = files.length > 0 ? await uploadPostPhotosWithThumbnails(author.uid, postRef.id, files) : { photoUrls: [], photoThumbnailUrls: [] }

  await setDoc(postRef, {
    id: postRef.id,
    uid: author.uid,
    authorNickname: author.nickname,
    ...input,
    groupId,
    visibility,
    pinColor: normalizePinColor(input.pinColor),
    ...photos,
    likeCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  invalidateAppReads()
  return postRef.id
}

async function getGroupPostVisibility(groupId: string, visibility: Post['visibility'], uid: string, previousPost?: Post): Promise<Post['visibility']> {
  if (!groupId) {
    if (visibility === 'group') throw new Error('핀의 공개 범위를 선택해 주세요.')
    return visibility
  }
  if (groupId.includes('/') || groupId.length > 128) throw new Error('그룹 정보를 확인해 주세요.')
  // A former member can still edit their own pin; the group's visibility is immutable.
  if (previousPost?.groupId === groupId) return previousPost.visibility
  if (!(await getDoc(doc(requireDb(), 'groups', groupId, 'members', uid))).exists()) {
    throw new Error('그룹에 가입한 뒤 핀을 올려 주세요.')
  }
  const group = await getDoc(doc(requireDb(), 'groups', groupId))
  if (!group.exists()) throw new Error('그룹을 찾을 수 없습니다.')
  return group.data().visibility === 'private' ? 'group' : 'public'
}

export function subscribeGroupPosts(groupId: string, onChange: (posts: Post[]) => void, onError: (error: Error) => void, visibility: GroupVisibility = 'public') {
  return onSnapshot(query(collection(requireDb(), 'posts'), where('groupId', '==', groupId), where('visibility', '==', visibility === 'private' ? 'group' : 'public')), snapshot => {
    onChange(sortPostsByCreatedAtDesc(snapshot.docs.map(toPost).filter((post): post is Post => Boolean(post))))
  }, onError)
}

export async function getVisiblePosts(uid?: string, maxCount = 80): Promise<Post[]> {
  if (!uid || maxCount <= 0 || Number.isNaN(maxCount)) return []
  const posts: Post[] = []
  let cursor: PostPageCursor | null = null
  do {
    const page = await getVisiblePostPage(uid, cursor, Math.min(80, maxCount - posts.length))
    posts.push(...page.posts)
    cursor = page.nextCursor
  } while (cursor && posts.length < maxCount)
  return posts.slice(0, maxCount)
}

export async function getNearbyVisiblePosts(
  uid: string | undefined,
  center: LatLng,
  radiusKm: number,
  maxCount = 80,
): Promise<Post[]> {
  if (!uid || maxCount <= 0 || Number.isNaN(maxCount)) return []
  const posts: Post[] = []
  let cursor: PostPageCursor | null = null
  do {
    const page = await getVisiblePostPage(uid, cursor)
    posts.push(...filterNearbyPosts(page.posts, center, radiusKm))
    cursor = page.nextCursor
  } while (cursor && posts.length < maxCount)
  return posts.slice(0, maxCount)
}

export async function getUserPosts(uid: string): Promise<Post[]> {
  const snapshot = await getDocs(query(collection(requireDb(), 'posts'), where('uid', '==', uid)))
  const posts = snapshot.docs.map(toPost).filter((post): post is Post => Boolean(post))

  return sortPostsByCreatedAtDesc(posts)
}

export async function getProfilePosts(ownerUid: string, viewerUid?: string): Promise<{ posts: Post[]; access: ProfilePinAccess }> {
  if (!viewerUid) return { posts: [], access: 'locked' }
  if (ownerUid === viewerUid) return { posts: await getUserPosts(ownerUid), access: 'owner' }

  const [owner, followsOwner] = await Promise.all([getUserProfile(ownerUid, true), isFollowing(viewerUid, ownerUid)])
  if (!owner || owner.onboardingComplete === false) return { posts: [], access: 'locked' }
  const access = getProfilePinAccess(ownerUid, viewerUid, Boolean(owner.isPrivate), followsOwner)
  if (access === 'locked') return { posts: [], access }

  // Scope the Firestore query itself: never fetch another user's private pins.
  const visibility = access === 'following'
    ? where('visibility', 'in', ['public', 'followers'])
    : where('visibility', '==', 'public')
  const snapshot = await getDocs(query(collection(requireDb(), 'posts'), where('uid', '==', ownerUid), visibility))
  const posts = snapshot.docs.map(toPost).filter((post): post is Post => Boolean(post))
  return { posts: sortPostsByCreatedAtDesc(posts), access }
}

export async function getPostById(postId: string, viewerUid?: string): Promise<Post | null> {
  const snapshot = await getDoc(doc(requireDb(), 'posts', postId))
  const post = toPost(snapshot)

  if (!post) {
    return null
  }

  const normalizedPost = {
    ...post,
    visibility: normalizeVisibility(post.visibility),
  }

  if (normalizedPost.uid === viewerUid) {
    return normalizedPost
  }

  if (!viewerUid) {
    return null
  }

  if (normalizedPost.visibility === 'private') {
    return null
  }

  // Firestore authorizes group pins against the viewer's current membership.
  if (normalizedPost.visibility === 'public' || normalizedPost.visibility === 'group') {
    return normalizedPost
  }

  if (!(await isFollowing(viewerUid, normalizedPost.uid))) {
    return null
  }

  return normalizedPost
}

export async function updatePost(
  postId: string,
  input: PostFormInput,
  existingPhotoUrls: string[],
  files: UploadPhoto[],
  uid: string,
): Promise<void> {
  const post = await getPostById(postId, uid)

  if (!post) {
    throw new Error('기록을 찾을 수 없습니다.')
  }

  assertOwner(post, uid)

  const groupId = input.groupId ?? post.groupId ?? ''
  const visibility = await getGroupPostVisibility(groupId, input.visibility, uid, post)
  const uploadedPhotos = files.length > 0 ? await uploadPostPhotosWithThumbnails(uid, postId, files) : { photoUrls: [], photoThumbnailUrls: [] }

  await updateDoc(doc(requireDb(), 'posts', postId), {
    ...input,
    groupId,
    visibility,
    pinColor: normalizePinColor(input.pinColor),
    photoUrls: [...existingPhotoUrls, ...uploadedPhotos.photoUrls],
    photoThumbnailUrls: [...existingPhotoUrls.map(url => post.photoThumbnailUrls?.[post.photoUrls.indexOf(url)] || url), ...uploadedPhotos.photoThumbnailUrls],
    updatedAt: serverTimestamp(),
  })
  invalidateAppReads()
}

export async function deletePost(postId: string, uid: string): Promise<void> {
  const post = await getPostById(postId, uid)

  if (!post) {
    throw new Error('기록을 찾을 수 없습니다.')
  }

  assertOwner(post, uid)
  await deleteDoc(doc(requireDb(), 'posts', postId))
  invalidateAppReads()
}
