import type { BookBackground, BookCoverStyle, BookDraft, BookElement, BookImageElement, BookImageRef, BookPage, BookTextElement } from '../../types/book'
import { normalizeRotation } from './geometry'
import { BOOK_SPECS } from './specs'
import { BOOK_FONT_IDS } from './styles'

/**
 * Bump when the stored shape changes, and add the step to `MIGRATIONS`.
 * 1: one page, Pretendard text. 2: background patterns, book fonts (additions only).
 * 3: subtitle, cover, source records (additions only).
 */
export const BOOK_DRAFT_SCHEMA_VERSION = 3
export const BOOK_TITLE_MAX = 24
export const BOOK_SUBTITLE_MAX = 40
export const BOOK_COVER_STYLES: readonly BookCoverStyle[] = ['photo', 'minimal', 'kraft']
const KEY_PREFIX = 'book-draft:'
const SYNC_PREFIX = 'book-sync:'
export const DEFAULT_BACKGROUND: BookBackground = { color: '#F7F2E8' }

/** One key per account and book, so one account never opens another's draft. */
export function draftStorageKey(uid: string, bookId: string): string {
  return `${KEY_PREFIX}${uid}:${bookId}`
}

/** What the server last confirmed for that draft (see `sync.ts`). */
export function syncStorageKey(uid: string, bookId: string): string {
  return `${SYNC_PREFIX}${uid}:${bookId}`
}

/** Every key that holds a book draft or its sync record. */
export function isDraftStorageKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX) || key.startsWith(SYNC_PREFIX)
}

export function createEmptyPage(id: string, background: BookBackground = DEFAULT_BACKGROUND): BookPage {
  return { id, background: { ...background }, elements: [] }
}

export function createEmptyDraft(id: string, pageId: string, now: string): BookDraft {
  return {
    schemaVersion: BOOK_DRAFT_SCHEMA_VERSION, id, title: '', subtitle: '', specId: 'a5-soft',
    coverStyle: 'minimal', coverPhoto: null, sourcePostIds: [], updatedAt: now,
    pages: [createEmptyPage(pageId)],
  }
}

export function serializeDraft(draft: BookDraft): string {
  return JSON.stringify(draft)
}

type Loose = Record<string, unknown>
const isObject = (value: unknown): value is Loose => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown, max = 2000): value is string => typeof value === 'string' && value.length <= max
const positive = (value: unknown): value is number => finite(value) && value > 0
const fraction = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1
const color = (value: unknown): value is string => text(value, 20) && /^#[0-9a-f]{6}$/i.test(value)
const isId = (value: unknown): value is string => text(value, 100) && value.length > 0

export function readImageRef(ref: unknown): BookImageRef | null {
  if (!isObject(ref) || !text(ref.postId, 200) || !ref.postId || !finite(ref.photoIndex) || ref.photoIndex < 0) return null
  if (!text(ref.url, 4000) || !/^https?:\/\//.test(ref.url) || !positive(ref.pxWidth) || !positive(ref.pxHeight)) return null
  return {
    postId: ref.postId, photoIndex: ref.photoIndex, url: ref.url, pxWidth: ref.pxWidth, pxHeight: ref.pxHeight,
    ...(text(ref.thumbUrl, 4000) ? { thumbUrl: ref.thumbUrl } : {}),
    ...(positive(ref.printPxWidth) && positive(ref.printPxHeight) ? { printPxWidth: ref.printPxWidth, printPxHeight: ref.printPxHeight } : {}),
  }
}

function readElement(raw: unknown): BookElement | null {
  if (!isObject(raw) || !isId(raw.id)) return null
  if (!finite(raw.xMm) || !finite(raw.yMm) || !positive(raw.wMm) || !positive(raw.hMm) || !finite(raw.rotationDeg)) return null
  const base = { id: raw.id, xMm: raw.xMm, yMm: raw.yMm, wMm: raw.wMm, hMm: raw.hMm, rotationDeg: normalizeRotation(raw.rotationDeg) }
  if (raw.type === 'image') {
    const ref = readImageRef(raw.ref), crop = raw.crop
    if (!ref || !isObject(crop) || ![crop.x, crop.y, crop.w, crop.h].every(fraction)) return null
    const element: BookImageElement = {
      ...base, type: 'image', ref,
      crop: { x: crop.x as number, y: crop.y as number, w: crop.w as number, h: crop.h as number },
    }
    return element
  }
  if (raw.type === 'text') {
    if (!text(raw.text) || !raw.text.trim() || !positive(raw.sizePt) || !positive(raw.lineHeight)) return null
    if (!BOOK_FONT_IDS.includes(raw.font as BookTextElement['font'])) return null
    if (!color(raw.color) || !['left', 'center', 'right'].includes(raw.align as string)) return null
    const element: BookTextElement = {
      ...base, type: 'text', text: raw.text, font: raw.font as BookTextElement['font'], sizePt: raw.sizePt, color: raw.color,
      align: raw.align as BookTextElement['align'], lineHeight: raw.lineHeight,
    }
    return element
  }
  return null
}

function readBackground(raw: unknown): BookBackground {
  if (!isObject(raw) || !color(raw.color)) return { ...DEFAULT_BACKGROUND }
  return raw.pattern === 'grid' || raw.pattern === 'lined' ? { color: raw.color, pattern: raw.pattern } : { color: raw.color }
}

/** A page from storage or the server. `pageId` (the server document id) wins over a stored `id`. */
export function readPage(raw: unknown, pageId?: string): BookPage | null {
  if (!isObject(raw)) return null
  const id = pageId ?? raw.id
  if (!isId(id) || !Array.isArray(raw.elements)) return null
  // One damaged element should not cost the user the whole page.
  const elements = raw.elements.map(readElement).filter((element): element is BookElement => element !== null)
  return { id, background: readBackground(raw.background), elements }
}

export type BookMeta = Pick<BookDraft, 'title' | 'subtitle' | 'specId' | 'coverStyle' | 'coverPhoto' | 'sourcePostIds'>

/** Title, cover and records: the parts of a book that are not pages. */
export function readBookMeta(raw: Loose): BookMeta | null {
  if (!text(raw.title, 200) || typeof raw.specId !== 'string' || !(raw.specId in BOOK_SPECS)) return null
  const sources = Array.isArray(raw.sourcePostIds) ? raw.sourcePostIds.filter(isId) : []
  return {
    title: raw.title,
    subtitle: text(raw.subtitle, 200) ? raw.subtitle : '',
    specId: raw.specId as BookDraft['specId'],
    coverStyle: BOOK_COVER_STYLES.includes(raw.coverStyle as BookCoverStyle) ? raw.coverStyle as BookCoverStyle : 'minimal',
    coverPhoto: readImageRef(raw.coverPhoto),
    sourcePostIds: [...new Set(sources)],
  }
}

/** Each step upgrades a draft from version `index + 1` to the next. */
const MIGRATIONS: ((raw: Loose) => Loose)[] = [
  raw => ({ ...raw, schemaVersion: 2 }),
  raw => ({ subtitle: '', coverStyle: 'minimal', coverPhoto: null, sourcePostIds: [], ...raw, schemaVersion: 3 }),
]

export type StoredDraft =
  | { status: 'missing' }
  | { status: 'ok'; draft: BookDraft }
  /** Written by a newer app version. Open nothing and overwrite nothing. */
  | { status: 'newer' }
  /** Present but damaged. Kept as it is until the user decides. */
  | { status: 'unreadable' }

/** What is stored under a draft key, checked field by field. */
export function readStoredDraft(json: string | null): StoredDraft {
  if (json === null) return { status: 'missing' }
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return { status: 'unreadable' } }
  if (!isObject(raw) || !finite(raw.schemaVersion) || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) return { status: 'unreadable' }
  if (raw.schemaVersion > BOOK_DRAFT_SCHEMA_VERSION) return { status: 'newer' }
  let migrated: Loose = raw
  while ((migrated.schemaVersion as number) < BOOK_DRAFT_SCHEMA_VERSION) migrated = MIGRATIONS[(migrated.schemaVersion as number) - 1](migrated)
  const meta = readBookMeta(migrated)
  if (!meta || !isId(migrated.id) || !text(migrated.updatedAt, 40) || !Array.isArray(migrated.pages)) return { status: 'unreadable' }
  const pages = migrated.pages.map(page => readPage(page)).filter((page): page is BookPage => page !== null)
  if (!pages.length) return { status: 'unreadable' }
  return { status: 'ok', draft: { schemaVersion: BOOK_DRAFT_SCHEMA_VERSION, id: migrated.id, ...meta, pages, updatedAt: migrated.updatedAt } }
}

/** The draft, or null when there is none or it cannot be trusted. */
export function parseDraft(json: string | null): BookDraft | null {
  const stored = readStoredDraft(json)
  return stored.status === 'ok' ? stored.draft : null
}
