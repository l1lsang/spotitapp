import type { BookDraft, BookElement, BookImageElement, BookPage, BookTextElement } from '../../types/book'
import { normalizeRotation } from './geometry'
import { BOOK_SPECS } from './specs'

/** Bump when the stored shape changes, and teach `migrateDraft` the step. */
export const BOOK_DRAFT_SCHEMA_VERSION = 1
const KEY_PREFIX = 'book-draft:'

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
    pages: [{ id: pageId, background: { color: '#F7F2E8' }, elements: [] }],
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
    if (!text(raw.text) || !raw.text.trim() || raw.font !== 'pretendard' || !positive(raw.sizePt) || !positive(raw.lineHeight)) return null
    if (!text(raw.color, 20) || !/^#[0-9a-f]{6}$/i.test(raw.color) || !['left', 'center', 'right'].includes(raw.align as string)) return null
    const element: BookTextElement = {
      ...base, type: 'text', text: raw.text, font: 'pretendard', sizePt: raw.sizePt, color: raw.color,
      align: raw.align as BookTextElement['align'], lineHeight: raw.lineHeight,
    }
    return element
  }
  return null
}

function readPage(raw: unknown): BookPage | null {
  if (!isObject(raw) || !text(raw.id, 100) || !raw.id || !Array.isArray(raw.elements)) return null
  const background = isObject(raw.background) && text(raw.background.color, 20) && /^#[0-9a-f]{6}$/i.test(raw.background.color)
    ? { color: raw.background.color } : { color: '#F7F2E8' }
  // One damaged element should not cost the user the whole page.
  const elements = raw.elements.map(readElement).filter((element): element is BookElement => element !== null)
  return { id: raw.id, background, elements }
}

/** Upgrades an older stored draft in place of a version check scattered over the app. */
export function migrateDraft(raw: Loose): Loose | null {
  const version = raw.schemaVersion
  if (!finite(version) || version < 1) return null
  // Written by a newer app version: do not guess, and do not overwrite it.
  if (version > BOOK_DRAFT_SCHEMA_VERSION) return null
  return raw
}

/** A stored draft, checked field by field. Returns null when it cannot be trusted. */
export function parseDraft(json: string | null): BookDraft | null {
  if (!json) return null
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return null }
  if (!isObject(raw)) return null
  const migrated = migrateDraft(raw)
  if (!migrated) return null
  if (!text(migrated.id, 100) || !migrated.id || !text(migrated.title, 200) || !text(migrated.updatedAt, 40)) return null
  if (typeof migrated.specId !== 'string' || !(migrated.specId in BOOK_SPECS) || !Array.isArray(migrated.pages)) return null
  const pages = migrated.pages.map(readPage).filter((page): page is BookPage => page !== null)
  if (!pages.length) return null
  return {
    schemaVersion: BOOK_DRAFT_SCHEMA_VERSION, id: migrated.id, title: migrated.title,
    specId: migrated.specId as BookDraft['specId'], pages, updatedAt: migrated.updatedAt,
  }
}
