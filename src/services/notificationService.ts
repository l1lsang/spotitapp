import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
  type DocumentReference,
} from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import type { DaymarkNotification, NotificationActor, NotificationType } from '../types/notification'

export interface CreateNotificationInput {
  recipientUid: string
  actor: NotificationActor
  type: NotificationType
  title: string
  message: string
  href: string
  postId?: string
  chatId?: string
  commentId?: string
  replyId?: string
  mentionUsername?: string
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

function toNotification(snapshot: QueryDocumentSnapshot<DocumentData>): DaymarkNotification {
  const data = snapshot.data() as Omit<DaymarkNotification, 'id'> & { id?: string }

  return {
    ...data,
    id: data.id || snapshot.id,
    actorPhotoURL: data.actorPhotoURL || '',
    readAt: data.readAt || null,
  }
}

function sortNotificationsDesc(notifications: DaymarkNotification[]): DaymarkNotification[] {
  return [...notifications].sort((a, b) => {
    const left = hasToMillis(a.createdAt) ? a.createdAt.toMillis() : 0
    const right = hasToMillis(b.createdAt) ? b.createdAt.toMillis() : 0

    return right - left
  })
}

// Keep the notification in the same atomic write as its action.
export function queueNotification(writer: { set: (ref: DocumentReference, data: DocumentData) => unknown }, input: CreateNotificationInput): void {
  if (input.recipientUid === input.actor.uid) {
    return
  }

  const db = requireDb()
  const notificationRef = doc(collection(db, 'users', input.recipientUid, 'notifications'))

  writer.set(notificationRef, {
    id: notificationRef.id,
    recipientUid: input.recipientUid,
    actorUid: input.actor.uid,
    actorNickname: input.actor.nickname,
    actorPhotoURL: input.actor.photoURL || '',
    type: input.type,
    title: input.title,
    message: input.message,
    href: input.href,
    postId: input.postId || '',
    chatId: input.chatId || '',
    commentId: input.commentId || '',
    replyId: input.replyId || '',
    ...(input.mentionUsername ? { mentionUsername: input.mentionUsername } : {}),
    readAt: null,
    createdAt: serverTimestamp(),
  })
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (input.recipientUid === input.actor.uid) return
  const batch = writeBatch(requireDb())
  queueNotification(batch, input)
  await batch.commit()
}

export async function createNotifications(inputs: CreateNotificationInput[]): Promise<void> {
  const validInputs = inputs.filter((input) => input.recipientUid !== input.actor.uid)

  if (validInputs.length === 0) {
    return
  }

  const db = requireDb()
  const batch = writeBatch(db)

  validInputs.forEach((input) => queueNotification(batch, input))

  await batch.commit()
}

export function subscribeToNotifications(
  uid: string,
  onChange: (notifications: DaymarkNotification[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const notificationsQuery = query(
    collection(requireDb(), 'users', uid, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(80),
  )

  return onSnapshot(
    notificationsQuery,
    (snapshot) => onChange(sortNotificationsDesc(snapshot.docs.map(toNotification))),
    onError,
  )
}

export function subscribeToUnreadNotificationCount(
  uid: string,
  onChange: (count: number) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const unreadQuery = query(collection(requireDb(), 'users', uid, 'notifications'), where('readAt', '==', null))

  return onSnapshot(unreadQuery, (snapshot) => onChange(snapshot.size), onError)
}

export async function markNotificationAsRead(uid: string, notificationId: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'users', uid, 'notifications', notificationId), {
    readAt: serverTimestamp(),
  })
}

export async function markAllNotificationsAsRead(uid: string): Promise<void> {
  const snapshot = await getDocs(query(collection(requireDb(), 'users', uid, 'notifications'), where('readAt', '==', null)))

  if (snapshot.empty) {
    return
  }

  const batch = writeBatch(requireDb())

  snapshot.docs.forEach((notificationDoc) => {
    batch.update(notificationDoc.ref, {
      readAt: serverTimestamp(),
    })
  })

  await batch.commit()
}
