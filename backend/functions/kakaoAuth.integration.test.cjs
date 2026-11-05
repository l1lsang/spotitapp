const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const admin = require('firebase-admin')
const { kakaoCustomToken } = require('./kakaoAuthCore')

assert.equal(process.env.GCLOUD_PROJECT, 'demo-spotit-kakao', 'Run with npm run test:kakao:integration')
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9291')
const app = admin.initializeApp({ projectId: 'demo-spotit-kakao' })
const auth = app.auth()
after(() => app.delete())

async function api(method, body) {
  const response = await fetch(`http://127.0.0.1:9291/identitytoolkit.googleapis.com/v1/accounts:${method}?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const result = await response.json()
  assert.equal(response.ok, true, result.error?.message)
  return result
}
async function webLogin(sub) {
  // The Auth emulator accepts unsigned OIDC tokens only inside this demo project.
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url')
  const idToken = `${encode({ alg: 'none' })}.${encode({ sub, iss: 'https://kauth.kakao.com', aud: 'web-test-key' })}.`
  return api('signInWithIdp', { requestUri: 'http://localhost', returnSecureToken: true, postBody: new URLSearchParams({ providerId: 'oidc.kakao', id_token: idToken }).toString() })
}

test('web → native → native reauthentication preserves the Firebase UID', async () => {
  const sub = 'web-' + randomUUID()
  const web = await webLogin(sub)
  const native = await kakaoCustomToken(auth, { sub }, 'oidc.kakao')
  const session = await api('signInWithCustomToken', { token: native.customToken, returnSecureToken: true })
  const account = await api('lookup', { idToken: session.idToken })
  assert.equal(account.users[0].localId, web.localId)
  assert.equal((await kakaoCustomToken(auth, { sub }, 'oidc.kakao', web.localId)).uid, web.localId)
  await assert.rejects(kakaoCustomToken(auth, { sub }, 'oidc.kakao', 'another-user'), error => error.reason === 'user-mismatch')
})

test('native first signup links the web provider and later web login reuses its UID', async () => {
  const sub = 'native-' + randomUUID()
  const native = await kakaoCustomToken(auth, { sub }, 'oidc.kakao')
  const session = await api('signInWithCustomToken', { token: native.customToken, returnSecureToken: true })
  const account = await api('lookup', { idToken: session.idToken })
  const user = await auth.getUser(account.users[0].localId)
  assert.equal(user.providerData.find(provider => provider.providerId === 'oidc.kakao').uid, sub)
  assert.equal((await webLogin(sub)).localId, native.uid)
})

test('a disabled existing Kakao account cannot log in through the native bridge', async () => {
  const sub = 'disabled-' + randomUUID()
  const web = await webLogin(sub)
  await auth.updateUser(web.localId, { disabled: true })
  await assert.rejects(kakaoCustomToken(auth, { sub }, 'oidc.kakao'), error => error.reason === 'user-disabled')
})
