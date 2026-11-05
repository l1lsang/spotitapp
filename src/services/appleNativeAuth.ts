// Metro selects the iOS/Android implementation in native builds.
export interface AppleSignInResult {
  idToken: string | null
  state: string | null
  displayName?: string
}

export async function nativeAppleSignIn(_rawNonce: string, _state: string): Promise<AppleSignInResult> {
  throw new Error('이 기기에서는 애플 로그인을 지원하지 않습니다.')
}
