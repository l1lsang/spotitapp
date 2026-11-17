import type { BookBackground, BookFontId } from '../../types/book'
import { TEXT_SIZE_PT } from './geometry'

export interface BookFont {
  id: BookFontId
  label: string
  /** Name registered with expo-font; null means the app's own UI font. */
  family: string | null
}

export const BOOK_FONTS: readonly BookFont[] = [
  { id: 'nanum-pen', label: '손글씨', family: 'NanumPen-Regular' },
  { id: 'gowun-batang', label: '명조', family: 'GowunBatang-Regular' },
  { id: 'pretendard', label: '고딕', family: null },
]
export const BOOK_FONT_IDS: readonly BookFontId[] = BOOK_FONTS.map(font => font.id)

export function getBookFont(id: BookFontId): BookFont {
  return BOOK_FONTS.find(font => font.id === id) ?? BOOK_FONTS[BOOK_FONTS.length - 1]
}

export const TEXT_COLORS = [
  { color: '#161F1B', label: '먹색' },
  { color: '#974426', label: '벽돌색' },
  { color: '#234E43', label: '초록' },
  { color: '#8A6236', label: '갈색' },
  { color: '#3F5F82', label: '파랑' },
  { color: '#6E7470', label: '회색' },
  { color: '#FFFFFF', label: '흰색' },
] as const

export const PAGE_BACKGROUNDS: readonly { id: string; label: string; background: BookBackground }[] = [
  { id: 'cream', label: '크림', background: { color: '#F7F2E8' } },
  { id: 'white', label: '흰 종이', background: { color: '#FFFFFF' } },
  { id: 'grid', label: '모눈', background: { color: '#F4F5EE', pattern: 'grid' } },
  { id: 'lined', label: '줄지', background: { color: '#FFFFFF', pattern: 'lined' } },
  { id: 'kraft', label: '크라프트', background: { color: '#D9C3A5' } },
  { id: 'night', label: '밤', background: { color: '#2F3B4A' } },
]

/** Spacing of the printed lines, in millimetres. */
export const PATTERN_STEP_MM = { grid: 5, lined: 8 } as const

export function sameBackground(a: BookBackground, b: BookBackground): boolean {
  return a.color.toUpperCase() === b.color.toUpperCase() && (a.pattern ?? null) === (b.pattern ?? null)
}

/** The next text size up or down: 1pt steps for body text, larger steps for headings. */
export function stepTextSize(sizePt: number, direction: 1 | -1): number {
  const current = Math.round(sizePt)
  const step = (direction > 0 ? current : current - 1) >= 32 ? 4 : (direction > 0 ? current : current - 1) >= 14 ? 2 : 1
  return Math.min(TEXT_SIZE_PT.max, Math.max(TEXT_SIZE_PT.min, current + direction * step))
}
