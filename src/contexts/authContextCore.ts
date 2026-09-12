import { createContext } from 'react'
import type { User } from 'firebase/auth'
import type { DaymarkUser } from '../types/user'

export interface AuthContextValue {
  currentUser: User | null
  profile: DaymarkUser | null
  profileError: string
  loading: boolean
  firebaseReady: boolean
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
