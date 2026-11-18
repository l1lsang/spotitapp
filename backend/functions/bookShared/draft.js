// Generated from src/lib/book/draft.ts by scripts/build-book-shared.mjs. Do not edit:
// change the source, then run `node scripts/build-book-shared.mjs`.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BACKGROUND = exports.BOOK_COVER_STYLES = exports.BOOK_SUBTITLE_MAX = exports.BOOK_TITLE_MAX = exports.BOOK_DRAFT_SCHEMA_VERSION = void 0;
exports.draftStorageKey = draftStorageKey;
exports.syncStorageKey = syncStorageKey;
exports.isDraftStorageKey = isDraftStorageKey;
exports.createEmptyPage = createEmptyPage;
exports.createEmptyDraft = createEmptyDraft;
exports.serializeDraft = serializeDraft;
exports.readImageRef = readImageRef;
exports.readPage = readPage;
exports.readBookMeta = readBookMeta;
exports.readStoredDraft = readStoredDraft;
exports.parseDraft = parseDraft;
const geometry_1 = require("./geometry");
const specs_1 = require("./specs");
const styles_1 = require("./styles");
/**
 * Bump when the stored shape changes, and add the step to `MIGRATIONS`.
 * 1: one page, Pretendard text. 2: background patterns, book fonts (additions only).
 * 3: subtitle, cover, source records (additions only).
 */
exports.BOOK_DRAFT_SCHEMA_VERSION = 3;
exports.BOOK_TITLE_MAX = 24;
exports.BOOK_SUBTITLE_MAX = 40;
exports.BOOK_COVER_STYLES = ['photo', 'minimal', 'kraft'];
const KEY_PREFIX = 'book-draft:';
const SYNC_PREFIX = 'book-sync:';
exports.DEFAULT_BACKGROUND = { color: '#F7F2E8' };
/** One key per account and book, so one account never opens another's draft. */
function draftStorageKey(uid, bookId) {
    return `${KEY_PREFIX}${uid}:${bookId}`;
}
/** What the server last confirmed for that draft (see `sync.ts`). */
function syncStorageKey(uid, bookId) {
    return `${SYNC_PREFIX}${uid}:${bookId}`;
}
/** Every key that holds a book draft or its sync record. */
function isDraftStorageKey(key) {
    return key.startsWith(KEY_PREFIX) || key.startsWith(SYNC_PREFIX);
}
function createEmptyPage(id, background = exports.DEFAULT_BACKGROUND) {
    return { id, background: { ...background }, elements: [] };
}
function createEmptyDraft(id, pageId, now) {
    return {
        schemaVersion: exports.BOOK_DRAFT_SCHEMA_VERSION, id, title: '', subtitle: '', specId: 'a5-soft',
        coverStyle: 'minimal', coverPhoto: null, sourcePostIds: [], updatedAt: now,
        pages: [createEmptyPage(pageId)],
    };
}
function serializeDraft(draft) {
    return JSON.stringify(draft);
}
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const text = (value, max = 2000) => typeof value === 'string' && value.length <= max;
const positive = (value) => finite(value) && value > 0;
const fraction = (value) => finite(value) && value >= 0 && value <= 1;
const color = (value) => text(value, 20) && /^#[0-9a-f]{6}$/i.test(value);
const isId = (value) => text(value, 100) && value.length > 0;
function readImageRef(ref) {
    if (!isObject(ref) || !text(ref.postId, 200) || !ref.postId || !finite(ref.photoIndex) || ref.photoIndex < 0)
        return null;
    if (!text(ref.url, 4000) || !/^https?:\/\//.test(ref.url) || !positive(ref.pxWidth) || !positive(ref.pxHeight))
        return null;
    return { postId: ref.postId, photoIndex: ref.photoIndex, url: ref.url, pxWidth: ref.pxWidth, pxHeight: ref.pxHeight, ...(text(ref.thumbUrl, 4000) ? { thumbUrl: ref.thumbUrl } : {}) };
}
function readElement(raw) {
    if (!isObject(raw) || !isId(raw.id))
        return null;
    if (!finite(raw.xMm) || !finite(raw.yMm) || !positive(raw.wMm) || !positive(raw.hMm) || !finite(raw.rotationDeg))
        return null;
    const base = { id: raw.id, xMm: raw.xMm, yMm: raw.yMm, wMm: raw.wMm, hMm: raw.hMm, rotationDeg: (0, geometry_1.normalizeRotation)(raw.rotationDeg) };
    if (raw.type === 'image') {
        const ref = readImageRef(raw.ref), crop = raw.crop;
        if (!ref || !isObject(crop) || ![crop.x, crop.y, crop.w, crop.h].every(fraction))
            return null;
        const element = {
            ...base, type: 'image', ref,
            crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h },
        };
        return element;
    }
    if (raw.type === 'text') {
        if (!text(raw.text) || !raw.text.trim() || !positive(raw.sizePt) || !positive(raw.lineHeight))
            return null;
        if (!styles_1.BOOK_FONT_IDS.includes(raw.font))
            return null;
        if (!color(raw.color) || !['left', 'center', 'right'].includes(raw.align))
            return null;
        const element = {
            ...base, type: 'text', text: raw.text, font: raw.font, sizePt: raw.sizePt, color: raw.color,
            align: raw.align, lineHeight: raw.lineHeight,
        };
        return element;
    }
    return null;
}
function readBackground(raw) {
    if (!isObject(raw) || !color(raw.color))
        return { ...exports.DEFAULT_BACKGROUND };
    return raw.pattern === 'grid' || raw.pattern === 'lined' ? { color: raw.color, pattern: raw.pattern } : { color: raw.color };
}
/** A page from storage or the server. `pageId` (the server document id) wins over a stored `id`. */
function readPage(raw, pageId) {
    if (!isObject(raw))
        return null;
    const id = pageId ?? raw.id;
    if (!isId(id) || !Array.isArray(raw.elements))
        return null;
    // One damaged element should not cost the user the whole page.
    const elements = raw.elements.map(readElement).filter((element) => element !== null);
    return { id, background: readBackground(raw.background), elements };
}
/** Title, cover and records: the parts of a book that are not pages. */
function readBookMeta(raw) {
    if (!text(raw.title, 200) || typeof raw.specId !== 'string' || !(raw.specId in specs_1.BOOK_SPECS))
        return null;
    const sources = Array.isArray(raw.sourcePostIds) ? raw.sourcePostIds.filter(isId) : [];
    return {
        title: raw.title,
        subtitle: text(raw.subtitle, 200) ? raw.subtitle : '',
        specId: raw.specId,
        coverStyle: exports.BOOK_COVER_STYLES.includes(raw.coverStyle) ? raw.coverStyle : 'minimal',
        coverPhoto: readImageRef(raw.coverPhoto),
        sourcePostIds: [...new Set(sources)],
    };
}
/** Each step upgrades a draft from version `index + 1` to the next. */
const MIGRATIONS = [
    raw => ({ ...raw, schemaVersion: 2 }),
    raw => ({ subtitle: '', coverStyle: 'minimal', coverPhoto: null, sourcePostIds: [], ...raw, schemaVersion: 3 }),
];
/** What is stored under a draft key, checked field by field. */
function readStoredDraft(json) {
    if (json === null)
        return { status: 'missing' };
    let raw;
    try {
        raw = JSON.parse(json);
    }
    catch {
        return { status: 'unreadable' };
    }
    if (!isObject(raw) || !finite(raw.schemaVersion) || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1)
        return { status: 'unreadable' };
    if (raw.schemaVersion > exports.BOOK_DRAFT_SCHEMA_VERSION)
        return { status: 'newer' };
    let migrated = raw;
    while (migrated.schemaVersion < exports.BOOK_DRAFT_SCHEMA_VERSION)
        migrated = MIGRATIONS[migrated.schemaVersion - 1](migrated);
    const meta = readBookMeta(migrated);
    if (!meta || !isId(migrated.id) || !text(migrated.updatedAt, 40) || !Array.isArray(migrated.pages))
        return { status: 'unreadable' };
    const pages = migrated.pages.map(page => readPage(page)).filter((page) => page !== null);
    if (!pages.length)
        return { status: 'unreadable' };
    return { status: 'ok', draft: { schemaVersion: exports.BOOK_DRAFT_SCHEMA_VERSION, id: migrated.id, ...meta, pages, updatedAt: migrated.updatedAt } };
}
/** The draft, or null when there is none or it cannot be trusted. */
function parseDraft(json) {
    const stored = readStoredDraft(json);
    return stored.status === 'ok' ? stored.draft : null;
}
