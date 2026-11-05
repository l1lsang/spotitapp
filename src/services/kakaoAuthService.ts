import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { signInWithCustomToken } from 'firebase/auth'
import { emulatorHost, firebaseApp, requireAuth } from '../lib/firebase'

let client: Functions | undefined
export async function exchangeKakaoToken(idToken: string, rawNonce: string, reauthenticate: boolean) {
  if (!firebaseApp) throw new Error('로그인 연결을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.')
  if (!client) {
    client = getFunctions(firebaseApp, 'us-central1')
    if (__DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true') connectFunctionsEmulator(client, emulatorHost, 5001)
  }
  const exchange = httpsCallable<{ idToken: string; rawNonce: string; reauthenticate: boolean }, { customToken: string; uid: string }>(client, 'signInWithNativeKakao')
  const auth = requireAuth()
  const expectedUid = reauthenticate ? auth.currentUser?.uid : undefined
  if (reauthenticate && !expectedUid) throw new Error('다시 로그인한 뒤 인증해 주세요.')
  let data
  try { ({ data } = await exchange({ idToken, rawNonce, reauthenticate })) }
  catch (error) {
    if (['functions/not-found', 'functions/unavailable', 'functions/internal'].includes((error as { code?: string }).code || '')) {
      throw new Error('카카오 로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }
    throw error
  }
  if (reauthenticate && (data.uid !== expectedUid || auth.currentUser?.uid !== expectedUid)) throw new Error('현재 로그인한 카카오 계정으로 다시 인증해 주세요.')
  return signInWithCustomToken(auth, data.customToken)
}
