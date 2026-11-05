import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto'
import type { AppleSignInResult } from './appleNativeAuth'

export async function nativeAppleSignIn(rawNonce: string, state: string): Promise<AppleSignInResult> {
  const apple = await import('expo-apple-authentication')
  if (!await apple.isAvailableAsync()) throw new Error('이 기기에서는 애플 로그인을 지원하지 않습니다.')
  const result = await apple.signInAsync({
    requestedScopes: [apple.AppleAuthenticationScope.FULL_NAME, apple.AppleAuthenticationScope.EMAIL],
    nonce: await digestStringAsync(CryptoDigestAlgorithm.SHA256, rawNonce),
    state,
  })
  return {
    idToken: result.identityToken,
    state: result.state,
    displayName: result.fullName ? apple.formatFullName(result.fullName).trim() : undefined,
  }
}
