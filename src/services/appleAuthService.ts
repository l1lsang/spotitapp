import Constants from 'expo-constants'
import { randomUUID } from 'expo-crypto'
import { Platform } from 'react-native'
import { OAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, revokeAccessToken, signInWithCredential, signInWithPopup, updateProfile, type User } from 'firebase/auth'
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
    return { credential: appleProvider().credential({ idToken: result.idToken, rawNonce }), displayName: result.displayName, authorizationCode: result.authorizationCode }
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

/** Token that lets Firebase revoke this app's Apple authorization when the account is deleted. */
export interface AppleRevocation { token: string; type: 'CODE' | 'ACCESS_TOKEN' }

export async function reauthenticateWithApple(user: User): Promise<AppleRevocation | undefined> {
  if (requireAuth().currentUser?.uid !== user.uid) {
    throw Object.assign(new Error('다시 로그인한 뒤 인증해 주세요.'), { code: 'auth/requires-recent-login' })
  }
  if (Platform.OS === 'web') {
    const result = await reauthenticateWithPopup(user, appleProvider())
    const accessToken = OAuthProvider.credentialFromResult(result)?.accessToken
    return accessToken ? { token: accessToken, type: 'ACCESS_TOKEN' } : undefined
  }
  const { credential, authorizationCode } = await appleCredential()
  await reauthenticateWithCredential(user, credential)
  return authorizationCode ? { token: authorizationCode, type: 'CODE' } : undefined
}

// Apple asks apps to revoke Sign in with Apple tokens on account deletion. Firebase's JS SDK
// only sends access tokens, so native authorization codes use the same REST endpoint directly.
// Revocation is best effort: it must never keep a user from deleting their account.
export async function revokeAppleAuthorization(user: User, revocation: AppleRevocation): Promise<void> {
  try {
    const auth = requireAuth()
    if (revocation.type === 'ACCESS_TOKEN') { await revokeAccessToken(auth, revocation.token); return }
    const endpoint = `https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${encodeURIComponent(auth.app.options.apiKey || '')}`
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'apple.com', tokenType: 'CODE', token: revocation.token, idToken: await user.getIdToken() }),
    })
    if (!response.ok && __DEV__) console.warn('Apple token revocation failed', response.status)
  } catch (error) {
    if (__DEV__) console.warn('Apple token revocation failed', error)
  }
}
