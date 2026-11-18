import type { BookSpecId } from '../../types/book'

export interface BookSpec {
  id: BookSpecId
  label: string
  trimMm: { w: number; h: number }
  /** Extra image area printed past the trim line and cut off. */
  bleedMm: number
  /** Keep text and important parts this far inside the trim line. */
  safeMm: number
  pages: { min: number; max: number; step: number }
  /** Effective print resolution of a photo: below `warn` it may look soft, below `block` it cannot be ordered. */
  minEffectiveDpi: { warn: number; block: number }
}

// Assumed values until the print partner's BookSpecs response confirms them
// (docs/book-feature-design.md, 4.1 and 6.1). Change them here, not in screens.
export const BOOK_SPECS: Record<BookSpecId, BookSpec> = {
  'a5-soft': {
    id: 'a5-soft',
    label: 'A5 소프트커버',
    trimMm: { w: 148, h: 210 },
    bleedMm: 3,
    safeMm: 8,
    pages: { min: 50, max: 200, step: 2 },
    minEffectiveDpi: { warn: 200, block: 100 },
  },
}

export function getBookSpec(id: BookSpecId): BookSpec {
  return BOOK_SPECS[id]
}
