const { createHash } = require('node:crypto')

class KakaoAuthError extends Error {
  constructor(reason) { super(reason); this.reason = reason }
}

let remoteKeys
async function verifyKakaoToken(data, audience, keys) {
  if (!audience) throw new KakaoAuthError('configuration')
  if (!data || typeof data.idToken !== 'string' || data.idToken.length > 16384 ||
      typeof data.rawNonce !== 'string' || data.rawNonce.length < 32 || data.rawNonce.length > 256 ||
      (data.reauthenticate !== undefined && typeof data.reauthenticate !== 'boolean')) {
    throw new KakaoAuthError('invalid-request')
  }
  const { createRemoteJWKSet, jwtVerify } = await import('jose')
  remoteKeys ||= createRemoteJWKSet(new URL('https://kauth.kakao.com/.well-known/jwks.json'), { timeoutDuration: 8000 })
  let payload
  try {
    ;({ payload } = await jwtVerify(data.idToken, keys || remoteKeys, {
      algorithms: ['RS256'], issuer: 'https://kauth.kakao.com', audience,
      requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: '5 minutes',
    }))
  } catch (error) {
    if (['ERR_JWKS_TIMEOUT', 'ERR_JWKS_FETCH_FAILED'].includes(error.code) || error instanceof TypeError) throw new KakaoAuthError('unavailable')
    throw new KakaoAuthError('invalid-token')
  }
  const expectedNonce = createHash('sha256').update(data.rawNonce).digest('hex')
  if (payload.nonce !== expectedNonce) throw new KakaoAuthError('nonce-mismatch')
  if (typeof payload.sub !== 'string' || !/^\d{1,64}$/.test(payload.sub)) throw new KakaoAuthError('invalid-token')
  return payload
}

async function findKakaoUser(auth, providerId, subject) {
  try { return await auth.getUserByProviderUid(providerId, subject) }
  catch (error) { if (error.code === 'auth/user-not-found') return null; throw error }
}

async function kakaoCustomToken(auth, payload, providerId, expectedUid) {
  if (!/^oidc\.[a-zA-Z0-9._-]+$/.test(providerId)) throw new KakaoAuthError('configuration')
  let user = await findKakaoUser(auth, providerId, payload.sub)
  // Reauthentication must never create an account or switch to another UID.
  if (expectedUid !== undefined && (!expectedUid || user?.uid !== expectedUid)) throw new KakaoAuthError('user-mismatch')
  if (!user) {
    // Reserve a deterministic namespace so retries and parallel app logins use
    // one pending account. Never merge identities just because emails match.
    const uid = 'kakao-native:' + createHash('sha256').update(providerId + '\0' + payload.sub).digest('hex')
    try { user = await auth.createUser({ uid }) }
    catch (error) {
      if (error.code !== 'auth/uid-already-exists') throw error
      user = await auth.getUser(uid)
    }
    if (user.disabled) throw new KakaoAuthError('user-disabled')
    const linked = user.providerData.some(item => item.providerId === providerId && item.uid === payload.sub)
    if (!linked) {
      if (user.providerData.length || user.email || user.phoneNumber) throw new KakaoAuthError('user-mismatch')
      try {
        user = await auth.updateUser(uid, {
          providerToLink: { providerId, uid: payload.sub },
          ...(typeof payload.nickname === 'string' && payload.nickname.length <= 256 ? { displayName: payload.nickname } : {}),
          ...(typeof payload.picture === 'string' && /^https:\/\//.test(payload.picture) ? { photoURL: payload.picture } : {}),
        })
      } catch (error) {
        // A concurrent web login may have linked this Kakao identity first.
        user = await findKakaoUser(auth, providerId, payload.sub)
        if (!user) throw error
      }
    }
  }
  if (user.disabled) throw new KakaoAuthError('user-disabled')
  // createCustomToken does not enforce enrolled MFA. Do not bypass it.
  if (user.multiFactor?.enrolledFactors?.length) throw new KakaoAuthError('mfa-required')
  return { customToken: await auth.createCustomToken(user.uid), uid: user.uid }
}

module.exports = { KakaoAuthError, verifyKakaoToken, kakaoCustomToken }
