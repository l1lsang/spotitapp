const admin = require('firebase-admin')
const { logger } = require('firebase-functions')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineString } = require('firebase-functions/params')
const { KakaoAuthError, verifyKakaoToken, kakaoCustomToken } = require('./kakaoAuthCore')

const nativeKey = defineString('KAKAO_NATIVE_APP_KEY', { default: '' })
const providerId = defineString('KAKAO_FIREBASE_PROVIDER_ID', { default: 'oidc.kakao' })
const failures = {
  configuration: ['failed-precondition', '카카오 로그인 연결을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.'],
  'invalid-request': ['invalid-argument', '카카오 인증 요청을 확인하지 못했습니다. 다시 로그인해 주세요.'],
  'invalid-token': ['unauthenticated', '카카오 인증이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.'],
  'nonce-mismatch': ['unauthenticated', '카카오 인증을 확인하지 못했습니다. 다시 로그인해 주세요.'],
  'user-mismatch': ['permission-denied', '현재 로그인한 카카오 계정으로 다시 인증해 주세요.'],
  'user-disabled': ['permission-denied', '사용이 중지된 계정입니다.'],
  'mfa-required': ['failed-precondition', '추가 인증이 필요한 계정입니다. 웹사이트에서 로그인해 주세요.'],
  unavailable: ['unavailable', '카카오 인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'],
}

exports.signInWithNativeKakao = onCall({ region: 'us-central1', timeoutSeconds: 30, maxInstances: 4 }, async request => {
  try {
    if (request.data?.reauthenticate && !request.auth) throw new KakaoAuthError('user-mismatch')
    const payload = await verifyKakaoToken(request.data, nativeKey.value().trim())
    return await kakaoCustomToken(admin.auth(), payload, providerId.value().trim(), request.data.reauthenticate ? request.auth.uid : undefined)
  } catch (error) {
    if (error instanceof KakaoAuthError) {
      const [code, message] = failures[error.reason]
      throw new HttpsError(code, message, { reason: error.reason })
    }
    // Provider errors can contain credentials. Never log request bodies or tokens.
    logger.error('Native Kakao authentication failed', { code: typeof error.code === 'string' && /^auth\/[a-z-]+$/.test(error.code) ? error.code : 'internal' })
    throw new HttpsError('internal', '카카오 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.')
  }
})
