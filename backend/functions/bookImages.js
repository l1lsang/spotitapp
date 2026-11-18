// Prepares record photos for the print PDF with as little quality loss as possible.
// pdf-lib embeds JPEG bytes as they are, so this decides what those bytes are:
//   - a photo already at or below what its placement needs is kept pixel for pixel; only
//     its metadata (EXIF with GPS, XMP, IPTC, comments) is cut out of the file, losslessly;
//   - a photo far larger than needed (print copies are up to 4096px) is scaled down once
//     to the print target, so a 200-page book stays a sensible size;
//   - a photo whose EXIF says to rotate it, or that is not a JPEG, is re-encoded upright,
//     because the PDF would otherwise ignore the rotation every viewer applies.
// Photos are never enlarged (no upscaling, see docs/book-feature-design.md).
const { Buffer } = require('node:buffer')
const sharp = require('sharp')

/** Pixels per inch a placed photo is scaled down to. Print checks warn below 200. */
const TARGET_DPI = 300
/** Scale-downs smaller than this keep the original pixels instead. */
const MIN_USEFUL_SCALE = 0.9
const RESIZED_QUALITY = 93
const MM_PER_INCH = 25.4

// Several large photos decode one after another; the decoded-image cache only costs memory.
sharp.cache(false)
sharp.concurrency(1)

/** Pixel size and EXIF orientation, with width and height as the photo is meant to be seen. */
async function inspectImage(bytes) {
  const meta = await sharp(bytes).metadata()
  const orientation = meta.orientation || 1
  const turned = orientation >= 5 && orientation <= 8
  return {
    format: meta.format,
    width: turned ? meta.height : meta.width,
    height: turned ? meta.width : meta.height,
    orientation,
  }
}

/**
 * The share of a photo's pixels its largest placement needs at TARGET_DPI (capped at 1).
 * `placements` are image elements: their size in mm and the crop as fractions.
 */
function neededScale(width, height, placements) {
  let scale = 0
  for (const { wMm, hMm, crop } of placements) {
    scale = Math.max(scale,
      (TARGET_DPI * wMm / MM_PER_INCH) / (width * crop.w),
      (TARGET_DPI * hMm / MM_PER_INCH) / (height * crop.h))
  }
  return Math.min(1, scale)
}

// APP1 (EXIF, XMP), APP13 (IPTC) and COM segments carry metadata, never pixels or colour.
const METADATA_MARKERS = new Set([0xe1, 0xed, 0xfe])

/**
 * The JPEG with its metadata segments removed and every other byte unchanged (APP0, the
 * ICC profile in APP2, tables and the compressed image itself). Null if it is not a
 * well-formed JPEG header.
 */
function stripJpegMetadata(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const parts = [bytes.subarray(0, 2)]
  let at = 2
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null
    const marker = bytes[at + 1]
    // Start of scan: the compressed image data runs to the end of the file.
    if (marker === 0xda) {
      parts.push(bytes.subarray(at))
      return Buffer.concat(parts)
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3]
    if (length < 2 || at + 2 + length > bytes.length) return null
    if (!METADATA_MARKERS.has(marker)) parts.push(bytes.subarray(at, at + 2 + length))
    at += 2 + length
  }
  return null
}

/**
 * Bytes ready to embed: `{ bytes, width, height, sourceWidth, sourceHeight, resized }`,
 * or null for a file that is not an image sharp can read. `source*` is the upright size
 * of the file as stored, which is what print resolution is judged on.
 */
async function prepareImage(bytes, placements) {
  let info
  try {
    info = await inspectImage(bytes)
  } catch {
    return null
  }
  if (!info.width || !info.height) return null
  const scale = neededScale(info.width, info.height, placements)
  const resize = scale < MIN_USEFUL_SCALE
  if (!resize && info.format === 'jpeg' && info.orientation === 1) {
    const stripped = stripJpegMetadata(bytes)
    if (stripped) return { bytes: stripped, width: info.width, height: info.height, sourceWidth: info.width, sourceHeight: info.height, resized: false }
  }
  const width = Math.max(1, Math.round(info.width * (resize ? scale : 1)))
  const output = await sharp(bytes)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    // sRGB output with no metadata (sharp's default): what print expects, and no GPS.
    .jpeg({ quality: RESIZED_QUALITY, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true })
  return { bytes: output.data, width: output.info.width, height: output.info.height, sourceWidth: info.width, sourceHeight: info.height, resized: resize }
}

module.exports = { prepareImage, inspectImage, neededScale, stripJpegMetadata, TARGET_DPI, MIN_USEFUL_SCALE }
