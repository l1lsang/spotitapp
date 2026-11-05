const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { createHash, randomUUID } = require('node:crypto')
const { verifyKakaoToken, kakaoCustomToken } = require('./kakaoAuthCore')

let jose, pair
const rawNonce = randomUUID() + randomUUID()
const nonce = createHash('sha256').update(rawNonce).digest('hex')
before(async () => { jose = await import('jose'); pair = await jose.generateKeyPair('RS256') })
async function signed(overrides = {}, privateKey = pair.privateKey) {
  const now = Math.floor(Date.now() / 1000)
  return new jose.SignJWT({ iss: 'https://kauth.kakao.com', aud: 'native-test-key', sub: '12345', iat: now, exp: now + 3600, nonce, ...overrides })
    .setProtectedHeader({ alg: 'RS256' }).sign(privateKey)
}
const rejectReason = reason => error => error.reason === reason
test('verifies a signed native Kakao ID token and the request nonce', async () => {
  const claims = await verifyKakaoToken({ idToken: await signed(), rawNonce }, 'native-test-key', pair.publicKey)
  assert.equal(claims.sub, '12345')
})
for (const [label, claims] of [
  ['another app audience', { aud: 'other-app-key' }],
  ['wrong issuer', { iss: 'https://attacker.example' }],
  ['expired token', { exp: 1 }],
  ['missing expiration', { exp: undefined }],
  ['missing issued-at', { iat: undefined }],
  ['old token', { iat: Math.floor(Date.now() / 1000) - 600 }],
  ['invalid subject', { sub: 'admin' }],
]) test(`rejects ${label}`, async () => {
  await assert.rejects(verifyKakaoToken({ idToken: await signed(claims), rawNonce }, 'native-test-key', pair.publicKey), rejectReason('invalid-token'))
})
test('rejects a forged signature', async () => {
  const other = await jose.generateKeyPair('RS256')
  await assert.rejects(verifyKakaoToken({ idToken: await signed({}, other.privateKey), rawNonce }, 'native-test-key', pair.publicKey), rejectReason('invalid-token'))
})
test('rejects missing or mismatched nonce without disabling verification', async () => {
  for (const badNonce of [undefined, 'other-nonce']) await assert.rejects(verifyKakaoToken({ idToken: await signed({ nonce: badNonce }), rawNonce }, 'native-test-key', pair.publicKey), rejectReason('nonce-mismatch'))
})
test('fails closed without server configuration and rejects malformed input', async () => {
  await assert.rejects(verifyKakaoToken({}, ''), rejectReason('configuration'))
  for (const data of [null, {}, { idToken: 'x', rawNonce: 'short' }, { idToken: 'x', rawNonce, reauthenticate: 'false' }]) {
    await assert.rejects(verifyKakaoToken(data, 'native-test-key'), rejectReason('invalid-request'))
  }
})

const providerId = 'oidc.kakao'
const subject = '12345'
function harness(initial = []) {
  const users = new Map(initial.map(user => [user.uid, { providerData: [], ...user }]))
  const issued = []
  const error = code => Object.assign(new Error(code), { code })
  const auth = {
    async getUserByProviderUid(provider, sub) {
      const user = [...users.values()].find(user => user.providerData.some(item => item.providerId === provider && item.uid === sub))
      if (!user) throw error('auth/user-not-found')
      return user
    },
    async getUser(uid) { if (!users.has(uid)) throw error('auth/user-not-found'); return users.get(uid) },
    async createUser(data) {
      if (users.has(data.uid)) throw error('auth/uid-already-exists')
      const user = { ...data, providerData: [] }; users.set(user.uid, user); return user
    },
    async updateUser(uid, { providerToLink, ...data }) {
      users.set(uid, { ...users.get(uid), ...data, providerData: [providerToLink] })
      return users.get(uid)
    },
    async createCustomToken(uid) { issued.push(uid); return 'test-custom-token' },
  }
  return { auth, users, issued }
}
test('uses the existing web Kakao UID without creating another user', async () => {
  const { auth, users, issued } = harness([{ uid: 'existing-web-user', providerData: [{ providerId, uid: subject }] }])
  const result = await kakaoCustomToken(auth, { sub: subject }, providerId)
  assert.equal(result.uid, 'existing-web-user')
  assert.equal(users.size, 1)
  assert.deepEqual(issued, ['existing-web-user'])
})
test('concurrent first app logins link one account to the existing web provider', async () => {
  const { auth, users } = harness()
  const results = await Promise.all(Array.from({ length: 5 }, () => kakaoCustomToken(auth, { sub: subject }, providerId)))
  assert.equal(new Set(results.map(result => result.uid)).size, 1)
  assert.equal(users.size, 1)
  assert.equal((await auth.getUserByProviderUid(providerId, subject)).uid, results[0].uid)
})
test('does not merge a different account based on matching email', async () => {
  const { auth, users } = harness([{ uid: 'email-user', email: 'same@example.com', providerData: [{ providerId: 'password', uid: 'same@example.com' }] }])
  const result = await kakaoCustomToken(auth, { sub: subject, email: 'same@example.com' }, providerId)
  assert.notEqual(result.uid, 'email-user')
  assert.equal(users.get('email-user').providerData[0].providerId, 'password')
})
test('a failed provider link can be retried without issuing an unlinked session', async () => {
  const { auth, users, issued } = harness()
  const update = auth.updateUser
  auth.updateUser = async () => { throw new Error('temporary link failure') }
  await assert.rejects(kakaoCustomToken(auth, { sub: subject }, providerId))
  assert.equal(issued.length, 0)
  auth.updateUser = update
  await kakaoCustomToken(auth, { sub: subject }, providerId)
  assert.equal(users.size, 1)
  assert.equal(issued.length, 1)
})
test('resolves the winner when a web login links the identity concurrently', async () => {
  const { auth, users } = harness()
  auth.updateUser = async () => {
    users.set('web-winner', { uid: 'web-winner', providerData: [{ providerId, uid: subject }] })
    throw new Error('provider already linked')
  }
  assert.equal((await kakaoCustomToken(auth, { sub: subject }, providerId)).uid, 'web-winner')
})
test('reauthentication rejects another account or a missing account before writes', async () => {
  const { auth, users, issued } = harness([{ uid: 'existing-user', providerData: [{ providerId, uid: subject }] }])
  await assert.rejects(kakaoCustomToken(auth, { sub: subject }, providerId, 'other-user'), rejectReason('user-mismatch'))
  await assert.rejects(kakaoCustomToken(auth, { sub: '99999' }, providerId, 'existing-user'), rejectReason('user-mismatch'))
  assert.equal(users.size, 1)
  assert.equal(issued.length, 0)
  assert.equal((await kakaoCustomToken(auth, { sub: subject }, providerId, 'existing-user')).uid, 'existing-user')
})
test('disabled accounts and enrolled MFA do not receive custom tokens', async () => {
  for (const [settings, reason] of [[{ disabled: true }, 'user-disabled'], [{ multiFactor: { enrolledFactors: [{}] } }, 'mfa-required']]) {
    const { auth, issued } = harness([{ uid: 'existing-user', providerData: [{ providerId, uid: subject }], ...settings }])
    await assert.rejects(kakaoCustomToken(auth, { sub: subject }, providerId), rejectReason(reason))
    assert.equal(issued.length, 0)
  }
})
