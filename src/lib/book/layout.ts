import type { BookImageRef, BookPage, BookTextElement } from '../../types/book'
import { createEmptyPage } from './draft'
import { MM_PER_PT } from './geometry'
import type { BookSpec } from './specs'

// First pages of a new book, laid out from the records the user picked: a title page,
// then each record's photos and words. Everything stays freely editable afterwards.
// Text sizes here are estimates; the editor measures the real height when it draws.

export interface LayoutRecord {
  postId: string
  title: string
  placeName: string
  dateKey: string
  content: string
  /** Photos with their measured pixel sizes. */
  photos: BookImageRef[]
}

/** What the page count estimate needs before any photo is measured. */
export type RecordOutline = Pick<LayoutRecord, 'title' | 'placeName' | 'dateKey' | 'content'> & { photoCount: number }

const MUTED = '#6E7470'
const INK = '#161F1B'
const STYLE = {
  bookTitle: { font: 'gowun-batang', sizePt: 22, lineHeight: 1.4 },
  bookSubtitle: { font: 'pretendard', sizePt: 11, lineHeight: 1.5 },
  title: { font: 'gowun-batang', sizePt: 14, lineHeight: 1.4 },
  meta: { font: 'pretendard', sizePt: 9, lineHeight: 1.5 },
  body: { font: 'pretendard', sizePt: 10, lineHeight: 1.6 },
} as const
type TextRole = keyof typeof STYLE

const GAP_MM = 3
/** The first photo of a record never takes more than this much height. */
const LEAD_PHOTO_MAX_H = 104

const isWide = (char: string) => /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(char)
const charWidthMm = (char: string, sizePt: number) => (isWide(char) ? 1 : char === ' ' ? 0.3 : 0.55) * sizePt * MM_PER_PT

const lineMm = (role: TextRole) => STYLE[role].sizePt * MM_PER_PT * STYLE[role].lineHeight

/** Lines a text needs in a box this wide (an estimate from typical glyph widths). */
export function estimateLines(text: string, role: TextRole, widthMm: number): number {
  let lines = 0
  for (const paragraph of text.split('\n')) {
    let width = 0
    let count = 1
    for (const char of paragraph) {
      const w = charWidthMm(char, STYLE[role].sizePt)
      if (width + w > widthMm) { count++; width = w } else width += w
    }
    lines += count
  }
  return Math.max(1, lines)
}

const textHeight = (text: string, role: TextRole, widthMm: number) => estimateLines(text, role, widthMm) * lineMm(role)

/** Splits text into pieces that each fit `maxLines`, breaking at a space when one is near. */
export function splitText(text: string, role: TextRole, widthMm: number, maxLines: number): string[] {
  const chunks: string[] = []
  let start = 0
  let lines = 1
  let width = 0
  const chars = [...text]
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]
    if (char === '\n') { lines++; width = 0 } else {
      const w = charWidthMm(char, STYLE[role].sizePt)
      if (width + w > widthMm) { lines++; width = w } else width += w
    }
    if (lines > maxLines) {
      let cut = i
      for (let j = i; j > Math.max(start, i - 20); j--) if (/\s/.test(chars[j])) { cut = j + 1; break }
      chunks.push(chars.slice(start, cut).join('').trim())
      start = cut
      i = cut - 1
      lines = 1
      width = 0
    }
  }
  const rest = chars.slice(start).join('').trim()
  if (rest || !chunks.length) chunks.push(rest)
  return chunks.filter(Boolean)
}

const safeBox = (spec: BookSpec) => ({ x: spec.safeMm, y: spec.safeMm, w: spec.trimMm.w - spec.safeMm * 2, h: spec.trimMm.h - spec.safeMm * 2 })

export function formatRecordMeta(record: Pick<LayoutRecord, 'placeName' | 'dateKey'>): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(record.dateKey) ? record.dateKey.replaceAll('-', '.') : ''
  return [record.placeName.trim(), date].filter(Boolean).join(' · ')
}

/**
 * How a record's words fall onto pages: the part on its first page (under the lead
 * photo, if any) and the pages that follow. Decided with the tallest lead photo, so
 * the estimate before measuring matches the final layout.
 */
function planWords(record: RecordOutline, spec: BookSpec) {
  const box = safeBox(spec)
  const meta = formatRecordMeta(record)
  const title = record.title.trim()
  let top = record.photoCount > 0 ? LEAD_PHOTO_MAX_H + GAP_MM * 2 : 0
  if (title) top += textHeight(title, 'title', box.w) + 1
  if (meta) top += textHeight(meta, 'meta', box.w) + GAP_MM
  const content = record.content.trim()
  const firstLines = Math.floor((box.h - top) / lineMm('body'))
  const pageLines = Math.floor(box.h / lineMm('body'))
  if (!content) return { first: '', rest: [] as string[] }
  if (estimateLines(content, 'body', box.w) <= firstLines) return { first: content, rest: [] }
  // A long text starts on a fresh page instead of being squeezed under the photo.
  return { first: '', rest: splitText(content, 'body', box.w, pageLines) }
}

/** Pages one record will take: its first page, overflow text pages, two photos per extra page. */
export function estimateRecordPages(record: RecordOutline, spec: BookSpec): number {
  return 1 + planWords(record, spec).rest.length + Math.ceil(Math.max(0, record.photoCount - 1) / 2)
}

/** Pages the whole book starts with: a title page plus every record's pages. */
export function estimateBookPages(records: readonly RecordOutline[], spec: BookSpec): number {
  return 1 + records.reduce((sum, record) => sum + estimateRecordPages(record, spec), 0)
}

/** The smallest page count that holds the records and can be printed, or null when too many. */
export function suggestPageCount(contentPages: number, spec: BookSpec): number | null {
  const { min, max, step } = spec.pages
  const rounded = Math.ceil(Math.max(contentPages, min) / step) * step
  return rounded > max ? null : rounded
}

type NewId = () => string

function textElement(id: string, text: string, role: TextRole, box: { x: number; y: number; w: number }, extra: Partial<BookTextElement> = {}): BookTextElement {
  const h = textHeight(text, role, box.w)
  const style = STYLE[role]
  return {
    id, type: 'text', text, font: style.font, sizePt: style.sizePt, lineHeight: style.lineHeight,
    color: role === 'meta' || role === 'bookSubtitle' ? MUTED : INK, align: 'left',
    xMm: box.x + box.w / 2, yMm: box.y + h / 2, wMm: box.w, hMm: h, rotationDeg: 0, ...extra,
  }
}

function photoElement(id: string, ref: BookImageRef, box: { x: number; y: number; w: number; h: number }, alignTop = false) {
  const ratio = ref.pxWidth / ref.pxHeight
  const wMm = Math.min(box.w, box.h * ratio)
  const hMm = wMm / ratio
  return {
    id, type: 'image' as const, ref, crop: { x: 0, y: 0, w: 1, h: 1 }, rotationDeg: 0, wMm, hMm,
    xMm: box.x + box.w / 2, yMm: alignTop ? box.y + hMm / 2 : box.y + box.h / 2,
  }
}

export function layoutTitlePage(title: string, subtitle: string, spec: BookSpec, newId: NewId): BookPage {
  const box = safeBox(spec)
  const page = createEmptyPage(newId())
  const top = spec.trimMm.h * 0.36
  const heading = textElement(newId(), title.trim() || '제목 없는 책', 'bookTitle', { x: box.x, y: top, w: box.w }, { align: 'center' })
  page.elements.push(heading)
  if (subtitle.trim()) page.elements.push(textElement(newId(), subtitle.trim(), 'bookSubtitle', { x: box.x, y: top + heading.hMm + GAP_MM, w: box.w }, { align: 'center' }))
  return page
}

export function layoutRecordPages(record: LayoutRecord, spec: BookSpec, newId: NewId): BookPage[] {
  const box = safeBox(spec)
  const words = planWords({ ...record, photoCount: record.photos.length }, spec)
  const first = createEmptyPage(newId())
  let y = box.y
  const [lead, ...others] = record.photos
  if (lead) {
    const photo = photoElement(newId(), lead, { ...box, h: LEAD_PHOTO_MAX_H }, true)
    first.elements.push(photo)
    y += photo.hMm + GAP_MM * 2
  }
  const title = record.title.trim()
  if (title) {
    const element = textElement(newId(), title, 'title', { x: box.x, y, w: box.w })
    first.elements.push(element)
    y += element.hMm + 1
  }
  const meta = formatRecordMeta(record)
  if (meta) {
    const element = textElement(newId(), meta, 'meta', { x: box.x, y, w: box.w })
    first.elements.push(element)
    y += element.hMm + GAP_MM
  }
  if (words.first) first.elements.push(textElement(newId(), words.first, 'body', { x: box.x, y, w: box.w }))
  const pages = [first]
  for (const chunk of words.rest) {
    const page = createEmptyPage(newId())
    page.elements.push(textElement(newId(), chunk, 'body', { x: box.x, y: box.y, w: box.w }))
    pages.push(page)
  }
  for (let i = 0; i < others.length; i += 2) {
    const page = createEmptyPage(newId())
    const pair = others.slice(i, i + 2)
    const h = pair.length === 2 ? (box.h - GAP_MM * 2) / 2 : box.h * 0.8
    pair.forEach((ref, index) => page.elements.push(photoElement(newId(), ref, {
      x: box.x, w: box.w, h, y: pair.length === 2 ? box.y + index * (h + GAP_MM * 2) : box.y + (box.h - h) / 2,
    })))
    pages.push(page)
  }
  return pages
}

/** Title page, the records in order, then blank pages up to `pageCount`. */
export function layoutBook(input: { title: string; subtitle: string; records: readonly LayoutRecord[]; pageCount: number }, spec: BookSpec, newId: NewId): BookPage[] {
  const pages = [layoutTitlePage(input.title, input.subtitle, spec, newId), ...input.records.flatMap(record => layoutRecordPages(record, spec, newId))]
  while (pages.length < input.pageCount) pages.push(createEmptyPage(newId()))
  return pages
}
