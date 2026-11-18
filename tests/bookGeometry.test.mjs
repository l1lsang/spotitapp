import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyTransform, elementBoxPx, fitNewImage, fitPageLayout, hitTest, limitScale, MIN_ELEMENT_MM,
  NO_TRANSFORM, normalizeRotation, pagePxToMm, snapRotation, TEXT_SIZE_PT,
} from '../src/lib/book/geometry.ts'
import { createGestureSession } from '../src/lib/book/gestureSession.ts'
import { getBookSpec } from '../src/lib/book/specs.ts'

const spec = getBookSpec('a5-soft')
const image = (over = {}) => ({
  id: 'a', type: 'image', xMm: 74, yMm: 105, wMm: 60, hMm: 40, rotationDeg: 0,
  ref: { postId: 'p', photoIndex: 0, url: 'https://x/y.jpg', pxWidth: 1600, pxHeight: 1067 },
  crop: { x: 0, y: 0, w: 1, h: 1 }, ...over,
})
const text = (over = {}) => ({
  id: 't', type: 'text', xMm: 74, yMm: 105, wMm: 100, hMm: 6.35, rotationDeg: 0,
  text: '안녕', font: 'pretendard', sizePt: 12, color: '#161F1B', align: 'left', lineHeight: 1.5, ...over,
})
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} ≠ ${expected}`)

test('the page keeps A5 proportions, bleed included, in any area', () => {
  const narrow = fitPageLayout(spec, 308, 2000)
  close(narrow.widthPx, 308, 'width bound')
  close(narrow.heightPx / narrow.widthPx, 216 / 154, 'ratio')
  const short = fitPageLayout(spec, 2000, 432)
  close(short.heightPx, 432, 'height bound')
})

test('screen points and element boxes convert through millimetres, not pixels', () => {
  const layout = fitPageLayout(spec, 308, 432) // 2px per mm
  close(layout.scale, 2, 'scale')
  assert.deepEqual(pagePxToMm(6, 6, layout), { x: 0, y: 0 }) // the trim corner sits inside the 3mm bleed
  const box = elementBoxPx(image({ xMm: 74, yMm: 105, wMm: 60, hMm: 40 }), layout)
  assert.deepEqual(box, { left: (74 - 30 + 3) * 2, top: (105 - 20 + 3) * 2, width: 120, height: 80 })
})

test('rotation is normalised to (-180, 180] and snaps onto right angles nearby', () => {
  assert.equal(normalizeRotation(270), -90)
  assert.equal(normalizeRotation(-180), 180)
  assert.equal(normalizeRotation(Number.NaN), 0)
  assert.equal(snapRotation(87), 90)
  assert.equal(snapRotation(-3), 0)
  assert.equal(snapRotation(30), 30)
  assert.equal(snapRotation(178), 180)
})

test('moving keeps the centre on the trimmed page, so nothing is lost off the edge', () => {
  const moved = applyTransform(image(), { ...NO_TRANSFORM, dxMm: 500, dyMm: -500 }, spec)
  assert.equal(moved.xMm, spec.trimMm.w)
  assert.equal(moved.yMm, 0)
})

test('resizing keeps proportions and stops at the smallest grabbable size', () => {
  const grown = applyTransform(image(), { ...NO_TRANSFORM, scale: 1.5 }, spec)
  close(grown.wMm / grown.hMm, 60 / 40, 'aspect')
  close(grown.wMm, 90, 'grown width')
  const tiny = applyTransform(image(), { ...NO_TRANSFORM, scale: 0.01 }, spec)
  close(Math.min(tiny.wMm, tiny.hMm), MIN_ELEMENT_MM, 'minimum side')
  assert.equal(limitScale(image(), Number.NaN, spec), 1)
})

test('text scales its font with its box, within the readable range', () => {
  const big = applyTransform(text(), { ...NO_TRANSFORM, scale: 2 }, spec)
  assert.equal(big.sizePt, 24)
  close(big.wMm, 200, 'box width')
  const small = applyTransform(text({ wMm: 120 }), { ...NO_TRANSFORM, scale: 0.1 }, spec)
  assert.equal(small.sizePt, TEXT_SIZE_PT.min)
})

test('a tap finds the topmost element, through rotation, with a fingertip-sized target', () => {
  const below = image({ id: 'below' })
  const above = image({ id: 'above', xMm: 80 })
  assert.equal(hitTest([below, above], 80, 105), 'above')
  assert.equal(hitTest([below, above], 46, 105), 'below')
  assert.equal(hitTest([below, above], 5, 5), null)
  const turned = image({ id: 'turned', wMm: 80, hMm: 10, rotationDeg: 90 })
  assert.equal(hitTest([turned], 74, 140), 'turned') // along the turned long side
  assert.equal(hitTest([turned], 110, 105), null)
  const sliver = image({ id: 'sliver', wMm: 40, hMm: 2 })
  assert.equal(hitTest([sliver], 74, 108.5), 'sliver') // 9mm target, not 2mm
})

test('a new photo keeps its proportions inside the safe area', () => {
  const tall = fitNewImage(1200, 1600, spec)
  close(tall.wMm / tall.hMm, 0.75, 'aspect')
  assert.ok(tall.hMm <= (spec.trimMm.h - spec.safeMm * 2) * 0.7 + 1e-9)
  assert.ok(fitNewImage(0, 0, spec).wMm > 0)
})

test('one touch sequence of pan, pinch and turn becomes one edit when the last finger lifts', () => {
  const session = createGestureSession()
  const target = image()
  session.begin(target)
  session.begin(null) // the pinch joins the drag
  session.change({ dxMm: 5 })
  session.change({ scale: 1.2 })
  assert.equal(session.end(), null)
  assert.equal(session.isIdle(), false)
  const frame = session.end()
  assert.equal(frame.target, target)
  assert.deepEqual(frame.transform, { dxMm: 5, dyMm: 0, scale: 1.2, dRotationDeg: 0 })
  assert.equal(session.isIdle(), true)
})

test('a gesture that never moved, or started on empty paper, produces no edit', () => {
  const session = createGestureSession()
  session.begin(image())
  assert.equal(session.end(), null)
  session.begin(null)
  assert.equal(session.change({ dxMm: 3 }), null)
  assert.equal(session.end(), null)
})
