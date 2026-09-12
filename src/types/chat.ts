import type { Timestamp } from 'firebase/firestore'

export interface ChatParticipant {
  uid: string
  nickname: string
  photoURL: string
}

export interface DaymarkChat {
  id: string
  kind?: 'direct' | 'group'
  name?: string
  ownerUid?: string
  participantIds: string[]
  participants: Record<string, ChatParticipant>
  lastMessage: string
  lastMessageUid?: string
  lastMessageAt?: Timestamp
  readAtBy?: Record<string, Timestamp>
  pinnedMessageIds?: string[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface ChatMessage {
  id: string
  chatId: string
  uid: string
  authorNickname: string
  content: string
  photoUrl?: string
  photoName?: string
  createdAt?: Timestamp
}
