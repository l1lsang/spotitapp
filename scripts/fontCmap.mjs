// Reads which characters a TrueType/OpenType font can draw, straight from its `cmap`
// table (formats 4 and 12), without a font library. Used to build
// src/lib/book/glyphCoverage.ts, so the app and the print renderer agree on which
// characters fall back to another font.

function tables(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint16(4)
  const found = {}
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4))
    found[tag] = { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) }
  }
  return { view, found }
}

function format4(view, at, into) {
  const segments = view.getUint16(at + 6) / 2
  const ends = at + 14
  const starts = ends + segments * 2 + 2
  const deltas = starts + segments * 2
  const rangeOffsets = deltas + segments * 2
  for (let s = 0; s < segments; s++) {
    const end = view.getUint16(ends + s * 2)
    const start = view.getUint16(starts + s * 2)
    const delta = view.getInt16(deltas + s * 2)
    const rangeOffset = view.getUint16(rangeOffsets + s * 2)
    for (let code = start; code <= end && code !== 0xffff; code++) {
      let glyph
      if (rangeOffset === 0) glyph = (code + delta) & 0xffff
      else {
        const index = rangeOffsets + s * 2 + rangeOffset + (code - start) * 2
        glyph = view.getUint16(index)
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff
      }
      if (glyph !== 0) into.add(code)
    }
  }
}

function format12(view, at, into) {
  const groups = view.getUint32(at + 12)
  for (let g = 0; g < groups; g++) {
    const base = at + 16 + g * 12
    const start = view.getUint32(base)
    const end = view.getUint32(base + 4)
    const glyph = view.getUint32(base + 8)
    for (let code = start; code <= end; code++) if (glyph + (code - start) !== 0) into.add(code)
  }
}

/** Every Unicode code point the font maps to a real glyph. */
export function fontCodePoints(bytes) {
  const { view, found } = tables(bytes)
  if (!found.cmap) throw new Error('font has no cmap table')
  const cmap = found.cmap.offset
  const count = view.getUint16(cmap + 2)
  const subtables = []
  for (let i = 0; i < count; i++) {
    const platform = view.getUint16(cmap + 4 + i * 8)
    const encoding = view.getUint16(cmap + 6 + i * 8)
    const at = cmap + view.getUint32(cmap + 8 + i * 8)
    // Unicode subtables only: Windows BMP (3,1), Windows full (3,10), Unicode platform (0,*).
    if ((platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0) subtables.push({ format: view.getUint16(at), at })
  }
  const codes = new Set()
  for (const { format, at } of subtables) {
    if (format === 4) format4(view, at, codes)
    else if (format === 12) format12(view, at, codes)
  }
  if (!codes.size) throw new Error('no Unicode cmap subtable (format 4 or 12)')
  return codes
}

/** Sorted, merged [first, last] ranges. */
export function toRanges(codes) {
  const sorted = [...codes].sort((a, b) => a - b)
  const ranges = []
  for (const code of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && code === last[1] + 1) last[1] = code
    else ranges.push([code, code])
  }
  return ranges
}
