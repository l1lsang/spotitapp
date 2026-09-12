import type { Timestamp } from 'firebase/firestore'
import type { PinTheme } from './post'

export interface DaymarkUser {
  uid: string
  email: string
  nickname: string
  username?: string
  bio?: string
  onboardingComplete?: boolean
  registrationRequired?: boolean
  photoURL: string
  pinThemes?: PinTheme[]
  isPrivate?: boolean
  followerCount?: number
  followingCount?: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
