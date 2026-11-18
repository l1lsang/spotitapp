// Two-page spreads as a bound book opens: page 1 alone on the right, then pairs
// (2–3, 4–5, …). Indexes are 0-based; null is an empty side.

export function spreadCount(pageCount: number): number {
  return 1 + Math.ceil(Math.max(0, pageCount - 1) / 2)
}

export function spreadPages(pageCount: number, spread: number): [number | null, number | null] {
  if (spread <= 0) return [null, pageCount ? 0 : null]
  const left = spread * 2 - 1
  if (left >= pageCount) return [null, null]
  return [left, left + 1 < pageCount ? left + 1 : null]
}

/** The spread that shows a page. */
export function spreadOf(pageIndex: number): number {
  return Math.ceil(Math.max(0, pageIndex) / 2)
}
