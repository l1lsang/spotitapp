import Constants from 'expo-constants'
import { randomUUID } from 'expo-crypto'
import { Platform } from 'react-native'
import { OAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, signInWithCredential, signInWithPopup, updateProfile, type User } from 'firebase/auth'
import { requireAuth } from '../lib/firebase'
import { nativeAppleSignIn } from './appleNativeAuth'

function appleProvider() {
  const provider = new OAuthProvider('apple.com')
  provider.addScope('email')
  provider.addScope('name')
  return provider
}

async function appleCredential() {
  if (Constants.appOwnership === 'expo') throw new Error('애플 로그인은 설치된 피노리 앱에서 이용해 주세요. 현재는 이메일로 로그인할 수 있습니다.')
  const rawNonce = `${randomUUID()}${randomUUID()}`
  const state = randomUUID()
  try {
    const result = await nativeAppleSignIn(rawNonce, state)
    if (!result.idToken || result.state !== state) {
      throw Object.assign(new Error('애플 인증을 확인하지 못했습니다. 다시 로그인해 주세요.'), { code: 'auth/invalid-credential' })
    }
    return { credential: appleProvider().credential({ idToken: result.idToken, rawNonce }), displayName: result.displayName }
  } catch (error) {
    if (['ERR_REQUEST_CANCELED', 'E_SIGNIN_CANCELLED_ERROR'].includes(String((error as { code?: string })?.code))) {
      throw Object.assign(new Error('로그인을 취소했습니다.'), { code: 'auth/cancelled' })
    }
    throw error
  }
}

export async function signInWithApple(): Promise<User> {
  const auth = requireAuth()
  if (Platform.OS === 'web') return (await signInWithPopup(auth, appleProvider())).user
  const { credential, displayName } = await appleCredential()
  const { user } = await signInWithCredential(auth, credential)
  // Apple supplies the name only on the first authorization. Persist it without
  // overwriting an existing account's chosen display name.
  if (displayName && !user.displayName) await updateProfile(user, { displayName })
  return user
}

export async function reauthenticateWithApple(user: User): Promise<void> {
  if (requireAuth().currentUser?.uid !== user.uid) {
    throw Object.assign(new Error('다시 로그인한 뒤 인증해 주세요.'), { code: 'auth/requires-recent-login' })
  }
  if (Platform.OS === 'web') await reauthenticateWithPopup(user, appleProvider())
  else await reauthenticateWithCredential(user, (await appleCredential()).credential)
}
