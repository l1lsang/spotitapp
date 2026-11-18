import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEditorState, currentPage, editorReducer, MAX_ELEMENTS_PER_PAGE, MAX_TEXT_LENGTH } from '../src/lib/book/editor.ts'
import { createEmptyDraft, draftStorageKey, isDraftStorageKey, parseDraft, serializeDraft } from '../src/lib/book/draft.ts'
import { createSaveQueue } from '../src/lib/book/saveQueue.ts'
import { NO_TRANSFORM } from '../src/lib/book/geometry.ts'

const T0 = '2026-11-18T00:00:00.000Z'
const T1 = '2026-11-18T00:00:01.000Z'
const ref = { postId: 'post1', photoIndex: 0, url: 'https://example.test/a.jpg', pxWidth: 1600, pxHeight: 1200 }
const start = () => createEditorState(createEmptyDraft('book1', 'page1', T0))
const run = (state, ...actions) => actions.reduce(editorReducer, state)
const elements = state => currentPage(state).elements

test('adding a photo places it on the page, selects it and stamps the edit time', () => {
  const state = run(start(), { type: 'add-image', id: 'img', ref, now: T1 })
  assert.equal(elements(state).length, 1)
  assert.equal(state.selectedId, 'img')
  assert.equal(state.draft.updatedAt, T1)
  const [photo] = elements(state)
  assert.equal(photo.type, 'image')
  assert.ok(Math.abs(photo.wMm / photo.hMm - 4 / 3) < 1e-9)
  assert.deepEqual(photo.ref, ref)
})

test('moving and resizing go through the page limits', () => {
  const state = run(start(),
    { type: 'add-image', id: 'img', ref, now: T0 },
    { type: 'transform', id: 'img', transform: { ...NO_TRANSFORM, dxMm: 1000 }, now: T1 })
  assert.equal(elements(state)[0].xMm, 148)
})

test('text is added, rewritten, and removed when emptied', () => {
  let state = run(start(), { type: 'add-text', id: 'txt', text: '성북천을 걸었다', now: T0 })
  assert.equal(elements(state)[0].text, '성북천을 걸었다')
  state = run(state, { type: 'set-text', id: 'txt', text: '해가 질 때까지 걸었다', now: T1 })
  assert.equal(elements(state)[0].text, '해가 질 때까지 걸었다')
  state = run(state, { type: 'set-text', id: 'txt', text: '   \n', now: T1 })
  assert.equal(elements(state).length, 0)
  assert.equal(state.selectedId, null)
})

test('blank text is never added and long text is cut at the limit', () => {
  assert.equal(elements(run(start(), { type: 'add-text', id: 'x', text: '  ', now: T0 })).length, 0)
  const long = run(start(), { type: 'add-text', id: 'x', text: '가'.repeat(MAX_TEXT_LENGTH + 50), now: T0 })
  assert.equal(elements(long)[0].text.length, MAX_TEXT_LENGTH)
})

test('measuring text height is layout feedback, not an edit', () => {
  const state = run(start(), { type: 'add-text', id: 'txt', text: '가', now: T0 })
  const measured = run(state, { type: 'measure-text', id: 'txt', hMm: 30 })
  assert.equal(elements(measured)[0].hMm, 30)
  assert.equal(measured.draft.updatedAt, T0)
  assert.equal(run(measured, { type: 'measure-text', id: 'txt', hMm: 30.1 }), measured) // under 0.3mm: no change
})

test('deleting the selected element clears the selection; unknown ids change nothing', () => {
  const state = run(start(), { type: 'add-image', id: 'img', ref, now: T0 })
  const deleted = run(state, { type: 'delete', id: 'img', now: T1 })
  assert.equal(elements(deleted).length, 0)
  assert.equal(deleted.selectedId, null)
  assert.equal(run(state, { type: 'delete', id: 'nope', now: T1 }), state)
  assert.equal(run(state, { type: 'select', id: 'nope' }), state)
})

test('a page holds at most the element limit', () => {
  let state = start()
  for (let i = 0; i < MAX_ELEMENTS_PER_PAGE + 3; i++) state = run(state, { type: 'add-image', id: `img${i}`, ref, now: T0 })
  assert.equal(elements(state).length, MAX_ELEMENTS_PER_PAGE)
})

test('a saved draft comes back exactly', () => {
  const state = run(start(),
    { type: 'add-image', id: 'img', ref, now: T0 },
    { type: 'add-text', id: 'txt', text: '첫 줄\n둘째 줄', now: T1 },
    { type: 'transform', id: 'img', transform: { dxMm: 4, dyMm: -2, scale: 1.2, dRotationDeg: 30 }, now: T1 })
  assert.deepEqual(parseDraft(serializeDraft(state.draft)), state.draft)
})

test('a damaged draft is refused, and one damaged element costs only that element', () => {
  assert.equal(parseDraft(null), null)
  assert.equal(parseDraft('{not json'), null)
  assert.equal(parseDraft(JSON.stringify({ schemaVersion: 99, id: 'b', title: '', specId: 'a5-soft', pages: [], updatedAt: T0 })), null)
  const state = run(start(), { type: 'add-image', id: 'img', ref, now: T0 }, { type: 'add-text', id: 'txt', text: '남는 글', now: T0 })
  const raw = JSON.parse(serializeDraft(state.draft))
  raw.pages[0].elements[0].ref.url = 'javascript:alert(1)'
  raw.pages[0].elements[1].xMm = 'NaN'
  raw.pages[0].elements.push({ id: 'ok', type: 'text', xMm: 1, yMm: 1, wMm: 10, hMm: 5, rotationDeg: 0, text: '살아남음', font: 'pretendard', sizePt: 12, color: '#000000', align: 'left', lineHeight: 1.5 })
  const parsed = parseDraft(JSON.stringify(raw))
  assert.deepEqual(parsed.pages[0].elements.map(element => element.id), ['ok'])
})

test('drafts are stored per account and are recognisable for sign-out cleanup', () => {
  assert.notEqual(draftStorageKey('uidA', 'local'), draftStorageKey('uidB', 'local'))
  assert.equal(isDraftStorageKey(draftStorageKey('uidA', 'local')), true)
  assert.equal(isDraftStorageKey('firebase:authUser'), false)
})

function fakeTimers() {
  const pending = new Set()
  return {
    set: (run) => { const handle = { run }; pending.add(handle); return handle },
    clear: (handle) => pending.delete(handle),
    tick: () => { const all = [...pending]; pending.clear(); all.forEach(handle => handle.run()) },
    size: () => pending.size,
  }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('saving waits for a pause, writes only the newest version, and reports saved after the write', async () => {
  const timers = fakeTimers()
  const writes = []
  const statuses = []
  const queue = createSaveQueue({ delayMs: 600, timers, write: async value => { writes.push(value) }, onStatus: status => statuses.push(status) })
  queue.schedule('v1'); queue.schedule('v2'); queue.schedule('v3')
  assert.equal(timers.size(), 1)
  timers.tick()
  await settle()
  assert.deepEqual(writes, ['v3'])
  assert.equal(statuses.at(-1), 'saved')
})

test('changes made during a write are saved once afterwards, never in parallel', async () => {
  const timers = fakeTimers()
  const writes = []
  let release
  let inFlight = 0
  let maxInFlight = 0
  const queue = createSaveQueue({
    delayMs: 600, timers, onStatus: () => {},
    write: value => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); writes.push(value); return new Promise(resolve => { release = () => { inFlight--; resolve() } }) },
  })
  queue.schedule('v1'); timers.tick()
  queue.schedule('v2'); queue.schedule('v3'); timers.tick()
  release(); await settle()
  release(); await settle()
  assert.deepEqual(writes, ['v1', 'v3'])
  assert.equal(maxInFlight, 1)
})

test('a failed write is reported as an error, keeps the change, and is retried on flush', async () => {
  const timers = fakeTimers()
  const statuses = []
  let fail = true
  const writes = []
  const queue = createSaveQueue({
    delayMs: 600, timers, onStatus: status => statuses.push(status),
    write: async value => { if (fail) throw new Error('disk full'); writes.push(value) },
  })
  queue.schedule('v1'); timers.tick(); await settle()
  assert.equal(statuses.at(-1), 'error')
  assert.equal(statuses.includes('saved'), false)
  assert.equal(queue.hasUnsaved(), true)
  fail = false
  await queue.flush()
  assert.deepEqual(writes, ['v1'])
  assert.equal(statuses.at(-1), 'saved')
})

test('flush writes immediately without waiting for the pause', async () => {
  const timers = fakeTimers()
  const writes = []
  const queue = createSaveQueue({ delayMs: 600, timers, write: async value => { writes.push(value) }, onStatus: () => {} })
  queue.schedule('v1')
  await queue.flush()
  assert.deepEqual(writes, ['v1'])
  assert.equal(timers.size(), 0)
})
