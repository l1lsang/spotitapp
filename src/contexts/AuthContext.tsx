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
import { clearRemoteImageCache } from '../components/RemoteImage'

export function AuthProvider({ children }: PropsWithChildren): ReactElement {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<DaymarkUser | null>(null)
  const [profileError, setProfileError] = useState('')
  const [profileRetry, setProfileRetry] = useState(0)
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
      setProfileRetry(value => value + 1)
    }
  }, [])

  useEffect(() => {
    if (!auth || !isFirebaseConfigured) {
      return undefined
    }

    let active = true
    let revision = 0
    let previousUid: string | null | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      invalidateAppReads()
      // Restoring the same session at launch keeps the photo cache; a sign-out or account switch clears it.
      if (previousUid && previousUid !== user?.uid) void clearRemoteImageCache()
      previousUid = user?.uid ?? null
      const currentRevision = ++revision
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
    }
  }, [])

  const profileUid = profile?.uid
  const currentUid = currentUser?.uid
  useEffect(() => {
    if (!currentUid || profileUid !== currentUid) return
    // Attach only after upsert succeeds. A successful retry also restores a
    // listener that Firestore closed after a permission/network failure.
    return onSnapshot(doc(requireDb(), 'users', currentUid), snapshot => {
      setProfile(snapshot.exists() ? snapshot.data() as DaymarkUser : null)
      setProfileError(snapshot.exists() ? '' : '프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }, () => {
      setProfileError('프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    })
  }, [currentUid, profileUid, profileRetry])

  const value = useMemo(
    () => ({
      currentUser,
      profile,
      profileError,
      loading,
      firebaseReady: Boolean(auth) && isFirebaseConfigured,
      accountReady: Boolean(currentUser && profile && profile.uid === currentUser.uid && profile.onboardingComplete !== false && !loading && !profileError),
      refreshProfile,
    }),
    [currentUser, loading, profile, profileError, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
