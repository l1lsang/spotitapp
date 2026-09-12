import type { Timestamp } from 'firebase/firestore'

export type NotificationType = 'chat' | 'follow' | 'follow_request' | 'like' | 'comment' | 'reply' | 'mention'

export interface DaymarkNotification {
  id: string
  recipientUid: string
  actorUid: string
  actorNickname: string
  actorPhotoURL: string
  type: NotificationType
  title: string
  message: string
  href: string
  postId?: string
  chatId?: string
  commentId?: string
  replyId?: string
  mentionUsername?: string
  readAt?: Timestamp | null
  createdAt?: Timestamp
}

export interface NotificationActor {
  uid: string
  nickname: string
  photoURL?: string
}
