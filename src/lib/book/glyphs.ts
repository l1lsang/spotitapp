import type { BookFontId } from '../../types/book'
import { GLYPH_COVERAGE } from './glyphCoverage'

// Which characters a book font can draw, and how text is split when it cannot.
// The app and the print renderer use the same rule, so a missing character looks the
// same on screen and on paper: it is drawn with the fallback font instead.

export const FALLBACK_FONT: BookFontId = 'pretendard'

type Ranges = { starts: number[]; ends: number[] }
const decoded = new Map<BookFontId, Ranges>()

export function decodeRanges(encoded: string): Ranges {
  const starts: number[] = []
  const ends: number[] = []
  let previous = -1
  for (const token of encoded ? encoded.split(',') : []) {
    const [gap, size] = token.split('.').map(part => parseInt(part, 36))
    const first = previous + 1 + gap
    starts.push(first)
    ends.push(first + size)
    previous = first + size
  }
  return { starts, ends }
}

function ranges(font: BookFontId): Ranges {
  let value = decoded.get(font)
  if (!value) {
    value = decodeRanges(GLYPH_COVERAGE[font] ?? '')
    decoded.set(font, value)
  }
  return value
}

/** Line breaks, tabs and spaces never need a glyph of their own. */
const isLayoutOnly = (code: number) => code === 0x0a || code === 0x0d || code === 0x09 || code === 0x20

export function hasGlyph(font: BookFontId, code: number): boolean {
  if (isLayoutOnly(code)) return true
  const { starts, ends } = ranges(font)
  let low = 0
  let high = starts.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (code < starts[mid]) high = mid - 1
    else if (code > ends[mid]) low = mid + 1
    else return true
  }
  return false
}

export interface FontRun {
  text: string
  font: BookFontId
}

/**
 * The text cut into runs drawn with one font each: the element's font where it has
 * the character, the fallback font otherwise. Spaces stay with the run they are in.
 */
export function fontRuns(text: string, font: BookFontId): FontRun[] {
  const runs: FontRun[] = []
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const current = runs[runs.length - 1]
    const use = isLayoutOnly(code) && current ? current.font : hasGlyph(font, code) ? font : FALLBACK_FONT
    if (current && current.font === use) current.text += char
    else runs.push({ text: char, font: use })
  }
  return runs
}

export interface GlyphReport {
  /** Characters drawn with the fallback font instead (distinct, in order of appearance). */
  fallback: string[]
  /** Characters no book font can draw: they would print as empty boxes. */
  missing: string[]
}

export function glyphReport(text: string, font: BookFontId): GlyphReport {
  const fallback = new Set<string>()
  const missing = new Set<string>()
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    // Variation selectors and joiners only adjust the character before them.
    if (hasGlyph(font, code) || (code >= 0xfe00 && code <= 0xfe0f) || code === 0x200d) continue
    if (hasGlyph(FALLBACK_FONT, code)) fallback.add(char)
    else missing.add(char)
  }
  return { fallback: [...fallback], missing: [...missing] }
}
