import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptPhotoPrints, needsPrintCopy, printPathFor, printPxOf, printSizeOf } from '../src/lib/photoPrint.ts'
import { readImageRef } from '../src/lib/book/draft.ts'
import { effectiveDpi, preflightBook } from '../src/lib/book/preflight.ts'
import { getBookSpec } from '../src/lib/book/specs.ts'

const spec = getBookSpec('a5-soft')

test('a print copy sits in a print folder beside its display file', () => {
  assert.equal(printPathFor('posts/u1/p1/1700000000000-abc.jpg'), 'posts/u1/p1/print/1700000000000-abc.jpg')
  for (const other of ['posts/u1/p1/print/a.jpg', 'posts/u1/a.jpg', 'profiles/u1/a.jpg', 'chats/c1/u1/a.jpg', '']) assert.equal(printPathFor(other), '')
})

test('only photos larger than the display copy get a print copy', () => {
  assert.equal(needsPrintCopy(4032, 3024), true)
  assert.equal(needsPrintCopy(1600, 1200), false)
  assert.equal(needsPrintCopy(1080, 1920), true)
  // Size unknown (some web files): try, then decide from the encoded size.
  assert.equal(needsPrintCopy(undefined, undefined), true)
})

const post = {
  photoUrls: ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg'],
  photoPrints: [{ url: 'https://x/c.jpg', width: 4096, height: 3072 }, { url: 'https://x/a.jpg', width: 3072, height: 4096 }],
}

test('print sizes are matched to photos by URL, not position', () => {
  assert.deepEqual(printSizeOf(post, 0), { width: 3072, height: 4096 })
  assert.equal(printSizeOf(post, 1), null)
  assert.deepEqual(printSizeOf(post, 2), { width: 4096, height: 3072 })
  assert.equal(printSizeOf(post, 3), null)
  assert.equal(printSizeOf({ photoUrls: post.photoUrls }, 0), null)
  assert.deepEqual(printPxOf(post, 2), { printPxWidth: 4096, printPxHeight: 3072 })
  assert.deepEqual(printPxOf(post, 1), {})
})

test('editing a record keeps the print copies of the photos it still shows, in the new order', () => {
  assert.deepEqual(keptPhotoPrints(post.photoPrints, ['https://x/c.jpg', 'https://x/b.jpg', 'https://x/a.jpg']).map(print => print.url), ['https://x/c.jpg', 'https://x/a.jpg'])
  assert.deepEqual(keptPhotoPrints(post.photoPrints, ['https://x/b.jpg']), [])
  assert.deepEqual(keptPhotoPrints(undefined, ['https://x/a.jpg']), [])
})

const ref = extra => ({ postId: 'p1', photoIndex: 0, url: 'https://x/a.jpg', pxWidth: 1600, pxHeight: 1200, ...extra })
const placed = extra => ({ id: 'i1', type: 'image', ref: ref(extra), crop: { x: 0, y: 0, w: 1, h: 1 }, xMm: 74, yMm: 105, wMm: 148, hMm: 111, rotationDeg: 0 })

test('book photos keep the print size, and print DPI is measured on it', () => {
  assert.deepEqual(readImageRef(ref({ printPxWidth: 4096, printPxHeight: 3072 })), ref({ printPxWidth: 4096, printPxHeight: 3072 }))
  assert.deepEqual(readImageRef(ref({ printPxWidth: 4096 })), ref())
  assert.deepEqual(readImageRef(ref({ printPxWidth: -1, printPxHeight: 3072 })), ref())
  // A full-width photo: 1600px over 148mm is about 275dpi, 4096px about 703dpi.
  assert.equal(Math.round(effectiveDpi(placed())), 275)
  assert.equal(Math.round(effectiveDpi(placed({ printPxWidth: 4096, printPxHeight: 3072 }))), 703)
})

test('a photo blown up past its display copy is fine once it has a print copy', () => {
  // Cropped to a quarter: 400px over 148mm is about 69dpi without a print copy.
  const zoomed = extra => ({ pages: [{ id: 'p', background: { color: '#FFFFFF' }, elements: [{ ...placed(extra), crop: { x: 0, y: 0, w: 0.25, h: 0.25 } }] }] })
  const resolution = draft => preflightBook(draft, spec).filter(issue => issue.kind === 'photo-resolution').map(issue => issue.severity)
  assert.deepEqual(resolution(zoomed()), ['error'])
  assert.deepEqual(resolution(zoomed({ printPxWidth: 4096, printPxHeight: 3072 })), ['warn'])
  const detail = preflightBook(zoomed({ printPxWidth: 4096, printPxHeight: 3072 }), spec).find(issue => issue.kind === 'photo-resolution').detail
  assert.match(detail, /저장된 가장 큰 사진으로 계산했어요/)
})
