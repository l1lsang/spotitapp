const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const protocol = require('./nativePushProtocol')

function harness(responses) {
  let now = 1_800_000_000_000
  const records = new Map()
  const requests = []
  const logs = []
  const deleted = Symbol('delete')
  class Stamp {
    constructor(value) { this.value = value }
    static now() { return new Stamp(now) }
    static fromMillis(value) { return new Stamp(value) }
    toMillis() { return this.value }
  }
  class FakeDate extends Date { static now() { return now } }
  const ref = path => ({
    path, id: path.split('/').at(-1),
    async create(data) { if (records.has(path)) throw Object.assign(new Error('exists'), { code: 6 }); records.set(path, { ...data }) },
    async get() { return snapshot(path) },
    async update(data) {
      if (!records.has(path)) throw new Error(`Missing ${path}`)
      const current = { ...records.get(path) }
      Object.entries(data).forEach(([key, value]) => { if (value === deleted) delete current[key]; else current[key] = value })
      records.set(path, current)
    },
    async delete() { records.delete(path) },
    collection(name) { return collection(`${path}/${name}`) },
  })
  const snapshot = path => ({
    id: path.split('/').at(-1), ref: ref(path), exists: records.has(path), data: () => records.get(path),
  })
  function collection(path, filters = [], sort, maximum) {
    return {
      doc: id => ref(`${path}/${id}`),
      where: (key, operator, value) => collection(path, [...filters, [key, operator, value]], sort, maximum),
      orderBy: key => collection(path, filters, key, maximum),
      limit: count => collection(path, filters, sort, count),
      async get() {
        let entries = [...records.entries()].filter(([key]) => key.startsWith(`${path}/`) && key.slice(path.length + 1).indexOf('/') < 0)
        for (const [key, operator, value] of filters) entries = entries.filter(([, data]) => data[key] && operator === '<=' && data[key].toMillis() <= value.toMillis())
        if (sort) entries.sort((a, b) => a[1][sort].toMillis() - b[1][sort].toMillis())
        if (maximum) entries = entries.slice(0, maximum)
        return { docs: entries.map(([key]) => snapshot(key)) }
      },
    }
  }
  const db = { collection, doc: ref, async runTransaction(handler) { return handler({ get: target => target.get(), update: (target, value) => target.update(value), delete: target => target.delete() }) } }
  const admin = { firestore: Object.assign(() => db, { Timestamp: Stamp, FieldValue: { delete: () => deleted } }) }
  const sandbox = {
    exports: {}, Date: FakeDate, process: { env: {} }, AbortSignal,
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) })
      const response = responses.shift()
      if (response instanceof Error) throw response
      if (!response) throw new Error('Unexpected fetch')
      return { ok: response.status === undefined || response.status < 400, status: response.status || 200, json: async () => response.body }
    },
    require(name) {
      if (name === 'node:crypto') return require(name)
      if (name === 'firebase-admin') return admin
      if (name === './nativePushProtocol') return protocol
      if (name === 'firebase-functions') return { logger: Object.fromEntries(['info', 'warn', 'error'].map(level => [level, (...args) => logs.push({ level, args })])) }
      if (name === 'firebase-functions/v2/firestore') return { onDocumentCreated: (_options, handler) => handler }
      if (name === 'firebase-functions/v2/scheduler') return { onSchedule: (_options, handler) => handler }
      throw new Error(`Unexpected module ${name}`)
    },
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('./nativePush.js'), 'utf8'), sandbox)
  const token = 'ExpoPushToken[valid-device-token]'
  records.set('users/alice', { nickname: '앨리스' })
  records.set('users/alice/expoPushTokens/device', { token, platform: 'ios' })
  const event = { params: { recipientUid: 'alice', notificationId: 'notice-123' }, data: { data: () => ({ title: '새 메시지', message: '안녕하세요', href: '/chats/room?message=1', type: 'chat' }) } }
  return {
    records, requests, logs, token,
    dispatch: () => sandbox.exports.sendNativePushForNotification(event),
    tick: async minutes => { now += minutes * 60_000; await sandbox.exports.processNativePushQueue() },
    jobs: () => [...records.entries()].filter(([path]) => path.startsWith('nativePushQueue/')).map(([, data]) => data),
  }
}

test('ticket acceptance waits for receipts and provider acceptance does not claim delivery', async () => {
  const app = harness([
    { body: { data: [{ status: 'ok', id: 'receipt-1' }] } },
    { body: { data: { 'receipt-1': { status: 'ok' } } } },
  ])
  await app.dispatch()
  assert.equal(app.jobs()[0].state, 'receipt')
  assert.equal(app.requests[0].body[0].data.href, '/chats/room?message=1')
  await app.tick(10)
  assert.equal(app.requests.length, 1)
  await app.tick(5)
  assert.equal(app.jobs()[0].state, 'provider_accepted')
  assert.equal(app.jobs()[0].token, undefined)
  assert.equal(app.jobs()[0].nextAttemptAt, undefined)
})

test('duplicate Firestore events queue and send a notification only once per device', async () => {
  const app = harness([{ body: { data: [{ status: 'ok', id: 'receipt-1' }] } }])
  await app.dispatch()
  await app.dispatch()
  assert.equal(app.jobs().length, 1)
  assert.equal(app.requests.length, 1)
})

test('an HTTP 429 remains queued and a disabled token cancels its retry', async () => {
  const app = harness([{ status: 429, body: { errors: [{ code: 'TOO_MANY_REQUESTS' }] } }])
  await app.dispatch()
  assert.equal(app.jobs()[0].state, 'pending')
  assert.equal(app.jobs()[0].attempts, 1)
  app.records.delete('users/alice/expoPushTokens/device')
  await app.tick(5)
  assert.equal(app.jobs()[0].state, 'cancelled')
  assert.equal(app.requests.length, 1)
})

test('transient network failure retries while permanent HTTP rejection stops', async () => {
  const app = harness([new Error('offline'), { status: 400, body: { errors: [{ code: 'INVALID_MESSAGE' }] } }])
  await app.dispatch()
  assert.equal(app.jobs()[0].state, 'pending')
  await app.tick(5)
  assert.equal(app.jobs()[0].state, 'failed')
  assert.equal(app.jobs()[0].errorCode, 'INVALID_MESSAGE')
  await app.tick(60)
  assert.equal(app.requests.length, 2)
})

test('DeviceNotRegistered in receipt removes only the stale matching token', async () => {
  const app = harness([
    { body: { data: [{ status: 'ok', id: 'receipt-1' }] } },
    { body: { data: { 'receipt-1': { status: 'error', details: { error: 'DeviceNotRegistered' } } } } },
  ])
  await app.dispatch()
  await app.tick(15)
  assert.equal(app.records.has('users/alice/expoPushTokens/device'), false)
  assert.equal(app.jobs()[0].errorCode, 'DeviceNotRegistered')
})

test('late invalid-token receipt does not delete a newly registered token at the same document', async () => {
  const app = harness([
    { body: { data: [{ status: 'ok', id: 'receipt-1' }] } },
    { body: { data: { 'receipt-1': { status: 'error', details: { error: 'DeviceNotRegistered' } } } } },
  ])
  await app.dispatch()
  app.records.set('users/alice/expoPushTokens/device', { token: 'ExpoPushToken[new-token]' })
  await app.tick(15)
  assert.equal(app.records.get('users/alice/expoPushTokens/device').token, 'ExpoPushToken[new-token]')
})

test('no native notification is sent after the recipient account was deleted', async () => {
  const app = harness([])
  app.records.delete('users/alice')
  await app.dispatch()
  assert.equal(app.jobs()[0].state, 'cancelled')
  assert.equal(app.requests.length, 0)
})

test('native dispatch ignores web FCM tokens and respects the 100-message batch limit', async () => {
  const app = harness([
    { body: { data: Array.from({ length: 100 }, (_, i) => ({ status: 'ok', id: `receipt-${i}` })) } },
    { body: { data: [{ status: 'ok', id: 'receipt-100' }, { status: 'ok', id: 'receipt-101' }] } },
  ])
  app.records.set('users/alice/fcmTokens/web', { token: 'existing-web-fcm-token' })
  for (let i = 0; i < 101; i++) app.records.set(`users/alice/expoPushTokens/device-${i}`, { token: `ExpoPushToken[native-${i}]` })
  await app.dispatch()
  assert.equal(app.jobs().length, 102)
  assert.deepEqual(app.requests.map(request => request.body.length), [100, 2])
  assert.equal(app.records.get('users/alice/fcmTokens/web').token, 'existing-web-fcm-token')
})

test('an unavailable receipt stays pending instead of being marked successful', async () => {
  const app = harness([
    { body: { data: [{ status: 'ok', id: 'receipt-1' }] } },
    { body: { data: {} } },
  ])
  await app.dispatch()
  await app.tick(15)
  assert.equal(app.jobs()[0].state, 'receipt')
  assert.equal(app.jobs()[0].errorCode, 'ReceiptNotAvailable')
  await app.tick(24 * 60)
  assert.equal(app.jobs()[0].state, 'failed')
  assert.equal(app.jobs()[0].errorCode, 'ReceiptOrDeliveryExpired')
})

test('protocol validates native tokens and keeps deep links within the app', () => {
  assert.equal(protocol.isExpoToken('fcm-token'), false)
  assert.equal(protocol.isExpoToken('ExpoPushToken[valid-token]'), true)
  assert.equal(protocol.isExpoToken('ExponentPushToken[valid_token]'), true)
  const invalid = protocol.buildExpoMessage('ExpoPushToken[valid-token]', { href: '//evil.example/phish', message: '가'.repeat(5000) }, '123')
  assert.equal(invalid.data.href, '/notifications')
  assert.ok(Buffer.byteLength(JSON.stringify(invalid)) < 4096)
  assert.ok(protocol.retryDelay(4) > protocol.retryDelay(1))
})
