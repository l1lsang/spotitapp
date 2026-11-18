import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEditorState, currentPage, DUPLICATE_OFFSET_MM, editorReducer } from '../src/lib/book/editor.ts'
import { canRedo, canUndo, createHistory, HISTORY_LIMIT, historyReducer } from '../src/lib/book/history.ts'
import { BOOK_DRAFT_SCHEMA_VERSION, createEmptyDraft, readStoredDraft, serializeDraft } from '../src/lib/book/draft.ts'
import { NO_TRANSFORM, TEXT_SIZE_PT } from '../src/lib/book/geometry.ts'
import { stepTextSize } from '../src/lib/book/styles.ts'

const T = '2026-11-18T00:00:00.000Z'
const ref = { postId: 'post1', photoIndex: 0, url: 'https://example.test/a.jpg', pxWidth: 1600, pxHeight: 1200 }
const start = () => createEditorState(createEmptyDraft('book1', 'p1', T))
const run = (state, ...actions) => actions.reduce(editorReducer, state)
const ids = state => currentPage(state).elements.map(element => element.id)
const pageIds = state => state.draft.pages.map(page => page.id)
const withThree = () => run(start(),
  { type: 'add-image', id: 'a', ref, now: T },
  { type: 'add-image', id: 'b', ref, now: T },
  { type: 'add-text', id: 'c', text: '글', now: T })

test('layers move one step or to either end, and stop at the ends', () => {
  const state = withThree()
  assert.deepEqual(ids(run(state, { type: 'arrange', id: 'a', to: 'forward', now: T })), ['b', 'a', 'c'])
  assert.deepEqual(ids(run(state, { type: 'arrange', id: 'a', to: 'front', now: T })), ['b', 'c', 'a'])
  assert.deepEqual(ids(run(state, { type: 'arrange', id: 'c', to: 'back', now: T })), ['c', 'a', 'b'])
  assert.equal(run(state, { type: 'arrange', id: 'c', to: 'forward', now: T }), state)
  assert.equal(run(state, { type: 'arrange', id: 'a', to: 'backward', now: T }), state)
})

test('a duplicate sits just above its source, offset, and becomes the selection', () => {
  const state = run(withThree(), { type: 'duplicate', id: 'a', newId: 'a2', now: T })
  assert.deepEqual(ids(state), ['a', 'a2', 'b', 'c'])
  assert.equal(state.selectedId, 'a2')
  const [a, a2] = currentPage(state).elements
  assert.equal(a2.xMm - a.xMm, DUPLICATE_OFFSET_MM)
  assert.equal(a2.yMm - a.yMm, DUPLICATE_OFFSET_MM)
  assert.equal(run(state, { type: 'duplicate', id: 'a', newId: 'a2', now: T }), state) // id already used
})

test('text style changes are limited to known fonts, colours and sizes', () => {
  const state = withThree()
  const styled = run(state, { type: 'set-text-style', id: 'c', style: { font: 'nanum-pen', color: '#974426', align: 'center', sizePt: 500 }, now: T })
  const text = currentPage(styled).elements[2]
  assert.equal(text.font, 'nanum-pen')
  assert.equal(text.color, '#974426')
  assert.equal(text.align, 'center')
  assert.equal(text.sizePt, TEXT_SIZE_PT.max)
  assert.equal(run(state, { type: 'set-text-style', id: 'c', style: { font: 'comic-sans', color: 'red' }, now: T }), state)
  assert.equal(run(state, { type: 'set-text-style', id: 'a', style: { font: 'nanum-pen' }, now: T }), state) // a photo has no text style
})

test('text size steps by 1pt for body text and more for headings', () => {
  assert.equal(stepTextSize(12, 1), 13)
  assert.equal(stepTextSize(14, 1), 16)
  assert.equal(stepTextSize(16, -1), 14)
  assert.equal(stepTextSize(14, -1), 13)
  assert.equal(stepTextSize(32, 1), 36)
  assert.equal(stepTextSize(TEXT_SIZE_PT.min, -1), TEXT_SIZE_PT.min)
  assert.equal(stepTextSize(TEXT_SIZE_PT.max, 1), TEXT_SIZE_PT.max)
})

test('a new page follows the open page, keeps its paper, and opens', () => {
  let state = run(start(), { type: 'set-background', background: { color: '#f4f5ee', pattern: 'grid' }, allPages: false, now: T })
  state = run(state, { type: 'add-page', pageId: 'p2', now: T }, { type: 'go-page', index: 0 }, { type: 'add-page', pageId: 'p3', now: T })
  assert.deepEqual(pageIds(state), ['p1', 'p3', 'p2'])
  assert.equal(state.pageIndex, 1)
  assert.deepEqual(currentPage(state).background, { color: '#F4F5EE', pattern: 'grid' })
  assert.equal(run(state, { type: 'add-page', pageId: 'p2', now: T }), state) // id already used
})

test('a duplicated page copies its elements under new ids', () => {
  const state = run(withThree(), { type: 'duplicate-page', pageId: 'p2', elementIds: ['x', 'y', 'z'], now: T })
  assert.deepEqual(pageIds(state), ['p1', 'p2'])
  assert.deepEqual(ids(state), ['x', 'y', 'z'])
  assert.equal(currentPage(state).elements[2].text, '글')
  assert.equal(run(withThree(), { type: 'duplicate-page', pageId: 'p2', elementIds: ['x', 'x', 'z'], now: T }).draft.pages.length, 1)
})

test('deleting a page keeps at least one page and opens a neighbour', () => {
  assert.equal(run(start(), { type: 'delete-page', now: T }).draft.pages.length, 1)
  let state = run(start(), { type: 'add-page', pageId: 'p2', now: T }, { type: 'add-page', pageId: 'p3', now: T })
  state = run(state, { type: 'delete-page', now: T })
  assert.deepEqual(pageIds(state), ['p1', 'p2'])
  assert.equal(state.pageIndex, 1)
})

test('moving a page takes the open page along', () => {
  let state = run(start(), { type: 'add-page', pageId: 'p2', now: T }, { type: 'add-page', pageId: 'p3', now: T })
  state = run(state, { type: 'move-page', to: 0, now: T })
  assert.deepEqual(pageIds(state), ['p3', 'p1', 'p2'])
  assert.equal(state.pageIndex, 0)
  assert.equal(run(state, { type: 'move-page', to: -5, now: T }), state)
})

test('a background can go on one page or all, and picking the same one changes nothing', () => {
  let state = run(start(), { type: 'add-page', pageId: 'p2', now: T })
  state = run(state, { type: 'set-background', background: { color: '#2F3B4A' }, allPages: true, now: T })
  assert.deepEqual(state.draft.pages.map(page => page.background.color), ['#2F3B4A', '#2F3B4A'])
  assert.equal(run(state, { type: 'set-background', background: { color: '#2f3b4a' }, allPages: true, now: T }), state)
  assert.equal(run(state, { type: 'set-background', background: { color: 'blue' }, allPages: false, now: T }), state)
})

test('turning pages and selecting are not edits', () => {
  const state = run(start(), { type: 'add-page', pageId: 'p2', now: T })
  const back = run(state, { type: 'go-page', index: 0 })
  assert.equal(back.draft, state.draft)
  assert.equal(back.pageIndex, 0)
  assert.equal(run(back, { type: 'go-page', index: 9 }), back)
})

const hist = (...actions) => actions.reduce(historyReducer, createHistory(start()))

test('undo and redo step through edits; viewing actions are not recorded', () => {
  let h = hist(
    { type: 'add-image', id: 'a', ref, now: T },
    { type: 'select', id: null },
    { type: 'transform', id: 'a', transform: { ...NO_TRANSFORM, dxMm: 10 }, now: T },
    { type: 'measure-text', id: 'zzz', hMm: 5 },
  )
  assert.equal(h.past.length, 2)
  const moved = currentPage(h.editor).elements[0].xMm
  h = historyReducer(h, { type: 'undo' })
  assert.equal(currentPage(h.editor).elements[0].xMm, moved - 10)
  h = historyReducer(h, { type: 'undo' })
  assert.equal(currentPage(h.editor).elements.length, 0)
  assert.equal(canUndo(h), false)
  h = historyReducer(h, { type: 'redo' })
  h = historyReducer(h, { type: 'redo' })
  assert.equal(currentPage(h.editor).elements[0].xMm, moved)
  assert.equal(canRedo(h), false)
})

test('a deleted element comes back with undo, and a new edit clears redo', () => {
  let h = hist({ type: 'add-image', id: 'a', ref, now: T }, { type: 'delete', id: 'a', now: T })
  h = historyReducer(h, { type: 'undo' })
  assert.deepEqual(ids(h.editor), ['a'])
  h = historyReducer(h, { type: 'add-text', id: 't', text: '새 글', now: T })
  assert.equal(canRedo(h), false)
})

test('undo returns to the page where the change happened and drops a stale selection', () => {
  let h = hist({ type: 'add-page', pageId: 'p2', now: T }, { type: 'add-image', id: 'a', ref, now: T }, { type: 'go-page', index: 0 })
  assert.equal(h.editor.pageIndex, 0)
  h = historyReducer(h, { type: 'undo' }) // removes the photo on page 2
  assert.equal(h.editor.pageIndex, 1)
  assert.equal(ids(h.editor).length, 0)
  h = historyReducer(h, { type: 'undo' }) // removes page 2
  assert.equal(h.editor.draft.pages.length, 1)
  assert.equal(h.editor.pageIndex, 0)
  assert.equal(h.editor.selectedId, null)
})

test('history keeps a bounded number of steps', () => {
  let h = createHistory(start())
  h = historyReducer(h, { type: 'add-image', id: 'a', ref, now: T })
  for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = historyReducer(h, { type: 'transform', id: 'a', transform: { ...NO_TRANSFORM, dxMm: i % 2 ? 1 : -1 }, now: T })
  assert.equal(h.past.length, HISTORY_LIMIT)
  assert.equal(historyReducer(createHistory(start()), { type: 'undo' }).past.length, 0)
})

test('version 1 drafts open as the current version; newer and damaged ones are told apart', () => {
  const v1 = JSON.parse(serializeDraft(withThree().draft))
  v1.schemaVersion = 1
  const opened = readStoredDraft(JSON.stringify(v1))
  assert.equal(opened.status, 'ok')
  assert.equal(opened.draft.schemaVersion, BOOK_DRAFT_SCHEMA_VERSION)
  assert.equal(opened.draft.pages[0].elements.length, 3)
  assert.deepEqual(readStoredDraft(null), { status: 'missing' })
  assert.deepEqual(readStoredDraft(JSON.stringify({ ...v1, schemaVersion: BOOK_DRAFT_SCHEMA_VERSION + 1 })), { status: 'newer' })
  assert.deepEqual(readStoredDraft('{"half'), { status: 'unreadable' })
  assert.deepEqual(readStoredDraft(JSON.stringify({ ...v1, pages: [] })), { status: 'unreadable' })
})

test('fonts and paper patterns survive a save, unknown ones fall back', () => {
  let state = run(withThree(), { type: 'set-text-style', id: 'c', style: { font: 'gowun-batang' }, now: T })
  state = run(state, { type: 'set-background', background: { color: '#FFFFFF', pattern: 'lined' }, allPages: false, now: T })
  const back = readStoredDraft(serializeDraft(state.draft))
  assert.deepEqual(back.draft, state.draft)
  const raw = JSON.parse(serializeDraft(state.draft))
  raw.pages[0].background.pattern = 'stars'
  raw.pages[0].elements[2].font = 'unknown-font'
  const loose = readStoredDraft(JSON.stringify(raw))
  assert.deepEqual(loose.draft.pages[0].background, { color: '#FFFFFF' })
  assert.deepEqual(loose.draft.pages[0].elements.map(element => element.id), ['a', 'b'])
})
