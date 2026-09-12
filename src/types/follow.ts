import type { Timestamp } from 'firebase/firestore'

export interface FollowEdge {
  uid: string
  nickname: string
  photoURL: string
  createdAt: Timestamp
}

export type FollowRequest = FollowEdge
