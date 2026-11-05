import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as dateLib from '../src/lib/date.ts'
import { parseExifDateTime, parseExifObject, parsePhotoMetadata, summarizePhotoMetadata } from '../src/lib/photoMetadata.ts'

const ascii = text => [...text].map(char => char.charCodeAt(0))
const EXIF_HEADER = [...ascii('Exif'), 0, 0]
const TYPE_IDS = { ascii: 2, short: 3, long: 4, rational: 5 }
const TYPE_SIZES = { ascii: 1, short: 2, long: 4, rational: 8 }

// Writes IFDs in order; a long value given as a name points at that IFD.
function buildTiff(groups, little = true) {
  const bytes = new Uint8Array(4096)
  const view = new DataView(bytes.buffer)
  bytes.set(ascii(little ? 'II' : 'MM'))
  view.setUint16(2, 42, little)
  view.setUint32(4, 8, little)
  const offsets = {}
  let cursor = 8
  for (const [name, entries] of groups) {
    offsets[name] = cursor
    cursor += 2 + entries.length * 12 + 4
  }
  let data = cursor
  for (const [name, entries] of groups) {
    let position = offsets[name]
    view.setUint16(position, entries.length, little)
    position += 2
    for (const { tag, type, value } of entries) {
      const raw = type === 'ascii' ? [...ascii(value), 0] : value
      const count = type === 'rational' ? raw.length / 2 : raw.length
      const size = TYPE_SIZES[type] * count
      view.setUint16(position, tag, little)
      view.setUint16(position + 2, TYPE_IDS[type], little)
      view.setUint32(position + 4, count, little)
      let target = position + 8
      if (size > 4) {
        view.setUint32(position + 8, data, little)
        target = data
        data += size + (size % 2)
      }
      raw.forEach((item, index) => {
        if (type === 'ascii') bytes[target + index] = item
        else if (type === 'short') view.setUint16(target + index * 2, item, little)
        else view.setUint32(target + index * 4, typeof item === 'string' ? offsets[item] : item, little)
      })
      position += 12
    }
  }
  return bytes.slice(0, data)
}

const SEOUL = { lat: [37, 1, 34, 1, 865, 100], lng: [126, 1, 58, 1, 2556, 100] }
const expectedLat = 37 + 34 / 60 + 8.65 / 3600
const expectedLng = 126 + 58 / 60 + 25.56 / 3600

function sampleTiff({ little = true, gps = SEOUL, latRef = 'N', lngRef = 'E', original = '2026:10:17 16:32:05', offset = '+09:00' } = {}) {
  const exif = [{ tag: 0x9003, type: 'ascii', value: original }]
  if (offset) exif.push({ tag: 0x9011, type: 'ascii', value: offset })
  const ifd0 = [
    { tag: 0x0112, type: 'short', value: [6] },
    { tag: 0x0132, type: 'ascii', value: '2026:10:20 09:00:00' },
    { tag: 0x8769, type: 'long', value: ['exif'] },
  ]
  const groups = [['ifd0', ifd0], ['exif', exif]]
  if (gps) {
    ifd0.push({ tag: 0x8825, type: 'long', value: ['gps'] })
    groups.push(['gps', [
      { tag: 1, type: 'ascii', value: latRef }, { tag: 2, type: 'rational', value: gps.lat },
      { tag: 3, type: 'ascii', value: lngRef }, { tag: 4, type: 'rational', value: gps.lng },
    ]])
  }
  return buildTiff(groups, little)
}

const segment = (marker, payload) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const XMP_SEGMENT = segment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x:xmpmeta exif:GPSLatitude="37,34.1N"/>')])
const SCAN = [0xff, 0xda, 0, 4, 1, 2, 9, 8, 7, 0xff, 0xd9]

function jpeg(tiff, { xmp = false } = {}) {
  return new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe0, [...ascii('JFIF'), 0]),
    ...(tiff ? segment(0xe1, [...EXIF_HEADER, ...tiff]) : []),
    ...(xmp ? XMP_SEGMENT : []),
    ...segment(0xdb, [0, 1, 2]),
    ...SCAN,
  ])
}

const be32 = value => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
const le32 = value => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]
const pngChunk = (type, data) => [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0]
const png = tiff => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...pngChunk('IHDR', new Array(13).fill(1)), ...pngChunk('eXIf', [...tiff]), ...pngChunk('IDAT', [1, 2, 3]), ...pngChunk('IEND', [])])
const riffChunk = (type, data) => [...ascii(type), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])]

function webp(tiff) {
  const body = [
    ...riffChunk('VP8X', [0x0c, 0, 0, 0, 1, 0, 0, 1, 0, 0]),
    ...riffChunk('VP8 ', [9, 9, 9]),
    ...riffChunk('EXIF', [...EXIF_HEADER, ...tiff]),
    ...riffChunk('XMP ', ascii('<x:xmpmeta/>')),
  ]
  return new Uint8Array([...ascii('RIFF'), ...le32(body.length + 4), ...ascii('WEBP'), ...body])
}

test('JPEG EXIF gives the GPS position and the capture time in either byte order', () => {
  const little = parsePhotoMetadata(jpeg(sampleTiff()))
  assert.ok(Math.abs(little.location.lat - expectedLat) < 1e-9)
  assert.ok(Math.abs(little.location.lng - expectedLng) < 1e-9)
  assert.equal(little.takenAt.dateKey, '2026-10-17')
  assert.equal(little.takenAt.time, '16:32')
  assert.equal(little.takenAt.sortValue, Date.UTC(2026, 9, 17, 7, 32, 5))

  const southWest = parsePhotoMetadata(jpeg(sampleTiff({ little: false, latRef: 'S', lngRef: 'W', offset: '' })))
  assert.ok(Math.abs(southWest.location.lat + expectedLat) < 1e-9)
  assert.ok(Math.abs(southWest.location.lng + expectedLng) < 1e-9)
  assert.equal(southWest.takenAt.sortValue, new Date(2026, 9, 17, 16, 32, 5).getTime())
})

test('PNG and WebP photos carry the same EXIF block', () => {
  for (const bytes of [png(sampleTiff()), webp(sampleTiff({ little: false }))]) {
    const metadata = parsePhotoMetadata(bytes)
    assert.ok(Math.abs(metadata.location.lat - expectedLat) < 1e-9)
    assert.equal(metadata.takenAt.dateKey, '2026-10-17')
  }
})

test('missing, placeholder or impossible values are ignored instead of guessed', () => {
  assert.deepEqual(parsePhotoMetadata(jpeg(null)), { location: null, takenAt: null })
  assert.deepEqual(parsePhotoMetadata(new Uint8Array(ascii('not an image'))), { location: null, takenAt: null })
  assert.equal(parsePhotoMetadata(jpeg(sampleTiff({ gps: null }))).location, null)
  assert.equal(parsePhotoMetadata(jpeg(sampleTiff({ gps: { lat: [0, 1, 0, 1, 0, 1], lng: [0, 1, 0, 1, 0, 1] } }))).location, null)
  assert.equal(parsePhotoMetadata(jpeg(sampleTiff({ gps: { lat: [37, 0, 0, 1, 0, 1], lng: SEOUL.lng } }))).location, null)
  // An impossible original date falls back to the file's last-modified EXIF date.
  assert.equal(parsePhotoMetadata(jpeg(sampleTiff({ original: '2026:02:31 10:00:00' }))).takenAt.dateKey, '2026-10-20')
  assert.equal(parseExifDateTime('0000:00:00 00:00:00'), null)
  assert.equal(parseExifDateTime('2026:10:17 24:10:00'), null)
  assert.deepEqual(parseExifDateTime('2026:01:02 03:04'), { dateKey: '2026-01-02', time: '03:04', sortValue: new Date(2026, 0, 2, 3, 4).getTime() })
})

test('truncated or corrupt files never throw while reading metadata', () => {
  const bytes = jpeg(sampleTiff(), { xmp: true })
  for (let length = 0; length <= bytes.length; length += 1) {
    assert.doesNotThrow(() => parsePhotoMetadata(bytes.slice(0, length)))
  }
  const noisy = bytes.slice()
  for (let index = 20; index < noisy.length; index += 7) noisy[index] = 0xff
  assert.doesNotThrow(() => parsePhotoMetadata(noisy))
})

test('the first located photo places the pin and the earliest capture at that place sets the date', () => {
  const at = (dateKey, time, sortValue) => ({ dateKey, time, sortValue })
  const home = { lat: 37.5691, lng: 126.9804 }
  const summary = summarizePhotoMetadata([
    { location: null, takenAt: at('2026-10-12', '13:15', 500) },
    { location: home, takenAt: at('2026-10-17', '16:40', 2000) },
    { location: { lat: 37.5736, lng: 126.9804 }, takenAt: at('2026-10-17', '16:32', 1000) },
    { location: { lat: 37.5694, lng: 126.9806 }, takenAt: at('2026-10-17', '18:00', 3000) },
  ])
  assert.deepEqual(summary.location, home)
  assert.equal(summary.locationIndex, 1)
  // An earlier photo from another day or about 500m away does not move the record's date.
  assert.equal(summary.takenAt.dateKey, '2026-10-17')
  assert.equal(summary.takenAt.time, '16:40')
  assert.equal(summary.missingLocationCount, 1)
  // About 500m north counts as another place; about 40m does not.
  assert.equal(summary.distantPhotoCount, 1)
  // Without any date at the pin, the earliest date in the selection is used.
  assert.equal(summarizePhotoMetadata([{ location: home, takenAt: null }, { location: null, takenAt: at('2026-10-12', '09:00', 1) }]).takenAt.time, '09:00')
  assert.deepEqual(summarizePhotoMetadata([{ location: null, takenAt: null }]),
    { location: null, locationIndex: -1, takenAt: null, missingLocationCount: 1, distantPhotoCount: 0 })
})


test('capture dates read naturally in Korean', () => {
  assert.equal(dateLib.formatDateKeyWithWeekday('2026-10-17'), '2026년 10월 17일 (토)')
  assert.equal(dateLib.formatDateKeyWithWeekday('2026-10-12'), '2026년 10월 12일 (월)')
  assert.equal(dateLib.formatClockTime('16:32'), '오후 4:32')
  assert.equal(dateLib.formatClockTime('00:05'), '오전 12:05')
  assert.equal(dateLib.formatClockTime('12:00'), '오후 12:00')
})


test('picker EXIF objects give the same position and capture time on Android and iOS', () => {
  // Android sends signed decimal degrees; iOS sends unsigned degrees with a hemisphere.
  const android = parseExifObject({ GPSLatitude: -33.8568, GPSLongitude: 151.2153, GPSLatitudeRef: 'S', GPSLongitudeRef: 'E', DateTimeOriginal: '2026:10:17 16:32:05' })
  assert.deepEqual(android.location, { lat: -33.8568, lng: 151.2153 })
  assert.equal(android.takenAt.dateKey, '2026-10-17')
  const ios = parseExifObject({ GPSLatitude: 33.8568, GPSLatitudeRef: 'S', GPSLongitude: 151.2153, GPSLongitudeRef: 'E', DateTimeOriginal: '2026:10:17 16:32:05', OffsetTimeOriginal: '+09:00' })
  assert.deepEqual(ios.location, { lat: -33.8568, lng: 151.2153 })
  assert.equal(ios.takenAt.sortValue, Date.UTC(2026, 9, 17, 7, 32, 5))
  const rational = parseExifObject({ GPSLatitude: '37/1,34/1,865/100', GPSLatitudeRef: 'N', GPSLongitude: '126/1,58/1,2556/100', GPSLongitudeRef: 'E' })
  assert.ok(Math.abs(rational.location.lat - expectedLat) < 1e-9)
  assert.ok(Math.abs(rational.location.lng - expectedLng) < 1e-9)
})

test('picker EXIF without GPS, with a placeholder fix or an impossible date stays empty', () => {
  assert.deepEqual(parseExifObject(null), { location: null, takenAt: null })
  assert.deepEqual(parseExifObject({ Make: 'Camera' }), { location: null, takenAt: null })
  assert.equal(parseExifObject({ GPSLatitude: 0, GPSLongitude: 0 }).location, null)
  assert.equal(parseExifObject({ GPSLatitude: 'not a number', GPSLongitude: 127 }).location, null)
  assert.equal(parseExifObject({ DateTimeOriginal: '2026:02:31 10:00:00', DateTime: '2026:10:20 09:00:00' }).takenAt.dateKey, '2026-10-20')
  assert.equal(parseExifDateTime(''), null)
})
