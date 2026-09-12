import { onAuthStateChanged, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react'
import { auth, isFirebaseConfigured, requireDb } from '../lib/firebase'
import { upsertUserProfile } from '../services/userService'
import type { DaymarkUser } from '../types/user'
import { AuthContext } from './authContextCore'
import { invalidateAppReads } from '../lib/readCache'

export function AuthProvider({ children }: PropsWithChildren): ReactElement {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<DaymarkUser | null>(null)
  const [profileError, setProfileError] = useState('')
  const [loading, setLoading] = useState(Boolean(auth) && isFirebaseConfigured)

  const refreshProfile = useCallback(async () => {
    const user = auth?.currentUser
    if (!user) {
      setProfile(null)
      return
    }

    const nextProfile = await upsertUserProfile(user)
    if (auth?.currentUser?.uid === user.uid) {
      setProfile(nextProfile)
      setProfileError('')
    }
  }, [])

  useEffect(() => {
    if (!auth || !isFirebaseConfigured) {
      return undefined
    }

    let active = true
    let revision = 0
    let unsubscribeProfile: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      invalidateAppReads()
      const currentRevision = ++revision
      unsubscribeProfile?.()
      setProfile(null)
      setProfileError('')
      setCurrentUser(user)

      if (!user) {
        setProfile(null)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const nextProfile = await upsertUserProfile(user)
        if (!active || currentRevision !== revision) return
        setProfile(nextProfile)
        setLoading(false)
        unsubscribeProfile = onSnapshot(doc(requireDb(), 'users', user.uid), (snapshot) => {
          if (!active || currentRevision !== revision) return
          setProfile(snapshot.exists() ? snapshot.data() as DaymarkUser : null)
          setLoading(false)
        }, () => {
          if (!active || currentRevision !== revision) return
          setProfileError('프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
          setLoading(false)
        })
      } catch {
        if (!active || currentRevision !== revision) return
        setProfileError('프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
        setLoading(false)
      }
    })
    return () => {
      active = false
      revision += 1
      unsubscribeAuth()
      unsubscribeProfile?.()
    }
  }, [])

  const value = useMemo(
    () => ({
      currentUser,
      profile,
      profileError,
      loading,
      firebaseReady: Boolean(auth) && isFirebaseConfigured,
      refreshProfile,
    }),
    [currentUser, loading, profile, profileError, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
