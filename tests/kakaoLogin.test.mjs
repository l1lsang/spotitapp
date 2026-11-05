import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import { randomUUID, createHash } from 'node:crypto'
import ts from 'typescript'
import * as authSdk from 'firebase/auth'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
async function harness({ platform = 'android', error, responseUid = 'existing-kakao-user' } = {}) {
  const calls = []
  const user = { uid: 'existing-kakao-user', providerData: [{ providerId: 'oidc.kakao' }], getIdTokenResult: () => assert.fail('Use the refreshed user after custom-token reauthentication') }
  const auth = { currentUser: user }
  const context = createContext({ process: { env: { EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY: 'test-native-key' } }, __DEV__: false })
  const stubs = {
    'expo-constants': { default: { appOwnership: 'standalone' } },
    'expo-crypto': { randomUUID, CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async (_, value) => createHash('sha256').update(value).digest('hex') },
    'react-native': { Platform: { OS: platform } },
    'firebase/auth': {
      ...authSdk,
      signInWithCredential: async () => assert.fail('Native Kakao must not use the web OIDC audience'),
      signInWithPopup: async (_, provider) => { calls.push({ kind: 'popup', providerId: provider.providerId }); return { user } },
      signInWithCustomToken: async (_, token) => {
        calls.push({ kind: 'custom-token', token })
        auth.currentUser = { ...user, getIdTokenResult: async () => ({ authTime: new Date().toISOString() }) }
        return { user: auth.currentUser }
      },
      deleteUser: async target => { assert.equal(target, auth.currentUser); calls.push({ kind: 'delete-auth' }) },
    },
    'firebase/functions': {
      getFunctions: () => ({}), connectFunctionsEmulator: () => {},
      httpsCallable: (_, name) => async data => {
        calls.push({ kind: 'exchange', name, data })
        if (error) { const failure = error; error = undefined; throw failure }
        return { data: { customToken: 'test-firebase-token', uid: responseUid } }
      },
    },
    '@react-native-seoul/kakao-login': {
      login: async options => { calls.push({ kind: 'talk', ...options }); return { idToken: 'test-kakao-id-token' } },
      loginWithKakaoAccount: async options => { calls.push({ kind: 'account', ...options }); return { idToken: 'test-account-id-token' } },
    },
    [resolve(root, 'src/lib/firebase.ts')]: { firebaseApp: {}, emulatorHost: 'localhost', requireAuth: () => auth },
    [resolve(root, 'src/services/userService.ts')]: { upsertUserProfile: async () => {}, deleteUserAccountData: async () => { calls.push({ kind: 'delete-data' }) } },
    [resolve(root, 'src/services/pushNotificationService.ts')]: { disablePushNotifications: async () => {} },
  }
  const modules = new Map()
  async function load(id) {
    if (modules.has(id)) return modules.get(id)
    const stub = stubs[id]
    const module = stub ? new SyntheticModule(Object.keys(stub), function () {
      for (const [name, value] of Object.entries(stub)) this.setExport(name, value)
    }, { identifier: id, context }) : new SourceTextModule(ts.transpileModule(await readFile(id, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    }).outputText, { identifier: id, context, importModuleDynamically: async specifier => {
      const imported = await load(specifier.startsWith('.') ? resolve(dirname(id), specifier + '.ts') : specifier)
      if (imported.status === 'linked') await imported.evaluate()
      return imported
    } })
    modules.set(id, module)
    await module.link(specifier => load(specifier.startsWith('.') ? resolve(dirname(id), specifier + '.ts') : specifier))
    return module
  }
  const module = await load(resolve(root, 'src/services/authService.ts'))
  await module.evaluate()
  return { service: module.namespace, calls, user, auth }
}

test('Android exchanges its native token and hashed nonce for the existing Firebase session', async () => {
  const { service, calls } = await harness()
  assert.equal((await service.loginWithKakao()).uid, 'existing-kakao-user')
  const request = calls.find(call => call.kind === 'exchange')
  assert.equal(request.name, 'signInWithNativeKakao')
  assert.equal(request.data.idToken, 'test-kakao-id-token')
  assert.equal(request.data.reauthenticate, false)
  assert.equal(createHash('sha256').update(request.data.rawNonce).digest('hex'), calls[0].nonce)
  assert.equal(calls.at(-1).kind, 'custom-token')
})
test('web Kakao still uses the existing OIDC popup', async () => {
  const { service, calls } = await harness({ platform: 'web' })
  await service.loginWithKakao()
  assert.deepEqual(calls, [{ kind: 'popup', providerId: 'oidc.kakao' }])
})
test('old Android nonce failure retries once through Kakao Account with a fresh nonce', async () => {
  const { service, calls } = await harness({ error: { code: 'functions/unauthenticated', details: { reason: 'nonce-mismatch' } } })
  await service.loginWithKakao()
  assert.equal(calls.filter(call => call.kind === 'account').length, 1)
  const requests = calls.filter(call => call.kind === 'exchange')
  assert.equal(requests.length, 2)
  assert.notEqual(requests[0].data.rawNonce, requests[1].data.rawNonce)
  assert.equal(requests[1].data.idToken, 'test-account-id-token')
})
test('server failure does not trigger a second provider login or a Firebase session', async () => {
  const { service, calls } = await harness({ error: { code: 'functions/unavailable' } })
  await assert.rejects(service.loginWithKakao(), /카카오 로그인 서버/)
  assert.equal(calls.length, 2)
})
test('reauthentication cannot replace the current user with a different returned UID', async () => {
  const { service, calls, user } = await harness({ responseUid: 'another-user' })
  await assert.rejects(service.reauthenticateAccount(user), /현재 로그인한 카카오 계정/)
  assert.equal(calls.find(call => call.kind === 'exchange').data.reauthenticate, true)
  assert.equal(calls.some(call => call.kind === 'custom-token'), false)
})
test('invalid social credentials do not display an email/password error', async () => {
  const { service } = await harness()
  const error = { code: 'auth/invalid-credential' }
  assert.match(service.authErrorMessage(error, '', 'kakao'), /카카오 인증/)
  assert.match(service.authErrorMessage(error, '', 'google'), /구글 인증/)
  assert.equal(service.authErrorMessage(error, '', 'email'), '이메일 또는 비밀번호를 확인해 주세요.')
})
test('account deletion uses the refreshed custom-token session after reauthentication', async () => {
  const { service, calls, user } = await harness()
  await service.reauthenticateAccount(user)
  await service.deleteAccount(user)
  assert.equal(calls.at(-2).kind, 'delete-data')
  assert.equal(calls.at(-1).kind, 'delete-auth')
})
test('account deletion rejects a changed current account before deleting data', async () => {
  const { service, calls, user, auth } = await harness()
  auth.currentUser = { uid: 'another-user' }
  await assert.rejects(service.deleteAccount(user), error => error.code === 'auth/requires-recent-login')
  assert.equal(calls.length, 0)
})
