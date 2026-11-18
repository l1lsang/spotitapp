import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOOK_DRAFT_SCHEMA_VERSION, createEmptyDraft, isDraftStorageKey, readStoredDraft, syncStorageKey } from '../src/lib/book/draft.ts'
import { canonicalJson, decideOnOpen, planSync, readSyncState, snapshotOf } from '../src/lib/book/sync.ts'
import { estimateBookPages, estimateLines, estimateRecordPages, formatRecordMeta, layoutBook, splitText, suggestPageCount } from '../src/lib/book/layout.ts'
import { formatWon, groupByMonth, matchesQuery, moveRecord, sortByDate, toggleGroup, toggleRecord } from '../src/lib/book/selection.ts'
import { createBookSession } from '../src/lib/book/bookSession.ts'
import { getBookSpec } from '../src/lib/book/specs.ts'

const spec = getBookSpec('a5-soft')
const T = '2026-11-18T00:00:00.000Z'
const text = (id, value = '글') => ({ id, type: 'text', text: value, font: 'pretendard', sizePt: 12, color: '#161F1B', align: 'left', lineHeight: 1.5, xMm: 74, yMm: 40, wMm: 100, hMm: 6, rotationDeg: 0 })
const draftWith = (...pages) => ({ ...createEmptyDraft('book1', 'unused', T), title: '책', pages })
const page = (id, ...elements) => ({ id, background: { color: '#F7F2E8' }, elements })

test('fingerprints ignore key order, and a plan holds only what changed', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: null } }), canonicalJson({ a: { c: null, d: [1, { e: 3, f: 2 }] }, b: 1 }))
  const base = draftWith(page('p1', text('t1')), page('p2'), page('p3'))
  const synced = snapshotOf(base, 4)
  assert.equal(planSync(base, synced), null)
  const reordered = { ...base, pages: [base.pages[2], base.pages[0], base.pages[1]] }
  assert.deepEqual(planSync(reordered, synced), { baseRevision: 4, upserts: [], deletes: [] })
  const edited = { ...base, pages: [page('p1', text('t1', '고친 글')), base.pages[1], page('p4')] }
  const plan = planSync(edited, synced)
  assert.deepEqual(plan.upserts.map(item => item.id), ['p1', 'p4'])
  assert.deepEqual(plan.deletes, ['p3'])
  assert.equal(planSync({ ...base, title: '다른 제목' }, synced).upserts.length, 0)
})

test('sync records survive storage and reject damaged ones', () => {
  const state = { ...snapshotOf(draftWith(page('p1')), 2), inflight: snapshotOf(draftWith(page('p1'), page('p2')), 3) }
  assert.deepEqual(readSyncState(JSON.stringify(state)), state)
  assert.equal(readSyncState('{"revision":0,"meta":"x","pages":{}}'), null)
  assert.equal(readSyncState('not json'), null)
  assert.equal(isDraftStorageKey(syncStorageKey('u', 'b')), true)
})

test('opening prefers the server unless this device has edits based on its revision', () => {
  const server = draftWith(page('p1'), page('p2'))
  const synced = snapshotOf(server, 3)
  const localEdit = draftWith(page('p1', text('t')), page('p2'))
  assert.equal(decideOnOpen({ draft: server, revision: 3 }, null, null).draft, server)
  // Unsent edits on the same revision: open them.
  assert.equal(decideOnOpen({ draft: server, revision: 3 }, localEdit, synced).draft, localEdit)
  // A copy without edits gives way to a newer server copy.
  const newer = draftWith(page('p1'), page('p2'), page('p3'))
  assert.equal(decideOnOpen({ draft: newer, revision: 4 }, server, synced).draft, newer)
  // Edits on an old revision while the server moved on: ask.
  assert.equal(decideOnOpen({ draft: newer, revision: 4 }, localEdit, synced).kind, 'conflict')
  // A write that landed but whose answer was lost counts as the base.
  const landed = { ...synced, inflight: snapshotOf(localEdit, 4) }
  const further = draftWith(page('p1', text('t'), text('u')), page('p2'))
  const decision = decideOnOpen({ draft: localEdit, revision: 4 }, further, landed)
  assert.equal(decision.draft, further)
  assert.equal(decision.synced.revision, 4)
})

test('version 2 drafts gain a subtitle, cover and records when opened', () => {
  const v2 = { schemaVersion: 2, id: 'b', title: '책', specId: 'a5-soft', updatedAt: T, pages: [page('p1')] }
  const opened = readStoredDraft(JSON.stringify(v2))
  assert.equal(opened.status, 'ok')
  assert.equal(opened.draft.schemaVersion, BOOK_DRAFT_SCHEMA_VERSION)
  assert.deepEqual([opened.draft.subtitle, opened.draft.coverStyle, opened.draft.coverPhoto, opened.draft.sourcePostIds], ['', 'minimal', null, []])
})

test('text estimates count wide Korean glyphs and split long text at spaces', () => {
  assert.equal(estimateLines('가'.repeat(37), 'body', 132), 1)
  assert.equal(estimateLines('가'.repeat(38), 'body', 132), 2)
  assert.equal(estimateLines('첫 줄\n둘째 줄', 'body', 132), 2)
  const long = Array.from({ length: 300 }, (_, index) => `낱말${index}`).join(' ')
  const parts = splitText(long, 'body', 132, 10)
  assert.ok(parts.length > 1)
  assert.equal(parts.join(' '), long)
  assert.ok(parts.every(part => estimateLines(part, 'body', 132) <= 10))
})

const ref = (index, w = 1600, h = 1200) => ({ postId: 'post1', photoIndex: index, url: `https://example.test/${index}.jpg`, pxWidth: w, pxHeight: h })
const record = (photos, content = '짧은 글') => ({ postId: 'post1', title: '조금 더 걷고 싶은 날', placeName: '성북천', dateKey: '2026-10-12', content, photos })

test('a book lays out a title page, each record and blank pages up to the chosen count', () => {
  let n = 0
  const newId = () => `id${n++}`
  const records = [record([ref(0), ref(1), ref(2)]), record([], '가'.repeat(3000))]
  const outlines = records.map(item => ({ ...item, photoCount: item.photos.length }))
  const pages = layoutBook({ title: '우리가 걸었던 길', subtitle: '부제', records, pageCount: 50 }, spec, newId)
  assert.equal(pages.length, 50)
  const contentPages = estimateBookPages(outlines, spec)
  assert.equal(pages.filter(item => item.elements.length).length, contentPages)
  assert.equal(estimateRecordPages(outlines[0], spec), 2) // first page + one page with two photos
  assert.ok(estimateRecordPages(outlines[1], spec) >= 3) // long words continue on their own pages
  const ids = pages.flatMap(item => [item.id, ...item.elements.map(element => element.id)])
  assert.equal(new Set(ids).size, ids.length)
  for (const element of pages.flatMap(item => item.elements)) {
    assert.ok(element.xMm - element.wMm / 2 >= spec.safeMm - 0.01 && element.xMm + element.wMm / 2 <= spec.trimMm.w - spec.safeMm + 0.01)
    if (element.type === 'image') assert.ok(Math.abs(element.wMm / element.hMm - 4 / 3) < 0.001)
  }
  assert.equal(pages[0].elements[0].text, '우리가 걸었던 길')
  assert.equal(formatRecordMeta(records[0]), '성북천 · 2026.10.12')
})

test('page counts round up to a printable size, and too many records are refused', () => {
  assert.equal(suggestPageCount(12, spec), 50)
  assert.equal(suggestPageCount(63, spec), 64)
  assert.equal(suggestPageCount(200, spec), 200)
  assert.equal(suggestPageCount(201, spec), null)
})

test('selection keeps the tap order, months toggle together, and order can change', () => {
  let selected = toggleRecord([], 'a')
  selected = toggleRecord(selected, 'c')
  selected = toggleGroup(selected, ['b', 'c', 'd'])
  assert.deepEqual(selected, ['a', 'c', 'b', 'd'])
  assert.deepEqual(toggleGroup(selected, ['b', 'c', 'd']), ['a'])
  assert.deepEqual(toggleRecord(selected, 'c'), ['a', 'b', 'd'])
  assert.deepEqual(moveRecord(selected, 0, 1), ['c', 'a', 'b', 'd'])
  assert.deepEqual(moveRecord(selected, 0, -1), selected)
  const records = [{ id: 'a', dateKey: '2026-11-09' }, { id: 'b', dateKey: '2026-10-12' }, { id: 'c', dateKey: '' }, { id: 'd', dateKey: '2026-10-14' }]
  assert.deepEqual(sortByDate(selected, records), ['b', 'd', 'a', 'c'])
})

test('records group by month, newest first, and search matches every word', () => {
  const make = (id, dateKey, title) => ({ id, dateKey, title, placeName: '한강공원', content: '', photoUrls: [] })
  const groups = groupByMonth([make('a', '2026-10-12', '걷기'), make('b', '2026-11-03', '오후'), make('c', '2026-11-09', '자전거')])
  assert.deepEqual(groups.map(group => [group.label, group.records.map(item => item.id)]), [['2026년 11월', ['c', 'b']], ['2026년 10월', ['a']]])
  assert.equal(matchesQuery(make('a', '', '새벽 자전거'), '한강 자전거'), true)
  assert.equal(matchesQuery(make('a', '', '새벽 자전거'), '서점'), false)
  assert.equal(formatWon(27900), '27,900원')
})

// The session, with storage and server replaced by in-memory fakes.
function fakes({ server = null, local = null, sync = null } = {}) {
  const state = { server, local, sync, writes: [], refuseNext: null, failNext: false, statuses: [] }
  const deps = {
    local: {
      load: async () => ({ draft: state.local ? { status: 'ok', draft: state.local } : { status: 'missing' }, sync: state.sync }),
      saveDraft: async draft => { state.local = draft },
      saveSync: async value => { state.sync = value },
      clear: async () => { state.local = null; state.sync = null },
    },
    server: {
      load: async () => state.server ? { kind: 'ok', draft: state.server.draft, revision: state.server.revision } : { kind: 'missing' },
      write: async (draft, plan) => {
        if (state.failNext) { state.failNext = false; throw Object.assign(new Error('offline'), { code: 'unavailable' }) }
        if (state.refuseNext) { const next = state.refuseNext; state.refuseNext = null; state.server = next; throw Object.assign(new Error('no'), { code: 'permission-denied' }) }
        if (plan.baseRevision !== state.server.revision) throw Object.assign(new Error('stale'), { code: 'permission-denied' })
        state.writes.push(plan)
        state.server = { draft, revision: plan.baseRevision + 1 }
      },
    },
    isRefusal: error => error?.code === 'permission-denied',
    onStatus: status => state.statuses.push(status),
    localDelayMs: 0, serverDelayMs: 0,
    timers: { set: () => 0, clear: () => {} },
  }
  return { state, deps }
}

test('a session opens the server copy, sends only changed pages and reports saved', async () => {
  const base = draftWith(page('p1'), page('p2'))
  const { state, deps } = fakes({ server: { draft: base, revision: 1 } })
  const session = createBookSession(deps)
  const opened = await session.open()
  assert.equal(opened.kind, 'ready')
  const edited = { ...base, pages: [page('p1', text('t')), base.pages[1]] }
  session.edit(edited)
  await session.flush()
  assert.deepEqual(state.writes.map(plan => plan.upserts.map(item => item.id)), [['p1']])
  assert.equal(state.server.revision, 2)
  assert.equal(state.sync.revision, 2)
  assert.equal(state.sync.inflight, undefined)
  assert.equal(state.local, edited)
  assert.equal(state.statuses.at(-1), 'saved')
})

test('a failed send keeps the edit on this device and retry sends it', async () => {
  const base = draftWith(page('p1'))
  const { state, deps } = fakes({ server: { draft: base, revision: 1 } })
  const session = createBookSession(deps)
  await session.open()
  state.failNext = true
  session.edit({ ...base, title: '새 제목' })
  await session.flush()
  assert.equal(state.statuses.at(-1), 'local')
  assert.equal(state.local.title, '새 제목')
  await session.retry()
  assert.equal(state.server.draft.title, '새 제목')
  assert.equal(state.statuses.at(-1), 'saved')
})

test('a refused write caused by another device becomes a conflict the user resolves', async () => {
  const base = draftWith(page('p1'))
  const { state, deps } = fakes({ server: { draft: base, revision: 1 } })
  const session = createBookSession(deps)
  await session.open()
  const theirs = { ...base, title: '다른 기기' }
  state.refuseNext = { draft: theirs, revision: 2 }
  const mine = { ...base, title: '이 기기' }
  session.edit(mine)
  await session.flush()
  assert.equal(state.statuses.at(-1), 'conflict')
  // Keeping this device's copy rewrites it on top of revision 2.
  assert.equal(await session.resolveConflict('local'), mine)
  assert.equal(state.server.revision, 3)
  assert.equal(state.server.draft.title, '이 기기')
  assert.equal(state.statuses.at(-1), 'saved')
})

test('choosing the other device copy replaces this one, and a deleted book is reported', async () => {
  const base = draftWith(page('p1'))
  const { state, deps } = fakes({ server: { draft: base, revision: 1 } })
  const session = createBookSession(deps)
  await session.open()
  state.refuseNext = { draft: { ...base, title: '다른 기기' }, revision: 2 }
  session.edit({ ...base, title: '이 기기' })
  await session.flush()
  const kept = await session.resolveConflict('server')
  assert.equal(kept.title, '다른 기기')
  assert.equal(state.sync.revision, 2)

  const gone = fakes({ server: null, local: base, sync: snapshotOf(base, 1) })
  const result = await createBookSession(gone.deps).open()
  assert.deepEqual(result, { kind: 'blocked', reason: 'deleted' })
  assert.equal(gone.state.local, null)
})

test('offline, the session opens this device copy and sends its edits later', async () => {
  const base = draftWith(page('p1'))
  const edited = { ...base, title: '기차에서 고친 제목' }
  const { state, deps } = fakes({ local: edited, sync: snapshotOf(base, 1) })
  deps.server.load = async () => { throw new Error('offline') }
  const session = createBookSession(deps)
  const opened = await session.open()
  assert.equal(opened.draft, edited)
  // Connection back: the write goes out on top of revision 1.
  state.server = { draft: base, revision: 1 }
  await session.flush()
  assert.equal(state.server.draft.title, '기차에서 고친 제목')
  assert.equal(state.server.revision, 2)
})

// A clock the test moves by hand, and a server whose writes wait like Firestore offline.
function manualClock() {
  let now = 0
  let seq = 0
  const pending = new Map()
  return {
    timers: {
      set: (run, ms) => { const id = ++seq; pending.set(id, { at: now + ms, run }); return id },
      clear: id => { pending.delete(id) },
    },
    async advance(ms) {
      const until = now + ms
      for (;;) {
        const due = [...pending].filter(([, item]) => item.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        pending.delete(due[0])
        now = due[1].at
        due[1].run()
        await new Promise(resolve => setImmediate(resolve))
      }
      now = until
      await new Promise(resolve => setImmediate(resolve))
    },
  }
}

const settle = () => new Promise(resolve => setImmediate(resolve))

test('a write the network holds back reads as offline, then saved once it lands', async () => {
  const base = draftWith(page('p1'))
  const clock = manualClock()
  const { state, deps } = fakes({ server: { draft: base, revision: 1 } })
  const held = []
  const write = deps.server.write
  deps.server.write = (draft, plan) => new Promise((resolve, reject) => held.push(() => write(draft, plan).then(resolve, reject)))
  Object.assign(deps, { timers: clock.timers, localDelayMs: 0, serverDelayMs: 0, slowWriteMs: 3000 })
  const session = createBookSession(deps)
  await session.open()
  session.edit({ ...base, title: '첫 수정' })
  await clock.advance(0)
  assert.equal(state.statuses.at(-1), 'saving')
  await clock.advance(3000)
  assert.equal(state.statuses.at(-1), 'offline')
  assert.equal(state.local.title, '첫 수정')
  // More edits while offline stay "offline" and wait behind the held write.
  session.edit({ ...base, title: '둘째 수정' })
  session.edit({ ...base, title: '셋째 수정' })
  await clock.advance(10)
  assert.equal(state.statuses.at(-1), 'offline')
  assert.equal(held.length, 1)
  // Connection back: the held write lands, then one follow-up carries the newest edit.
  held.shift()()
  await settle(); await settle()
  assert.equal(held.length, 1)
  held.shift()()
  await settle(); await settle()
  await clock.advance(0)
  assert.equal(state.server.draft.title, '셋째 수정')
  assert.equal(state.server.revision, 3)
  assert.equal(state.statuses.at(-1), 'saved')
})

test('with a copy on this device, a silent server does not hold the book closed', async () => {
  const base = draftWith(page('p1'))
  const clock = manualClock()
  const { deps } = fakes({ server: { draft: base, revision: 1 }, local: { ...base, title: '기기 사본' }, sync: snapshotOf(base, 1) })
  deps.server.load = () => new Promise(() => {})
  Object.assign(deps, { timers: clock.timers, openTimeoutMs: 6000 })
  const opening = createBookSession(deps).open()
  await settle() // reads this device's copy, then starts waiting for the server
  await clock.advance(5999)
  let opened = null
  void opening.then(result => { opened = result })
  await settle()
  assert.equal(opened, null)
  await clock.advance(1)
  await settle()
  assert.equal(opened.kind, 'ready')
  assert.equal(opened.draft.title, '기기 사본')
})

test('without a copy on this device, opening waits for the server', async () => {
  const base = draftWith(page('p1'))
  const clock = manualClock()
  const { deps } = fakes({ server: { draft: base, revision: 1 } })
  let answer
  deps.server.load = () => new Promise(resolve => { answer = resolve })
  Object.assign(deps, { timers: clock.timers, openTimeoutMs: 6000 })
  let opened = null
  void createBookSession(deps).open().then(result => { opened = result })
  await clock.advance(60000)
  assert.equal(opened, null)
  answer({ kind: 'ok', draft: base, revision: 1 })
  await settle(); await settle()
  assert.equal(opened.kind, 'ready')
})
