import type { BookBackground, BookDraft, BookElement, BookImageElement, BookPage, BookTextElement } from '../../types/book'
import { normalizeRotation } from './geometry'
import { BOOK_SPECS } from './specs'
import { BOOK_FONT_IDS } from './styles'

/**
 * Bump when the stored shape changes, and add the step to `MIGRATIONS`.
 * 1: one page, Pretendard text. 2: background patterns, book fonts (additions only).
 */
export const BOOK_DRAFT_SCHEMA_VERSION = 2
const KEY_PREFIX = 'book-draft:'
const DEFAULT_BACKGROUND: BookBackground = { color: '#F7F2E8' }

/** One key per account and book, so one account never opens another's draft. */
export function draftStorageKey(uid: string, bookId: string): string {
  return `${KEY_PREFIX}${uid}:${bookId}`
}

export function isDraftStorageKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX)
}

export function createEmptyDraft(id: string, pageId: string, now: string): BookDraft {
  return {
    schemaVersion: BOOK_DRAFT_SCHEMA_VERSION, id, title: '', specId: 'a5-soft', updatedAt: now,
    pages: [{ id: pageId, background: { ...DEFAULT_BACKGROUND }, elements: [] }],
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

function readElement(raw: unknown): BookElement | null {
  if (!isObject(raw) || !text(raw.id, 100) || !raw.id) return null
  if (!finite(raw.xMm) || !finite(raw.yMm) || !positive(raw.wMm) || !positive(raw.hMm) || !finite(raw.rotationDeg)) return null
  const base = { id: raw.id, xMm: raw.xMm, yMm: raw.yMm, wMm: raw.wMm, hMm: raw.hMm, rotationDeg: normalizeRotation(raw.rotationDeg) }
  if (raw.type === 'image') {
    const ref = raw.ref, crop = raw.crop
    if (!isObject(ref) || !text(ref.postId, 200) || !ref.postId || !finite(ref.photoIndex) || ref.photoIndex < 0) return null
    if (!text(ref.url, 4000) || !/^https?:\/\//.test(ref.url) || !positive(ref.pxWidth) || !positive(ref.pxHeight)) return null
    if (!isObject(crop) || ![crop.x, crop.y, crop.w, crop.h].every(fraction)) return null
    const element: BookImageElement = {
      ...base, type: 'image',
      ref: { postId: ref.postId, photoIndex: ref.photoIndex, url: ref.url, pxWidth: ref.pxWidth, pxHeight: ref.pxHeight, ...(text(ref.thumbUrl, 4000) ? { thumbUrl: ref.thumbUrl } : {}) },
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

function readPage(raw: unknown): BookPage | null {
  if (!isObject(raw) || !text(raw.id, 100) || !raw.id || !Array.isArray(raw.elements)) return null
  // One damaged element should not cost the user the whole page.
  const elements = raw.elements.map(readElement).filter((element): element is BookElement => element !== null)
  return { id: raw.id, background: readBackground(raw.background), elements }
}

/** Each step upgrades a draft from version `index + 1` to the next. */
const MIGRATIONS: ((raw: Loose) => Loose)[] = [
  raw => ({ ...raw, schemaVersion: 2 }),
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
  if (!text(migrated.id, 100) || !migrated.id || !text(migrated.title, 200) || !text(migrated.updatedAt, 40)) return { status: 'unreadable' }
  if (typeof migrated.specId !== 'string' || !(migrated.specId in BOOK_SPECS) || !Array.isArray(migrated.pages)) return { status: 'unreadable' }
  const pages = migrated.pages.map(readPage).filter((page): page is BookPage => page !== null)
  if (!pages.length) return { status: 'unreadable' }
  return {
    status: 'ok',
    draft: {
      schemaVersion: BOOK_DRAFT_SCHEMA_VERSION, id: migrated.id, title: migrated.title,
      specId: migrated.specId as BookDraft['specId'], pages, updatedAt: migrated.updatedAt,
    },
  }
}

/** The draft, or null when there is none or it cannot be trusted. */
export function parseDraft(json: string | null): BookDraft | null {
  const stored = readStoredDraft(json)
  return stored.status === 'ok' ? stored.draft : null
}
