import type { Timestamp } from 'firebase/firestore'

export const COMMENT_MAX_LENGTH = 2000

export interface PostComment {
  id: string
  uid: string
  authorNickname: string
  authorPhotoURL?: string
  deleted?: boolean
  content: string
  mentions?: Record<string, string>
  replyCount?: number
  replies: PostReply[]
  createdAt: Timestamp
}

export interface PostReply {
  id: string
  commentId: string
  uid: string
  authorNickname: string
  authorPhotoURL?: string
  content: string
  mentions?: Record<string, string>
  createdAt: Timestamp
}
