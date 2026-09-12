import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import type { ChatMessage, ChatParticipant, DaymarkChat } from '../types/chat'
import type { NotificationActor } from '../types/notification'
import type { DaymarkUser } from '../types/user'
import { createNotifications } from './notificationService'
import { listUsers } from './userService'

type ChatPerson = Pick<DaymarkUser, 'uid' | 'nickname' | 'photoURL'>

interface ChatAttachmentInput {
  photoUrl?: string
  photoName?: string
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

function getDirectChatId(uidA: string, uidB: string): string {
  return `direct_${[uidA, uidB].sort().join('_')}`
}

function toParticipant(user: ChatPerson): ChatParticipant {
  return {
    uid: user.uid,
    nickname: user.nickname,
    photoURL: user.photoURL || '',
  }
}

function toChat(snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): DaymarkChat | null {
  const data = snapshot.data()

  if (!data) {
    return null
  }

  return {
    ...(data as Omit<DaymarkChat, 'id'>),
    id: snapshot.id,
    lastMessage: (data as { lastMessage?: string }).lastMessage || '',
    readAtBy: (data as { readAtBy?: DaymarkChat['readAtBy'] }).readAtBy || {},
  }
}

function toMessage(snapshot: QueryDocumentSnapshot<DocumentData>): ChatMessage {
  const data = snapshot.data() as Omit<ChatMessage, 'id'> & { id?: string }

  return {
    ...data,
    id: data.id || snapshot.id,
  }
}

function sortChatsByUpdatedAtDesc(chats: DaymarkChat[]): DaymarkChat[] {
  return [...chats].sort((a, b) => {
    const left = hasToMillis(a.updatedAt) ? a.updatedAt.toMillis() : 0
    const right = hasToMillis(b.updatedAt) ? b.updatedAt.toMillis() : 0

    return right - left
  })
}

export function getOtherParticipant(chat: DaymarkChat, currentUid: string): ChatParticipant | null {
  const otherUid = chat.participantIds.find((uid) => uid !== currentUid)

  return otherUid ? chat.participants[otherUid] || null : null
}

export async function getOrCreateDirectChat(
  currentUser: ChatPerson,
  targetUser: ChatPerson,
): Promise<string> {
  if (currentUser.uid === targetUser.uid) {
    throw new Error('자기 자신과는 채팅할 수 없습니다.')
  }

  const db = requireDb()
  const chatId = getDirectChatId(currentUser.uid, targetUser.uid)
  const chatRef = doc(db, 'chats', chatId)
  const snapshot = await getDoc(chatRef)
  const participants = {
    [currentUser.uid]: toParticipant(currentUser),
    [targetUser.uid]: toParticipant(targetUser),
  }

  if (!snapshot.exists()) {
    await setDoc(chatRef, {
      id: chatId,
      kind: 'direct',
      participantIds: [currentUser.uid, targetUser.uid].sort(),
      participants,
      lastMessage: '',
      lastMessageUid: '',
      lastMessageAt: null,
      readAtBy: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } else {
    await setDoc(
      chatRef,
      {
        participants,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  return chatId
}

export async function createGroupChat(
  owner: ChatPerson,
  members: ChatPerson[],
  name: string,
): Promise<string> {
  const uniqueParticipants = new Map<string, ChatPerson>()

  uniqueParticipants.set(owner.uid, owner)
  members.forEach((member) => {
    if (member.uid !== owner.uid) {
      uniqueParticipants.set(member.uid, member)
    }
  })

  if (uniqueParticipants.size < 2) {
    throw new Error('단체방에는 나를 제외한 멤버가 한 명 이상 필요합니다.')
  }

  const db = requireDb()
  const chatRef = doc(collection(db, 'chats'))
  const participants = Object.fromEntries(
    [...uniqueParticipants.values()].map((participant) => [participant.uid, toParticipant(participant)]),
  )

  await setDoc(chatRef, {
    id: chatRef.id,
    kind: 'group',
    name: name.trim() || '새 단체방',
    ownerUid: owner.uid,
    participantIds: [...uniqueParticipants.keys()].sort(),
    participants,
    lastMessage: '',
    lastMessageUid: '',
    lastMessageAt: null,
    readAtBy: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return chatRef.id
}

export async function addParticipantsToChat(chatId: string, members: ChatPerson[]): Promise<void> {
  const db = requireDb()
  const chatRef = doc(db, 'chats', chatId)
  const snapshot = await getDoc(chatRef)
  const chat = toChat(snapshot)

  if (!chat) {
    throw new Error('채팅방을 찾을 수 없습니다.')
  }

  if (chat.kind !== 'group') {
    throw new Error('단체방에만 초대할 수 있습니다.')
  }

  const participants = { ...chat.participants }
  const participantIds = new Set(chat.participantIds)

  members.forEach((member) => {
    participantIds.add(member.uid)
    participants[member.uid] = toParticipant(member)
  })

  await updateDoc(chatRef, {
    participantIds: [...participantIds].sort(),
    participants,
    updatedAt: serverTimestamp(),
  })
}

export async function getChatInviteCandidates(chatId: string): Promise<DaymarkUser[]> {
  const db = requireDb()
  const chat = toChat(await getDoc(doc(db, 'chats', chatId)))

  if (!chat) {
    return []
  }

  const users = await listUsers()
  const participantIds = new Set(chat.participantIds)

  return users.filter((user) => !participantIds.has(user.uid))
}

export async function getChatById(chatId: string, viewerUid: string): Promise<DaymarkChat | null> {
  const snapshot = await getDoc(doc(requireDb(), 'chats', chatId))
  const chat = toChat(snapshot)

  if (!chat || !chat.participantIds.includes(viewerUid)) {
    return null
  }

  return chat
}

export function subscribeToChat(
  chatId: string,
  viewerUid: string,
  onChange: (chat: DaymarkChat | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(requireDb(), 'chats', chatId),
    (snapshot) => {
      const chat = toChat(snapshot)

      onChange(chat && chat.participantIds.includes(viewerUid) ? chat : null)
    },
    onError,
  )
}

export function subscribeToMyChats(
  uid: string,
  onChange: (chats: DaymarkChat[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const chatsQuery = query(collection(requireDb(), 'chats'), where('participantIds', 'array-contains', uid))

  return onSnapshot(
    chatsQuery,
    (snapshot) => {
      const chats = snapshot.docs.map(toChat).filter((chat): chat is DaymarkChat => Boolean(chat))
      onChange(sortChatsByUpdatedAtDesc(chats))
    },
    onError,
  )
}

export function subscribeToChatMessages(
  chatId: string,
  onChange: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const messagesQuery = query(
    collection(requireDb(), 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
  )

  return onSnapshot(
    messagesQuery,
    (snapshot) => onChange(snapshot.docs.map(toMessage)),
    onError,
  )
}

export async function sendChatMessage(
  chatId: string,
  author: NotificationActor,
  content: string,
  attachment: ChatAttachmentInput = {},
): Promise<void> {
  const trimmed = content.trim()
  const hasPhoto = Boolean(attachment.photoUrl)

  if (!trimmed && !hasPhoto) {
    return
  }

  const db = requireDb()
  const chatRef = doc(db, 'chats', chatId)
  const chatSnapshot = await getDoc(chatRef)
  const chat = toChat(chatSnapshot)
  const messageRef = doc(collection(db, 'chats', chatId, 'messages'))
  const batch = writeBatch(db)
  const lastMessage = trimmed || '사진을 보냈습니다.'

  batch.set(messageRef, {
    id: messageRef.id,
    chatId,
    uid: author.uid,
    authorNickname: author.nickname,
    content: trimmed,
    photoUrl: attachment.photoUrl || '',
    photoName: attachment.photoName || '',
    createdAt: serverTimestamp(),
  })
  batch.update(chatRef, {
    lastMessage,
    lastMessageUid: author.uid,
    lastMessageAt: serverTimestamp(),
    [`readAtBy.${author.uid}`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await batch.commit()

  if (chat) {
    await createNotifications(
      chat.participantIds
        .filter((participantUid) => participantUid !== author.uid)
        .map((recipientUid) => ({
          recipientUid,
          actor: author,
          type: 'chat',
          title: '새 채팅 메시지',
          message: `${author.nickname}: ${lastMessage}`,
          href: `/chats/${chatId}`,
          chatId,
        })),
    )
  }
}

export async function markChatAsRead(chatId: string, uid: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'chats', chatId), {
    [`readAtBy.${uid}`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function setChatMessagePinned(chatId: string, messageId: string, viewerUid: string, pinned: boolean): Promise<void> {
  const chat = await getChatById(chatId, viewerUid)
  if (!chat) throw new Error('참여 중인 채팅방에서만 메시지를 고정할 수 있습니다.')
  const db = requireDb()
  if (pinned) {
    const message = await getDoc(doc(db, 'chats', chatId, 'messages', messageId))
    if (!message.exists() || message.data().uid === 'deleted-user') throw new Error('고정할 수 없는 메시지입니다.')
  }
  // Atomic array operations preserve pins added or removed by other participants.
  await updateDoc(doc(db, 'chats', chatId), {
    pinnedMessageIds: pinned ? arrayUnion(messageId) : arrayRemove(messageId),
  })
}

export async function refreshChatParticipant(chatId: string, user: ChatPerson): Promise<void> {
  await updateDoc(doc(requireDb(), 'chats', chatId), {
    [`participants.${user.uid}`]: toParticipant(user),
    updatedAt: serverTimestamp(),
  })
}
