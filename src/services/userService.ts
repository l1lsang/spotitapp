import type { User as FirebaseUser } from 'firebase/auth'
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import { appReadCache, invalidateAppReads } from '../lib/readCache'
import { getSignupRequirementsError, SIGNUP_POLICY_VERSION, type SignupRequirements } from '../lib/signupRequirements'
import { BIO_MAX_LENGTH, NICKNAME_MAX_LENGTH, createRandomUsername, getUsernameError, normalizeUsername } from '../lib/userProfile'
import type { DaymarkUser } from '../types/user'
import { getPinThemeError, normalizePinColor, type PinTheme } from '../types/post'
import { setGroupMembership } from './groupService'

type BatchOperation = (batch: WriteBatch) => void

export function getFallbackNickname(user: Pick<FirebaseUser, 'displayName'>): string {
  return user.displayName?.trim() || '스팟잇 사용자'
}

export async function getUserProfile(uid: string, fresh = false): Promise<DaymarkUser | null> {
  const load = async () => {
    const snapshot = await getDoc(doc(requireDb(), 'users', uid))
    return snapshot.exists() ? snapshot.data() as DaymarkUser : null
  }
  return fresh ? load() : appReadCache.read(`profile:${uid}`, load, 60_000)
}

export async function isUsernameAvailable(value: string, uid?: string): Promise<boolean> {
  const validationError = getUsernameError(value)
  if (validationError) throw new Error(validationError)
  const snapshot = await getDoc(doc(requireDb(), 'usernames', `@${normalizeUsername(value)}`))
  return !snapshot.exists() || snapshot.data().uid === uid
}

export class UsernameTakenError extends Error {
  constructor() {
    super('이미 사용 중인 사용자 이름입니다. 다른 이름을 입력해 주세요.')
    this.name = 'UsernameTakenError'
  }
}

export async function upsertUserProfile(user: FirebaseUser): Promise<DaymarkUser> {
  const db = requireDb()
  const userRef = doc(db, 'users', user.uid)

  // Only legacy profiles receive a random handle; new accounts choose their own.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const migrated = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(userRef)
      if (!snapshot.exists()) {
        transaction.set(userRef, {
          uid: user.uid,
          email: user.email || '',
          photoURL: user.photoURL || '',
          nickname: getFallbackNickname(user),
          bio: '',
          onboardingComplete: false,
          registrationRequired: true,
          isPrivate: false,
          followerCount: 0,
          followingCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        return true
      }

      const profile = snapshot.data() as DaymarkUser
      if (profile.username || profile.onboardingComplete === false) return profile

      const username = createRandomUsername()
      const usernameRef = doc(db, 'usernames', `@${username}`)
      if ((await transaction.get(usernameRef)).exists()) return false
      transaction.set(usernameRef, { uid: user.uid })
      transaction.update(userRef, {
        username,
        bio: profile.bio || '',
        onboardingComplete: true,
        updatedAt: serverTimestamp(),
      })
      return true
    })

    if (typeof migrated === 'object') return migrated
    if (migrated) {
      return (await getDoc(userRef)).data() as DaymarkUser
    }
  }

  throw new Error('사용자 이름을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.')
}

export interface UserProfileDetails {
  username: string
  nickname: string
  bio: string
  photoURL?: string
}

export async function updateUserProfileDetails(uid: string, details: UserProfileDetails, requirements?: SignupRequirements): Promise<void> {
  if (requirements) {
    const error = getSignupRequirementsError(requirements)
    if (error) throw new Error(error)
  }
  const username = normalizeUsername(details.username)
  const validationError = getUsernameError(username)
  if (validationError) throw new Error(validationError)
  const nickname = details.nickname.trim()
  if (!nickname || nickname.length > NICKNAME_MAX_LENGTH) throw new Error('닉네임은 1~24자로 입력해 주세요.')
  if (details.bio.length > BIO_MAX_LENGTH) throw new Error('소개글은 150자 이내로 입력해 주세요.')

  const db = requireDb()
  const userRef = doc(db, 'users', uid)
  const usernameRef = doc(db, 'usernames', `@${username}`)
  await runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef)
    const usernameSnapshot = await transaction.get(usernameRef)
    if (!userSnapshot.exists()) throw new Error('프로필을 불러오지 못했습니다. 다시 시도해 주세요.')
    if (usernameSnapshot.exists() && usernameSnapshot.data().uid !== uid) throw new UsernameTakenError()

    const previousUsername = userSnapshot.data().username as string | undefined
    const previousRef = previousUsername && previousUsername !== username
      ? doc(db, 'usernames', `@${previousUsername}`)
      : null
    const previousSnapshot = previousRef ? await transaction.get(previousRef) : null
    const isSignup = userSnapshot.data().onboardingComplete === false
    if (isSignup) {
      if (!requirements) throw new Error('생년월일과 필수 약관 동의를 확인해 주세요.')
      const [birthYear, birthMonth, birthDay] = requirements.birthDate.split('-').map(Number)
      transaction.set(doc(db, 'users', uid, 'private', 'registration'), {
        birthYear, birthMonth, birthDay,
        termsAccepted: true, privacyAccepted: true,
        version: SIGNUP_POLICY_VERSION, acceptedAt: serverTimestamp(),
      })
      transaction.set(doc(db, 'users', uid, 'private', 'locationConsent'), {
        accepted: requirements.locationAccepted, version: SIGNUP_POLICY_VERSION, updatedAt: serverTimestamp(),
      })
    }

    // The reservation and profile are committed together, including simultaneous signups.
    transaction.set(usernameRef, { uid })
    transaction.update(userRef, {
      username,
      nickname,
      bio: details.bio.trim(),
      ...(details.photoURL !== undefined ? { photoURL: details.photoURL } : {}),
      onboardingComplete: true,
      updatedAt: serverTimestamp(),
    })
    if (previousRef && previousSnapshot?.data()?.uid === uid) transaction.delete(previousRef)
  })
  invalidateAppReads()
}

export async function updateUserNickname(uid: string, nickname: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'users', uid), {
    nickname: nickname.trim(),
    updatedAt: serverTimestamp(),
  })
  invalidateAppReads()
}

export async function updateUserPhotoURL(uid: string, photoURL: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'users', uid), {
    photoURL,
    updatedAt: serverTimestamp(),
  })
  invalidateAppReads()
}

export async function updateUserPrivacy(uid: string, isPrivate: boolean): Promise<void> {
  await updateDoc(doc(requireDb(), 'users', uid), {
    isPrivate,
    updatedAt: serverTimestamp(),
  })
  invalidateAppReads()
}

export async function saveUserPinTheme(uid: string, theme: PinTheme): Promise<void> {
  const error = getPinThemeError(theme)
  if (error) throw new Error(error)
  const savedTheme = { id: theme.id, name: theme.name.trim(), color: normalizePinColor(theme.color) }
  const db = requireDb()
  const reference = doc(db, 'users', uid)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference)
    if (!snapshot.exists()) throw new Error('프로필을 찾을 수 없습니다.')
    const themes = (snapshot.data() as DaymarkUser).pinThemes || []
    if (themes.some((item) => item.id !== theme.id && item.name.toLocaleLowerCase() === savedTheme.name.toLocaleLowerCase())) {
      throw new Error('이미 사용 중인 테마 이름입니다.')
    }
    const exists = themes.some((item) => item.id === theme.id)
    transaction.update(reference, {
      pinThemes: exists ? themes.map((item) => item.id === theme.id ? savedTheme : item) : [...themes, savedTheme],
      updatedAt: serverTimestamp(),
    })
  })
  invalidateAppReads()
}

export async function listUsers(): Promise<DaymarkUser[]> {
  return appReadCache.read('users', async () => {
    const snapshot = await getDocs(collection(requireDb(), 'users'))
    return snapshot.docs.map((userDoc) => userDoc.data() as DaymarkUser)
      .filter((user) => user.onboardingComplete !== false)
  })
}

async function commitBatchOperations(db: Firestore, operations: BatchOperation[]): Promise<void> {
  const chunkSize = 450

  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = writeBatch(db)
    operations.slice(index, index + chunkSize).forEach((operation) => operation(batch))
    await batch.commit()
  }
}

function addDeleteOperation(
  operations: BatchOperation[],
  deletedPaths: Set<string>,
  reference: DocumentReference,
): void {
  if (deletedPaths.has(reference.path)) {
    return
  }

  deletedPaths.add(reference.path)
  operations.push((batch) => batch.delete(reference))
}

export async function deleteUserAccountData(uid: string): Promise<void> {
  const db = requireDb()
  const memberships = await getDocs(collection(db, 'users', uid, 'groupMemberships'))
  for (const membership of memberships.docs) await setGroupMembership(membership.id, uid, false)
  const operations: BatchOperation[] = []
  const deletedPaths = new Set<string>()
  const userRef = doc(db, 'users', uid)

  const [
    followersSnapshot,
    followingSnapshot,
    incomingFollowRequestsSnapshot,
    sentFollowRequestsSnapshot,
    notificationsSnapshot,
    actorNotificationsSnapshot,
    postsSnapshot,
    commentsSnapshot,
    repliesSnapshot,
    likesSnapshot,
    chatsSnapshot,
    webTokensSnapshot,
    nativeTokensSnapshot,
  ] = await Promise.all([
      getDocs(collection(db, 'users', uid, 'followers')),
      getDocs(collection(db, 'users', uid, 'following')),
      getDocs(collection(db, 'users', uid, 'followRequests')),
      getDocs(collection(db, 'users', uid, 'sentFollowRequests')),
      getDocs(collection(db, 'users', uid, 'notifications')),
      getDocs(query(collectionGroup(db, 'notifications'), where('actorUid', '==', uid))),
      getDocs(query(collection(db, 'posts'), where('uid', '==', uid))),
      getDocs(query(collectionGroup(db, 'comments'), where('uid', '==', uid))),
      getDocs(query(collectionGroup(db, 'replies'), where('uid', '==', uid))),
      getDocs(query(collectionGroup(db, 'likes'), where('uid', '==', uid))),
      getDocs(query(collection(db, 'chats'), where('participantIds', 'array-contains', uid))),
      getDocs(collection(db, 'users', uid, 'fcmTokens')),
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID
        ? getDocs(collection(db, 'users', uid, 'expoPushTokens'))
        : Promise.resolve({ docs: [] }),
    ])

  const myPostIds = new Set(postsSnapshot.docs.map((postDoc) => postDoc.id))
  webTokensSnapshot.docs.forEach(token => addDeleteOperation(operations, deletedPaths, token.ref))
  nativeTokensSnapshot.docs.forEach(token => addDeleteOperation(operations, deletedPaths, token.ref))

  followersSnapshot.docs.forEach((followerDoc) => {
    addDeleteOperation(operations, deletedPaths, followerDoc.ref)
    addDeleteOperation(operations, deletedPaths, doc(db, 'users', followerDoc.id, 'following', uid))
    operations.push((batch) =>
      batch.update(doc(db, 'users', followerDoc.id), {
        followingCount: increment(-1),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  followingSnapshot.docs.forEach((followingDoc) => {
    addDeleteOperation(operations, deletedPaths, followingDoc.ref)
    addDeleteOperation(operations, deletedPaths, doc(db, 'users', followingDoc.id, 'followers', uid))
    operations.push((batch) =>
      batch.update(doc(db, 'users', followingDoc.id), {
        followerCount: increment(-1),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  incomingFollowRequestsSnapshot.docs.forEach((requestDoc) => {
    addDeleteOperation(operations, deletedPaths, requestDoc.ref)
    addDeleteOperation(operations, deletedPaths, doc(db, 'users', requestDoc.id, 'sentFollowRequests', uid))
  })

  sentFollowRequestsSnapshot.docs.forEach((requestDoc) => {
    addDeleteOperation(operations, deletedPaths, requestDoc.ref)
    addDeleteOperation(operations, deletedPaths, doc(db, 'users', requestDoc.id, 'followRequests', uid))
  })

  notificationsSnapshot.docs.forEach((notificationDoc) => addDeleteOperation(operations, deletedPaths, notificationDoc.ref))
  actorNotificationsSnapshot.docs.forEach((notificationDoc) =>
    addDeleteOperation(operations, deletedPaths, notificationDoc.ref),
  )

  await Promise.all(
    postsSnapshot.docs.map(async (postDoc) => {
      const [postCommentsSnapshot, postLikesSnapshot] = await Promise.all([
        getDocs(collection(db, 'posts', postDoc.id, 'comments')),
        getDocs(collection(db, 'posts', postDoc.id, 'likes')),
      ])
      const postCommentReplySnapshots = await Promise.all(
        postCommentsSnapshot.docs.map((commentDoc) => getDocs(collection(commentDoc.ref, 'replies'))),
      )

      postCommentReplySnapshots.forEach((replySnapshot) => {
        replySnapshot.docs.forEach((replyDoc) => addDeleteOperation(operations, deletedPaths, replyDoc.ref))
      })
      postCommentsSnapshot.docs.forEach((commentDoc) => addDeleteOperation(operations, deletedPaths, commentDoc.ref))
      postLikesSnapshot.docs.forEach((likeDoc) => addDeleteOperation(operations, deletedPaths, likeDoc.ref))
      addDeleteOperation(operations, deletedPaths, postDoc.ref)
    }),
  )

  const commentReplyEntries = await Promise.all(
    commentsSnapshot.docs.map(async (commentDoc) => ({
      commentDoc,
      repliesSnapshot: await getDocs(collection(commentDoc.ref, 'replies')),
    })),
  )

  commentReplyEntries.forEach(({ commentDoc, repliesSnapshot }) => {
    const parentPostRef = commentDoc.ref.parent.parent

    repliesSnapshot.docs.forEach((replyDoc) => addDeleteOperation(operations, deletedPaths, replyDoc.ref))
    addDeleteOperation(operations, deletedPaths, commentDoc.ref)

    if (parentPostRef && !myPostIds.has(parentPostRef.id)) {
      operations.push((batch) =>
        batch.update(parentPostRef, {
          commentCount: increment(-((commentDoc.data().deleted ? 0 : 1) + ((commentDoc.data() as { replyCount?: number }).replyCount || 0))),
          updatedAt: serverTimestamp(),
        }),
      )
    }
  })

  repliesSnapshot.docs.forEach((replyDoc) => {
    const parentCommentRef = replyDoc.ref.parent.parent
    const parentPostRef = parentCommentRef?.parent.parent

    addDeleteOperation(operations, deletedPaths, replyDoc.ref)

    if (
      parentCommentRef &&
      parentPostRef &&
      !deletedPaths.has(parentCommentRef.path) &&
      !myPostIds.has(parentPostRef.id)
    ) {
      operations.push((batch) => {
        batch.update(parentCommentRef, {
          replyCount: increment(-1),
        })
        batch.update(parentPostRef, {
          commentCount: increment(-1),
          updatedAt: serverTimestamp(),
        })
      })
    }
  })

  likesSnapshot.docs.forEach((likeDoc) => {
    const parentPostRef = likeDoc.ref.parent.parent

    addDeleteOperation(operations, deletedPaths, likeDoc.ref)

    if (parentPostRef && !myPostIds.has(parentPostRef.id)) {
      operations.push((batch) =>
        batch.update(parentPostRef, {
          likeCount: increment(-1),
          updatedAt: serverTimestamp(),
        }),
      )
    }
  })

  await Promise.all(
    chatsSnapshot.docs.map(async (chatDoc) => {
      const chat = chatDoc.data() as { lastMessageUid?: string }
      const messagesSnapshot = await getDocs(collection(db, 'chats', chatDoc.id, 'messages'))

      operations.push((batch) =>
        batch.update(chatDoc.ref, {
          [`participants.${uid}.nickname`]: '탈퇴한 사용자',
          [`participants.${uid}.photoURL`]: '',
          ...(chat.lastMessageUid === uid
            ? {
                lastMessage: '탈퇴한 사용자의 메시지입니다.',
                lastMessageUid: '',
              }
            : {}),
          updatedAt: serverTimestamp(),
        }),
      )

      messagesSnapshot.docs.forEach((messageDoc) => {
        const message = messageDoc.data() as { uid?: string }

        if (message.uid !== uid) {
          return
        }

        operations.push((batch) =>
          batch.update(messageDoc.ref, {
            uid: 'deleted-user',
            authorNickname: '탈퇴한 사용자',
            content: '탈퇴한 사용자의 메시지입니다.',
            photoUrl: '',
            photoName: '',
          }),
        )
      })
    }),
  )

  await commitBatchOperations(db, operations)
  // Release the handle atomically with removal of its owner profile.
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userRef)
    const username = snapshot.data()?.username as string | undefined
    const usernameRef = username ? doc(db, 'usernames', `@${username}`) : null
    const usernameSnapshot = usernameRef ? await transaction.get(usernameRef) : null
    if (usernameRef && usernameSnapshot?.data()?.uid === uid) transaction.delete(usernameRef)
    transaction.delete(doc(db, 'users', uid, 'private', 'registration'))
    transaction.delete(doc(db, 'users', uid, 'private', 'locationConsent'))
    transaction.delete(userRef)
  })
  invalidateAppReads()
}
