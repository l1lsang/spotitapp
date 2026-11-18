import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countBySeverity, effectiveDpi, flaggedPages, orderReadiness, preflightBook } from '../src/lib/book/preflight.ts'
import { apply, elementMatrixPt, imageMatrixPt, mmToPdfPoint, pageBoxesPt, PT_PER_MM, textPlacementPt } from '../src/lib/book/pdfCoords.ts'
import { elementBounds } from '../src/lib/book/geometry.ts'
import { getBookSpec } from '../src/lib/book/specs.ts'

const spec = getBookSpec('a5-soft')
const ref = (w = 1600, h = 1200) => ({ postId: 'p', photoIndex: 0, url: 'https://example.test/a.jpg', pxWidth: w, pxHeight: h })
const photo = (id, box, extra = {}) => ({ id, type: 'image', ref: ref(), crop: { x: 0, y: 0, w: 1, h: 1 }, rotationDeg: 0, ...box, ...extra })
const text = (id, box, extra = {}) => ({ id, type: 'text', text: '글', font: 'pretendard', sizePt: 12, color: '#161F1B', align: 'left', lineHeight: 1.5, rotationDeg: 0, ...box, ...extra })
const page = (...elements) => ({ id: `pg${Math.random()}`, background: { color: '#FFFFFF' }, elements })
const book = (pages, total = 50) => ({ pages: [...pages, ...Array.from({ length: total - pages.length }, () => page(text('filler', { xMm: 74, yMm: 100, wMm: 50, hMm: 6 })))] })
const kinds = issues => issues.map(issue => `${issue.kind}:${issue.severity}:${issue.pageIndex}`)

test('effective DPI uses the shown pixels over the printed size', () => {
  // 1600px over 148mm is about 275dpi; over the full 210mm height of a portrait photo about 194.
  assert.equal(Math.round(effectiveDpi(photo('a', { wMm: 148, hMm: 111 }))), 275)
  assert.equal(Math.round(effectiveDpi({ ...photo('a', { wMm: 157.5, hMm: 210 }), ref: ref(1200, 1600) })), 194)
  // A half crop prints half the pixels.
  assert.equal(Math.round(effectiveDpi(photo('a', { wMm: 74, hMm: 55.5 }, { crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }))), 275)
})

test('soft photos warn, very large ones block ordering', () => {
  const issues = preflightBook(book([
    page(photo('ok', { xMm: 74, yMm: 60, wMm: 100, hMm: 75 })),
    page(photo('soft', { xMm: 74, yMm: 105, wMm: 132, hMm: 176 }, { ref: ref(1000, 1333) })),
    page(photo('huge', { xMm: 74, yMm: 105, wMm: 132, hMm: 99 }, { ref: ref(400, 300) })),
  ]), spec)
  assert.deepEqual(kinds(issues), ['photo-resolution:error:2', 'photo-resolution:warn:1'])
  assert.match(issues[1].detail, /약 \d+dpi예요\(권장 300dpi\)/)
  assert.equal(issues[0].elementId, 'huge')
})

test('text past the safe area warns, and says when it reaches the trim', () => {
  const issues = preflightBook(book([
    page(text('inside', { xMm: 74, yMm: 20, wMm: 120, hMm: 6 })),
    page(text('near', { xMm: 74, yMm: 200, wMm: 100, hMm: 8 })),
    page(text('cut', { xMm: 140, yMm: 100, wMm: 30, hMm: 6 })),
  ]), spec)
  assert.deepEqual(kinds(issues), ['text-outside-safe:warn:1', 'text-outside-safe:warn:2'])
  assert.equal(issues[0].title, '글이 잘릴 수 있어요')
  assert.match(issues[0].detail, /2mm 나갔어요/)
  assert.equal(issues[1].title, '글이 잘려요')
})

test('rotation is part of the box that is checked', () => {
  const tall = text('t', { xMm: 74, yMm: 105, wMm: 190, hMm: 6, rotationDeg: 90 })
  const bounds = elementBounds(tall)
  assert.ok(Math.abs(bounds.top - 10) < 1e-9 && Math.abs(bounds.left - 71) < 1e-9)
  assert.deepEqual(kinds(preflightBook(book([page(tall)]), spec)), [])
  assert.deepEqual(kinds(preflightBook(book([page({ ...tall, rotationDeg: 0 })]), spec)), ['text-outside-safe:warn:0'])
})

test('photos across the trim line must reach the bleed edge', () => {
  const issues = preflightBook(book([
    page(photo('gap', { xMm: 0, yMm: 60, wMm: 2, hMm: 40 })),
    page(photo('full', { xMm: 74, yMm: 105, wMm: 154, hMm: 216 }, { ref: ref(4000, 5600) })),
    page(photo('inside', { xMm: 74, yMm: 105, wMm: 100, hMm: 75 })),
  ]), spec)
  assert.deepEqual(kinds(issues), ['photo-bleed-gap:warn:0', 'photo-full-bleed:info:1'])
  assert.match(issues[0].detail, /^왼쪽 끝이/)
})

test('page count rules block ordering; empty pages are noted once', () => {
  const short = preflightBook({ pages: [page(), page(text('t', { xMm: 74, yMm: 100, wMm: 50, hMm: 6 })), page()] }, spec)
  assert.deepEqual(kinds(short), ['page-count:error:null', 'empty-page:info:0'])
  assert.equal(short[0].title, '47쪽이 더 필요해요')
  assert.match(short[1].detail, /^1, 3쪽이 비어 있어요/)
  const many = preflightBook({ pages: Array.from({ length: 50 }, () => page()) }, spec).find(issue => issue.kind === 'empty-page')
  assert.match(many.detail, /^1, 2, 3, 4, 5, 6쪽 외 44쪽이 비어 있어요/)
  const odd = preflightBook(book([], 51), spec)
  assert.equal(odd[0].title, '쪽 수를 짝수로 맞춰 주세요')
  assert.deepEqual(preflightBook(book([], 50), spec), [])
  assert.equal(preflightBook(book([], 202), spec)[0].title, '2쪽을 줄여야 해요')
})

test('a font outside the allowed list is an error', () => {
  const issues = preflightBook(book([page(text('f', { xMm: 74, yMm: 100, wMm: 50, hMm: 6 }, { font: 'comic' }))]), spec)
  assert.deepEqual(kinds(issues), ['font:error:0'])
})

test('order readiness: errors block, warnings ask, otherwise ready', () => {
  const warn = { id: 'w', kind: 'text-outside-safe', severity: 'warn', pageIndex: 3, title: '', detail: '' }
  const error = { ...warn, id: 'e', kind: 'page-count', severity: 'error', pageIndex: null }
  const info = { ...warn, id: 'i', kind: 'empty-page', severity: 'info', pageIndex: 7 }
  assert.equal(orderReadiness([info]), 'ready')
  assert.equal(orderReadiness([info, warn]), 'confirm')
  assert.equal(orderReadiness([warn, error]), 'blocked')
  assert.deepEqual(flaggedPages([info, warn, { ...warn, id: 'w2' }, error]), [3])
  assert.deepEqual(countBySeverity([info, warn, error]), { error: 1, warn: 1, info: 1 })
})

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} vs ${expected}`)

test('page boxes are the trim size plus bleed, in points', () => {
  const boxes = pageBoxesPt(spec)
  close(boxes.media[2], 154 * PT_PER_MM)
  close(boxes.media[3], 216 * PT_PER_MM)
  close(boxes.trim[0], 3 * PT_PER_MM)
  close(boxes.trim[3], 213 * PT_PER_MM)
  // The trim corner (0, 0) in book millimetres is the trim box's top-left in PDF space.
  const corner = mmToPdfPoint(0, 0, spec)
  close(corner.x, boxes.trim[0])
  close(corner.y, boxes.trim[3])
})

test('element matrices put the unit square on the element box, rotation clockwise', () => {
  const element = { xMm: 50, yMm: 40, wMm: 20, hMm: 10, rotationDeg: 0 }
  const m = elementMatrixPt(element, spec)
  const topLeft = apply(m, 0, 1)
  const expected = mmToPdfPoint(40, 35, spec)
  close(topLeft.x, expected.x)
  close(topLeft.y, expected.y)
  // Turned 90° clockwise, the box's top edge now runs down its right side.
  const turned = elementMatrixPt({ ...element, rotationDeg: 90 }, spec)
  const corner = apply(turned, 0, 1)
  const want = mmToPdfPoint(55, 30, spec)
  close(corner.x, want.x)
  close(corner.y, want.y)
})

test('a full crop draws the image on the element box; a crop enlarges it', () => {
  const element = { xMm: 74, yMm: 105, wMm: 100, hMm: 75, rotationDeg: 15, crop: { x: 0, y: 0, w: 1, h: 1 } }
  assert.deepEqual(imageMatrixPt(element, spec), elementMatrixPt(element, spec))
  // With the top-left quarter cropped, that quarter's corners meet the element's corners.
  const cropped = { ...element, rotationDeg: 0, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }
  const box = elementMatrixPt(cropped, spec)
  const image = imageMatrixPt(cropped, spec)
  const imageTopLeft = apply(image, 0, 1)
  const boxTopLeft = apply(box, 0, 1)
  close(imageTopLeft.x, boxTopLeft.x)
  close(imageTopLeft.y, boxTopLeft.y)
  const imageCentre = apply(image, 0.5, 0.5)
  const boxBottomRight = apply(box, 1, 0)
  close(imageCentre.x, boxBottomRight.x)
  close(imageCentre.y, boxBottomRight.y)
})

test('text placement starts at the box top-left with y running down', () => {
  const element = text('t', { xMm: 74, yMm: 50, wMm: 100, hMm: 20 })
  const placed = textPlacementPt(element, spec)
  const origin = apply(placed.matrix, 0, 0)
  const want = mmToPdfPoint(24, 40, spec)
  close(origin.x, want.x)
  close(origin.y, want.y)
  const down = apply(placed.matrix, 0, 10 * PT_PER_MM)
  close(down.y, mmToPdfPoint(24, 50, spec).y)
  assert.equal(placed.lineHeightPt, 18)
})

test('spreads open like a bound book: page 1 alone, then pairs', async () => {
  const { spreadCount, spreadOf, spreadPages } = await import('../src/lib/book/spreads.ts')
  assert.equal(spreadCount(50), 26)
  assert.equal(spreadCount(1), 1)
  assert.deepEqual(spreadPages(50, 0), [null, 0])
  assert.deepEqual(spreadPages(50, 1), [1, 2])
  assert.deepEqual(spreadPages(50, 25), [49, null])
  assert.deepEqual(spreadPages(50, 26), [null, null])
  assert.equal(spreadOf(0), 0)
  assert.equal(spreadOf(13), 7)
  assert.deepEqual(spreadPages(50, spreadOf(13)), [13, 14])
})
