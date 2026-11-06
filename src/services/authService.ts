import Constants from 'expo-constants'
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto'
import { Platform } from 'react-native'
import {
  createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, GoogleAuthProvider,
  OAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail,
  signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signOut,
  type AuthCredential, type User,
} from 'firebase/auth'
import { requireAuth } from '../lib/firebase'
import { getSignupRequirementsError, type SignupRequirements } from '../lib/signupRequirements'
import { deleteIncompleteAccountData, deleteUserAccountData, upsertUserProfile } from './userService'
import { disablePushNotifications } from './pushNotificationService'
import { reauthenticateWithApple, revokeAppleAuthorization, signInWithApple, type AppleRevocation } from './appleAuthService'

export class AuthCancelledError extends Error {
  code = 'auth/cancelled'
  constructor() { super('로그인을 취소했습니다.') }
}

export type LoginProvider = 'email' | 'google' | 'kakao' | 'apple'

export function authErrorMessage(error: unknown, fallback = '잠시 후 다시 시도해 주세요.', provider?: LoginProvider): string {
  const code = (error as { code?: string })?.code || ''
  if (provider && provider !== 'email' && ['auth/invalid-credential', 'auth/invalid-oauth-client-id', 'auth/missing-or-invalid-nonce'].includes(code)) {
    return `${provider === 'kakao' ? '카카오' : provider === 'apple' ? '애플' : '구글'} 인증을 확인하지 못했습니다. 다시 로그인해 주세요.`
  }
  const messages: Record<string, string> = {
    'auth/invalid-email': '올바른 이메일 주소를 입력해 주세요.',
    'auth/invalid-credential': '이메일 또는 비밀번호를 확인해 주세요.',
    'auth/wrong-password': '이메일 또는 비밀번호를 확인해 주세요.',
    'auth/user-not-found': '이메일 또는 비밀번호를 확인해 주세요.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다. 로그인해 주세요.',
    'auth/weak-password': '비밀번호는 6자 이상으로 입력해 주세요.',
    'auth/too-many-requests': '시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요.',
    'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
    'auth/account-exists-with-different-credential': '같은 이메일로 가입한 계정이 있습니다. 기존 로그인 방법을 이용해 주세요.',
    'auth/requires-recent-login': '계정 보호를 위해 다시 인증한 뒤 탈퇴해 주세요.',
    'auth/operation-not-allowed': '이 로그인 방법은 아직 준비되지 않았습니다. 이메일 로그인을 이용해 주세요.',
    'auth/popup-blocked': '로그인 창이 차단되었습니다. 브라우저의 팝업을 허용한 뒤 다시 시도해 주세요.',
    'auth/user-mismatch': '현재 로그인한 계정과 같은 계정으로 인증해 주세요.',
  }
  return messages[code] || (error instanceof Error ? error.message : fallback)
}

function assertNativeProvider() {
  if (Constants.appOwnership === 'expo') throw new Error('소셜 로그인은 설치된 피노리 앱에서 이용할 수 있습니다. 현재는 이메일로 로그인해 주세요.')
}

let googleConfigured = false
async function googleCredential(): Promise<AuthCredential> {
  assertNativeProvider()
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  if (!webClientId) throw new Error('구글 로그인이 아직 준비되지 않았습니다. 이메일로 로그인해 주세요.')
  const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin')
  if (!googleConfigured) {
    GoogleSignin.configure({ webClientId, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID })
    googleConfigured = true
  }
  if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  const result = await GoogleSignin.signIn()
  if (!isSuccessResponse(result)) throw new AuthCancelledError()
  if (!result.data.idToken) throw new Error('구글 인증 정보를 받지 못했습니다. 다시 시도해 주세요.')
  return GoogleAuthProvider.credential(result.data.idToken)
}

async function nativeKakaoLogin(reauthenticate = false) {
  assertNativeProvider()
  if (!process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY) throw new Error('카카오 로그인이 아직 준비되지 않았습니다. 이메일로 로그인해 주세요.')
  const { exchangeKakaoToken } = await import('./kakaoAuthService')
  const { login, loginWithKakaoAccount } = await import('@react-native-seoul/kakao-login')
  const rawNonce = `${randomUUID()}${randomUUID()}`
  const nonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, rawNonce)
  const token = await login({ nonce })
  if (!token.idToken) throw new Error('카카오 인증 정보를 받지 못했습니다. 다른 로그인 방법을 이용해 주세요.')
  // The native token audience differs from the existing web OIDC client ID.
  // The server validates it and resolves the same linked Firebase account.
  try { return await exchangeKakaoToken(token.idToken, rawNonce, reauthenticate) }
  catch (error) {
    // Older Android SDK builds dropped nonce in the KakaoTalk path. Use the
    // account flow once in that case; never skip nonce verification.
    if ((error as { details?: { reason?: string } }).details?.reason !== 'nonce-mismatch') throw error
    const retryRawNonce = `${randomUUID()}${randomUUID()}`
    const retryNonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, retryRawNonce)
    const retryToken = await loginWithKakaoAccount({ nonce: retryNonce })
    if (!retryToken.idToken) throw new Error('카카오 인증 정보를 받지 못했습니다. 다시 로그인해 주세요.')
    return exchangeKakaoToken(retryToken.idToken, retryRawNonce, reauthenticate)
  }
}

export async function signupWithEmail(
  email: string,
  password: string,
  requirements: SignupRequirements,
): Promise<User> {
  const error = getSignupRequirementsError(requirements)
  if (error) throw new Error(error)
  const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password)

  return credential.user
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(requireAuth(), email.trim(), password)
  await upsertUserProfile(credential.user)

  return credential.user
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(requireAuth(), email.trim())
}

export async function loginWithKakao(): Promise<User> {
  const credential = Platform.OS === 'web'
    ? await signInWithPopup(requireAuth(), new OAuthProvider(process.env.EXPO_PUBLIC_FIREBASE_KAKAO_PROVIDER_ID || 'oidc.kakao'))
    : await nativeKakaoLogin()
  await upsertUserProfile(credential.user)

  return credential.user
}

export async function loginWithGoogle(): Promise<User> {
  const credential = Platform.OS === 'web'
    ? await signInWithPopup(requireAuth(), new GoogleAuthProvider())
    : await signInWithCredential(requireAuth(), await googleCredential())
  await upsertUserProfile(credential.user)
  return credential.user
}

export async function loginWithApple(): Promise<User> {
  const user = await signInWithApple()
  await upsertUserProfile(user)
  return user
}

export async function logout(): Promise<void> {
  const uid = requireAuth().currentUser?.uid
  // Remove this installation's token while Firestore permissions still allow it.
  // If removal fails, keep the account signed in so logout can be retried safely.
  if (uid) await disablePushNotifications(uid)
  await signOut(requireAuth())
  if (googleConfigured && Platform.OS !== 'web') {
    try { const { GoogleSignin } = await import('@react-native-google-signin/google-signin'); await GoogleSignin.signOut() } catch { /* Firebase session is already cleared. */ }
  }
  if (Constants.appOwnership !== 'expo' && Platform.OS !== 'web' && process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY) {
    try { const kakao = await import('@react-native-seoul/kakao-login'); await kakao.logout() } catch { /* There may be no Kakao session. */ }
  }
}

export async function reauthenticateAccount(user: User, password?: string): Promise<void> {
  const providers = user.providerData.map(item => item.providerId)
  if (providers.includes('password') && user.email) {
    if (!password) throw new Error('현재 비밀번호를 입력해 주세요.')
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
  } else if (providers.includes('google.com')) {
    if (Platform.OS === 'web') {
      const { reauthenticateWithPopup } = await import('firebase/auth')
      await reauthenticateWithPopup(user, new GoogleAuthProvider())
    } else await reauthenticateWithCredential(user, await googleCredential())
  } else if (providers.includes('apple.com')) {
    await reauthenticateWithApple(user)
  } else if (providers.some(id => id.startsWith('oidc.'))) {
    if (Platform.OS === 'web') {
      const { reauthenticateWithPopup } = await import('firebase/auth')
      await reauthenticateWithPopup(user, new OAuthProvider(process.env.EXPO_PUBLIC_FIREBASE_KAKAO_PROVIDER_ID || 'oidc.kakao'))
    } else {
      if (requireAuth().currentUser?.uid !== user.uid) throw new Error('다시 로그인한 뒤 인증해 주세요.')
      await nativeKakaoLogin(true)
    }
  } else {
    const error = new Error('로그아웃 후 다시 로그인하고 탈퇴해 주세요.')
    Object.assign(error, { code: 'auth/requires-recent-login' })
    throw error
  }
}

const RECENT_AUTH_MS = 4 * 60_000

function recentLoginError() {
  return Object.assign(new Error('계정 보호를 위해 다시 인증한 뒤 탈퇴해 주세요.'), { code: 'auth/requires-recent-login' })
}

/** True when Firebase will accept account deletion without asking the user to sign in again. */
export async function isRecentlyAuthenticated(user: User): Promise<boolean> {
  try {
    const authenticatedAt = Date.parse((await user.getIdTokenResult()).authTime)
    return Number.isFinite(authenticatedAt) && Date.now() - authenticatedAt <= RECENT_AUTH_MS
  } catch { return false }
}

export async function deleteAccount(user: User, options: { incomplete?: boolean; appleRevocation?: AppleRevocation } = {}): Promise<void> {
  // A custom-token reauthentication replaces Firebase's User instance. Use the
  // refreshed session only when it still belongs to the requested account.
  const currentUser = requireAuth().currentUser
  if (!currentUser || currentUser.uid !== user.uid) throw recentLoginError()
  // Validate recent authentication before deleting any profile data.
  const token = await currentUser.getIdTokenResult(true)
  const authenticatedAt = Date.parse(token.authTime)
  if (!Number.isFinite(authenticatedAt) || Date.now() - authenticatedAt > RECENT_AUTH_MS) throw recentLoginError()
  await disablePushNotifications(user.uid)
  // An unfinished signup has no posts or relations, and the member-only rules
  // would refuse the full cleanup queries; it only owns its own profile docs.
  if (options.incomplete) await deleteIncompleteAccountData(user.uid)
  else await deleteUserAccountData(user.uid)
  if (options.appleRevocation) await revokeAppleAuthorization(currentUser, options.appleRevocation)
  await deleteUser(currentUser)
}

/**
 * One-step deletion: asks for identity only when Firebase requires it. Apple accounts
 * always confirm with Apple (one Face ID / Touch ID tap) so the Apple link can be revoked.
 */
export async function deleteMyAccount(user: User, options: { password?: string; incomplete?: boolean } = {}): Promise<void> {
  const isApple = user.providerData.some(item => item.providerId === 'apple.com')
  let appleRevocation: AppleRevocation | undefined
  if (isApple) appleRevocation = await reauthenticateWithApple(user)
  else if (!await isRecentlyAuthenticated(user)) await reauthenticateAccount(user, options.password)
  await deleteAccount(user, { incomplete: options.incomplete, appleRevocation })
}
