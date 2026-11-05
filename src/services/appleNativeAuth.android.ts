import type { AppleSignInResult } from './appleNativeAuth'

export async function nativeAppleSignIn(rawNonce: string, state: string): Promise<AppleSignInResult> {
  const clientId = process.env.EXPO_PUBLIC_APPLE_SERVICE_ID?.trim()
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim()
  const redirectUri = process.env.EXPO_PUBLIC_APPLE_REDIRECT_URI?.trim()
    || (authDomain ? `https://${authDomain}/__/auth/handler` : '')
  if (!clientId || !redirectUri) throw new Error('애플 로그인이 아직 준비되지 않았습니다. 다른 로그인 방법을 이용해 주세요.')
  const redirect = new URL(redirectUri)
  if (redirect.protocol !== 'https:' || redirect.hostname === 'localhost' || /^[\d.]+$/.test(redirect.hostname) || redirect.username || redirect.password || redirect.hash) {
    throw new Error('애플 로그인 연결 설정을 확인해 주세요. 다른 로그인 방법을 이용할 수 있습니다.')
  }
  const { appleAuthAndroid } = await import('@invertase/react-native-apple-authentication')
  if (!appleAuthAndroid.isSupported) throw new Error('이 기기에서는 애플 로그인을 지원하지 않습니다.')
  appleAuthAndroid.configure({
    clientId,
    redirectUri,
    responseType: appleAuthAndroid.ResponseType.ALL,
    scope: appleAuthAndroid.Scope.ALL,
    // This SDK hashes the nonce itself; Firebase must receive the original value.
    nonce: rawNonce,
    state,
  })
  const result = await appleAuthAndroid.signIn()
  return {
    idToken: result.id_token || null,
    state: result.state,
    displayName: [result.user?.name?.firstName, result.user?.name?.lastName].filter(Boolean).join(' ').trim() || undefined,
  }
}
