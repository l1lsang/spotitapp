import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatMegabytes, readRenderResult, readRenderSummary, saveStateOf, serverOnlyIssues } from '../src/lib/book/render.ts'
import { snapshotOf } from '../src/lib/book/sync.ts'
import { createEmptyDraft } from '../src/lib/book/draft.ts'

const draft = createEmptyDraft('b1', 'p1', '2026-11-18T00:00:00.000Z')

test('a print file is only asked for when this device holds exactly the saved revision', () => {
  const synced = snapshotOf(draft, 4)
  assert.deepEqual(saveStateOf(draft, synced), { kind: 'saved', revision: 4 })
  assert.deepEqual(saveStateOf({ ...draft, title: '바뀐 제목' }, synced), { kind: 'unsaved' })
  assert.deepEqual(saveStateOf(draft, { ...synced, inflight: snapshotOf(draft, 5) }), { kind: 'unsaved' })
  assert.deepEqual(saveStateOf(draft, null), { kind: 'unknown' })
})

const issue = (id, severity = 'warn', extra = {}) => ({ id, kind: id.split(':')[0], severity, pageIndex: 0, elementId: 'e1', title: 't', detail: 'd', ...extra })
const summary = {
  revision: 4, pageCount: 50, counts: { error: 1, warn: 2, info: 0 }, readiness: 'blocked',
  issues: [issue('photo-unavailable:e1', 'error'), issue('text-overflow:e2')], issueTotal: 3,
  bytes: 3_500_000, ms: 41_000, photos: { total: 12, printCopies: 9, resized: 9 }, pdfPath: 'books/u/b/render/4/interior.pdf',
}

test('server results are read defensively', () => {
  const read = readRenderSummary(summary)
  assert.equal(read.issueTotal, 3)
  assert.deepEqual(read.photos, { total: 12, printCopies: 9, resized: 9 })
  assert.equal(read.issues[0].elementId, 'e1')
  assert.equal('pdfPath' in read, false)
  // Results made before photo counts existed, and junk.
  const { photos: _photos, ...older } = summary
  assert.deepEqual(readRenderSummary(older).photos, { total: 0, printCopies: 0, resized: 0 })
  assert.equal(readRenderSummary({ ...summary, readiness: 'maybe' }), null)
  assert.equal(readRenderSummary(null), null)
  assert.deepEqual(readRenderSummary({ ...summary, issues: [issue('x', 'fatal'), 'junk', issue('font:e3', 'info', { pageIndex: -1 })] }).issues.map(item => [item.id, item.pageIndex]), [['font:e3', null]])
})

test('the callable answers with a finished summary or with a render already running', () => {
  assert.equal(readRenderResult({ status: 'done', ...summary, cached: true }).summary.pageCount, 50)
  assert.deepEqual(readRenderResult({ status: 'rendering', revision: 4 }), { status: 'rendering', revision: 4 })
  assert.equal(readRenderResult({ status: 'failed' }), null)
  assert.equal(readRenderResult('done'), null)
})

test('only what the server found beyond the app, or judged differently, is listed again', () => {
  const local = [issue('photo-resolution:e1', 'warn', { detail: '약 180dpi예요' }), issue('glyph-fallback:e2', 'info')]
  const server = [
    issue('photo-resolution:e1', 'error', { detail: '약 69dpi예요' }),
    issue('glyph-fallback:e2', 'info'),
    issue('text-overflow:e3'),
  ]
  assert.deepEqual(serverOnlyIssues(server, local).map(item => item.id), ['photo-resolution:e1', 'text-overflow:e3'])
  assert.deepEqual(serverOnlyIssues(local, local), [])
})

test('file sizes read naturally', () => {
  assert.equal(formatMegabytes(3_500_000), '3.3MB')
  assert.equal(formatMegabytes(147_528_279), '141MB')
})
