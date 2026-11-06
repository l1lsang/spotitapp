import type { Timestamp } from 'firebase/firestore'

export interface ChatParticipant {
  uid: string
  nickname: string
  photoURL: string
}

export type ChatReactionEmoji = '👍' | '❤️' | '😂' | '😮' | '😢' | '🙏'

export interface DaymarkChat {
  id: string
  kind?: 'direct' | 'group'
  name?: string
  /** Set on a group's own room; membership follows the group and is managed by the server. */
  groupId?: string
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
  reactionsBy?: Record<string, ChatReactionEmoji>
  /** Group-chat tags: "@nickname" as written in content → tagged member uid. */
  mentions?: Record<string, string>
  createdAt?: Timestamp
}
