import { useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { nativeApplicationVersion } from 'expo-application'
import { isFirebaseConfigured } from '../lib/firebase'
import { isNewerAppVersion, type AppRelease } from '../lib/appRelease'
import { subscribeToAppRelease } from '../services/appReleaseService'

export function useAppRelease() {
  const [release, setRelease] = useState<AppRelease | null>(null)

  useEffect(() => {
    const platform = Platform.OS
    if (__DEV__ || (platform !== 'android' && platform !== 'ios')
      || Constants.executionEnvironment === ExecutionEnvironment.StoreClient
      || !nativeApplicationVersion || !isFirebaseConfigured) return

    let disposed = false
    let stop: (() => void) | undefined
    let subscription = 0
    function disconnect() {
      subscription++
      stop?.()
      stop = undefined
      setRelease(null)
    }
    function connect() {
      disconnect()
      const current = subscription
      stop = subscribeToAppRelease(platform as 'android' | 'ios', next => {
        if (disposed || current !== subscription) return
        setRelease(next && isNewerAppVersion(next.version, nativeApplicationVersion!) ? next : null)
      }, () => {
        // Update checks must never prevent the app from opening, including offline.
        if (!disposed && current === subscription) setRelease(null)
      })
    }

    if (AppState.currentState === 'active' || AppState.currentState === null) connect()
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') connect()
      else disconnect()
    })
    return () => {
      disposed = true
      subscription++
      stop?.()
      listener.remove()
    }
  }, [])

  return { release, currentVersion: nativeApplicationVersion }
}
