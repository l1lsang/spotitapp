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
async function harness({ platform = 'ios', providerError, reauthError, response = {}, name = 'Apple User', existingName = '', available = true, ownership = 'standalone', env = {} } = {}) {
  const calls = []
  const user = { uid: 'apple-user', displayName: existingName, providerData: [{ providerId: 'apple.com' }] }
  const auth = { currentUser: user }
  let androidOptions
  const context = createContext({ URL, process: { env: { EXPO_PUBLIC_APPLE_SERVICE_ID: 'kr.spotitmap.signin', EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com', ...env } }, __DEV__: false })
  const stubs = {
    'expo-constants': { default: { appOwnership: ownership } },
    'expo-crypto': { randomUUID, CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async (_, value) => createHash('sha256').update(value).digest('hex') },
    'react-native': { Platform: { OS: platform } },
    'firebase/auth': {
      ...authSdk,
      signInWithCredential: async (target, credential) => { assert.equal(target, auth); calls.push({ kind: 'credential', credential }); return { user } },
      signInWithPopup: async (target, provider) => { assert.equal(target, auth); calls.push({ kind: 'popup', provider }); return { user } },
      reauthenticateWithCredential: async (target, credential) => { assert.equal(target, user); calls.push({ kind: 'reauth', credential }); if (reauthError) throw reauthError; return { user } },
      reauthenticateWithPopup: async (target, provider) => { assert.equal(target, user); calls.push({ kind: 'reauth-popup', provider }); return { user } },
      updateProfile: async (target, data) => { assert.equal(target, user); calls.push({ kind: 'name', ...data }); Object.assign(user, data) },
    },
    'expo-apple-authentication': {
      isAvailableAsync: async () => available,
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
      formatFullName: () => name,
      signInAsync: async options => {
        calls.push({ kind: 'ios', options })
        if (providerError) throw providerError
        return { identityToken: 'apple-id-token', state: options.state, fullName: name ? { givenName: name } : null, ...response }
      },
    },
    '@invertase/react-native-apple-authentication': { appleAuthAndroid: {
      isSupported: available, ResponseType: { ALL: 'ALL' }, Scope: { ALL: 'ALL' },
      configure: options => { androidOptions = options; calls.push({ kind: 'android', options }) },
      signIn: async () => {
        if (providerError) throw providerError
        return { id_token: 'apple-id-token', state: androidOptions.state, user: { name: { firstName: name } }, ...response }
      },
    } },
    [resolve(root, 'src/lib/firebase.ts')]: { requireAuth: () => auth },
    [resolve(root, 'src/services/userService.ts')]: { upsertUserProfile: async target => { calls.push({ kind: 'profile', uid: target.uid }) }, deleteUserAccountData: async () => assert.fail('Login must not delete data') },
    [resolve(root, 'src/services/pushNotificationService.ts')]: { disablePushNotifications: async () => {} },
  }
  const modules = new Map()
  function moduleId(specifier, from) {
    if (!specifier.startsWith('.')) return specifier
    const platformSuffix = specifier === './appleNativeAuth' && platform !== 'web' ? `.${platform}` : ''
    return resolve(dirname(from), `${specifier}${platformSuffix}.ts`)
  }
  async function load(id) {
    if (modules.has(id)) return modules.get(id)
    const stub = stubs[id]
    const module = stub ? new SyntheticModule(Object.keys(stub), function () {
      for (const [name, value] of Object.entries(stub)) this.setExport(name, value)
    }, { identifier: id, context }) : new SourceTextModule(ts.transpileModule(await readFile(id, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    }).outputText, { identifier: id, context, importModuleDynamically: async specifier => {
      const imported = await load(moduleId(specifier, id))
      if (imported.status === 'linked') await imported.evaluate()
      return imported
    } })
    modules.set(id, module)
    await module.link(specifier => load(moduleId(specifier, id)))
    return module
  }
  const module = await load(resolve(root, 'src/services/authService.ts'))
  await module.evaluate()
  return { service: module.namespace, calls, user, auth }
}

test('iOS sends SHA-256 nonce to Apple and the matching raw nonce to Firebase', async () => {
  const { service, calls, user } = await harness()
  assert.equal(await service.loginWithApple(), user)
  const options = calls.find(c => c.kind === 'ios').options
  const credential = calls.find(c => c.kind === 'credential').credential
  assert.equal(credential.providerId, 'apple.com')
  assert.equal(credential.idToken, 'apple-id-token')
  assert.equal(options.nonce, createHash('sha256').update(credential.nonce).digest('hex'))
  assert.equal(options.requestedScopes.length, 2)
  assert.equal(user.displayName, 'Apple User')
  assert.equal(calls.at(-1).kind, 'profile')
  await service.loginWithApple()
  const requests = calls.filter(c => c.kind === 'ios')
  assert.notEqual(requests[0].options.nonce, requests[1].options.nonce)
  assert.notEqual(requests[0].options.state, requests[1].options.state)
})

test('Android passes the raw nonce to its hashing SDK and uses the registered Services ID', async () => {
  const { service, calls } = await harness({ platform: 'android' })
  await service.loginWithApple()
  const { options } = calls.find(c => c.kind === 'android')
  assert.equal(options.clientId, 'kr.spotitmap.signin')
  assert.equal(options.redirectUri, 'https://test.firebaseapp.com/__/auth/handler')
  assert.equal(options.nonce, calls.find(c => c.kind === 'credential').credential.nonce)
  assert.equal(options.responseType, 'ALL')
})

test('web uses the Apple Firebase popup with name and email scopes without native imports', async () => {
  const { service, calls } = await harness({ platform: 'web' })
  await service.loginWithApple()
  assert.equal(calls[0].kind, 'popup')
  assert.equal(calls[0].provider.providerId, 'apple.com')
  assert.deepEqual(calls[0].provider.getScopes(), ['email', 'name'])
  assert.equal(calls.length, 2)
})

for (const [label, options] of [
  ['missing iOS token', { response: { identityToken: null } }],
  ['mismatched iOS state', { response: { state: 'other-request' } }],
  ['missing Android token', { platform: 'android', response: { id_token: undefined } }],
  ['mismatched Android state', { platform: 'android', response: { state: 'other-request' } }],
]) test(`${label} never reaches Firebase sign-in or profile writes`, async () => {
  const { service, calls } = await harness(options)
  await assert.rejects(service.loginWithApple(), error => error.code === 'auth/invalid-credential')
  assert.equal(calls.length, 1)
})

for (const [platform, code] of [['ios', 'ERR_REQUEST_CANCELED'], ['android', 'E_SIGNIN_CANCELLED_ERROR']]) {
  test(`${platform} cancellation is normalized without creating a session`, async () => {
    const { service, calls } = await harness({ platform, providerError: { code } })
    await assert.rejects(service.loginWithApple(), error => error.code === 'auth/cancelled')
    assert.equal(calls.length, 1)
  })
}

test('repeat authorization without a name preserves the existing display name', async () => {
  const { service, calls, user } = await harness({ name: '', existingName: 'Chosen nickname' })
  await service.loginWithApple()
  assert.equal(user.displayName, 'Chosen nickname')
  assert.equal(calls.some(c => c.kind === 'name'), false)
})

test('a supplied Apple name does not overwrite an existing name', async () => {
  const { service, calls } = await harness({ existingName: 'Chosen nickname' })
  await service.loginWithApple()
  assert.equal(calls.some(c => c.kind === 'name'), false)
})

for (const options of [{ ownership: 'expo' }, { available: false }, { platform: 'android', env: { EXPO_PUBLIC_APPLE_SERVICE_ID: '' } }, { platform: 'android', env: { EXPO_PUBLIC_APPLE_REDIRECT_URI: 'http://localhost/callback' } }]) {
  test(`unsupported or unconfigured login fails before native auth: ${JSON.stringify(options)}`, async () => {
    const { service, calls } = await harness(options)
    await assert.rejects(service.loginWithApple())
    assert.equal(calls.length, 0)
  })
}

for (const platform of ['ios', 'android', 'web']) {
  test(`${platform} reauthentication keeps the existing Firebase account`, async () => {
    const { service, calls, user } = await harness({ platform })
    await service.reauthenticateAccount(user)
    assert.equal(calls.at(-1).kind, platform === 'web' ? 'reauth-popup' : 'reauth')
    assert.equal(calls.some(c => ['credential', 'popup', 'profile'].includes(c.kind)), false)
  })
}

test('wrong Apple account fails reauthentication without replacing the Firebase session', async () => {
  const { service, calls, user, auth } = await harness({ reauthError: { code: 'auth/user-mismatch' } })
  await assert.rejects(service.reauthenticateAccount(user), error => error.code === 'auth/user-mismatch')
  assert.equal(auth.currentUser, user)
  assert.equal(calls.some(c => c.kind === 'credential'), false)
})

test('Apple credential errors use the social provider message', async () => {
  const { service } = await harness()
  assert.match(service.authErrorMessage({ code: 'auth/invalid-credential' }, '', 'apple'), /애플 인증/)
})
