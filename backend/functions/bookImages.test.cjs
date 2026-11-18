const test = require('node:test')
const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const sharp = require('sharp')
const { prepareImage, inspectImage, neededScale, stripJpegMetadata, TARGET_DPI } = require('./bookImages')

const make = (width, height, { orientation, exif, format = 'jpeg' } = {}) => {
  let image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
  image = format === 'png' ? image.png() : image.jpeg({ quality: 95 })
  if (orientation || exif) image = image.withMetadata({ ...(orientation ? { orientation } : {}), ...(exif ? { exif } : {}) })
  return image.toBuffer()
}
const place = (wMm, hMm, crop = { x: 0, y: 0, w: 1, h: 1 }) => ({ wMm, hMm, crop })
const GPS = { IFD0: { Copyright: 'taken-at-37.5665N-126.9780E' } }

test('a placement needs 300dpi of the visible part, never more than the photo has', () => {
  // 148mm wide at 300dpi is 1748px; from a 4096px photo that is about 43%.
  assert.equal(Math.round(neededScale(4096, 3072, [place(148, 111)]) * 1000), Math.round((TARGET_DPI * 148 / 25.4) / 4096 * 1000))
  // Cropping to half the width doubles what is needed; the largest placement decides.
  assert.ok(neededScale(4096, 3072, [place(148, 111, { x: 0, y: 0, w: 0.5, h: 0.5 })]) > 0.8)
  assert.equal(neededScale(4096, 3072, [place(40, 30), place(148, 111, { x: 0, y: 0, w: 0.4, h: 0.4 })]), 1)
  assert.equal(neededScale(1600, 1200, [place(148, 111)]), 1)
})

test('metadata is cut from a JPEG without touching a single image byte', async () => {
  const original = await make(320, 240, { exif: GPS })
  assert.ok(original.includes(Buffer.from('taken-at')))
  const stripped = stripJpegMetadata(original)
  assert.ok(!stripped.includes(Buffer.from('taken-at')))
  // The compressed image data (from the start-of-scan marker on) is identical.
  const scan = bytes => bytes.subarray(bytes.indexOf(Buffer.from([0xff, 0xda])))
  assert.ok(scan(stripped).equals(scan(original)))
  assert.equal((await sharp(stripped).metadata()).width, 320)
  assert.equal(stripJpegMetadata(Buffer.from('not a jpeg')), null)
  assert.equal(stripJpegMetadata(original.subarray(0, 30)), null)
})

test('a photo already at or below what print needs keeps its pixels and loses its metadata', async () => {
  const display = await make(1600, 1200, { exif: GPS })
  const prepared = await prepareImage(display, [place(148, 111)])
  assert.equal(prepared.resized, false)
  assert.deepEqual([prepared.width, prepared.height, prepared.sourceWidth, prepared.sourceHeight], [1600, 1200, 1600, 1200])
  assert.ok(!prepared.bytes.includes(Buffer.from('taken-at')))
  assert.ok(prepared.bytes.length <= display.length)
})

test('a large print copy is scaled down once to the print target', async () => {
  const print = await make(4096, 3072, { exif: GPS })
  const prepared = await prepareImage(print, [place(148, 111)])
  assert.equal(prepared.resized, true)
  assert.deepEqual([prepared.width, prepared.height], [1748, 1311])
  assert.deepEqual([prepared.sourceWidth, prepared.sourceHeight], [4096, 3072])
  assert.ok(!prepared.bytes.includes(Buffer.from('taken-at')))
  // Barely smaller than the original is not worth a re-encode.
  const almost = await prepareImage(await make(1900, 1425), [place(148, 111)])
  assert.equal(almost.resized, false)
  assert.equal(almost.width, 1900)
})

test('EXIF rotation is applied to the pixels, since the PDF would ignore the tag', async () => {
  // Stored 400x300 with "rotate 90°": seen upright as 300x400.
  const turned = await make(400, 300, { orientation: 6 })
  assert.deepEqual(await inspectImage(turned), { format: 'jpeg', width: 300, height: 400, orientation: 6 })
  const prepared = await prepareImage(turned, [place(40, 30)])
  assert.deepEqual([prepared.width, prepared.height], [300, 400])
  assert.equal((await sharp(prepared.bytes).metadata()).orientation, undefined)
})

test('other image types become JPEG, and unreadable files are refused', async () => {
  const png = await prepareImage(await make(300, 200, { format: 'png' }), [place(40, 30)])
  assert.equal((await sharp(png.bytes).metadata()).format, 'jpeg')
  assert.equal(await prepareImage(Buffer.from('<html>'), [place(40, 30)]), null)
})
