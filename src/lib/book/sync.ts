import type { BookDraft, BookPage } from '../../types/book'

// What the server has confirmed, as fingerprints. Comparing the open draft with it gives
// the smallest write: the pages that changed, the pages removed, and the book document.

export interface SyncSnapshot {
  /** The server revision these fingerprints describe. */
  revision: number
  meta: string
  pages: Record<string, string>
}

export interface SyncState extends SyncSnapshot {
  /**
   * A write sent but not yet confirmed. If the app stops before the answer, the next
   * start can tell whether the server took it (same revision and content) or not.
   */
  inflight?: SyncSnapshot
}

export interface SyncPlan {
  /** Revision the write is based on; the server must still be at it. */
  baseRevision: number
  upserts: BookPage[]
  deletes: string[]
}

/** JSON with object keys sorted, so equal content always gives the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** cyrb53: a fast 53-bit string hash. Not for security; it only spots changed content. */
function hash53(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const fingerprint = (value: unknown) => {
  const json = canonicalJson(value)
  return `${json.length.toString(36)}.${hash53(json)}`
}

/** Fields stored on the book document, page order included. */
export function bookMetaOf(draft: BookDraft) {
  return {
    title: draft.title, subtitle: draft.subtitle, specId: draft.specId, coverStyle: draft.coverStyle,
    coverPhoto: draft.coverPhoto, sourcePostIds: draft.sourcePostIds, pageIds: draft.pages.map(page => page.id),
  }
}

/** Fields stored on a page document. */
export function pageContentOf(page: BookPage) {
  return { background: page.background, elements: page.elements }
}

export function snapshotOf(draft: BookDraft, revision: number): SyncSnapshot {
  const pages: Record<string, string> = {}
  for (const page of draft.pages) pages[page.id] = fingerprint(pageContentOf(page))
  return { revision, meta: fingerprint(bookMetaOf(draft)), pages }
}

export function sameSnapshotContent(a: SyncSnapshot, b: SyncSnapshot): boolean {
  if (a.meta !== b.meta) return false
  const keys = Object.keys(a.pages)
  return keys.length === Object.keys(b.pages).length && keys.every(key => a.pages[key] === b.pages[key])
}

/** The write that brings the server from `synced` to `draft`, or null when they match. */
export function planSync(draft: BookDraft, synced: SyncSnapshot): SyncPlan | null {
  const next = snapshotOf(draft, synced.revision)
  const upserts = draft.pages.filter(page => synced.pages[page.id] !== next.pages[page.id])
  const deletes = Object.keys(synced.pages).filter(id => !(id in next.pages))
  if (!upserts.length && !deletes.length && next.meta === synced.meta) return null
  return { baseRevision: synced.revision, upserts, deletes }
}

const isSnapshot = (value: unknown): value is SyncSnapshot => {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  return Number.isInteger(raw.revision) && (raw.revision as number) >= 1 && typeof raw.meta === 'string'
    && !!raw.pages && typeof raw.pages === 'object' && Object.values(raw.pages).every(item => typeof item === 'string')
}

export function readSyncState(json: string | null): SyncState | null {
  if (!json) return null
  try {
    const raw: unknown = JSON.parse(json)
    if (!isSnapshot(raw)) return null
    const inflight = (raw as SyncState).inflight
    return { revision: raw.revision, meta: raw.meta, pages: raw.pages, ...(isSnapshot(inflight) ? { inflight } : {}) }
  } catch {
    return null
  }
}

export type OpenDecision =
  /** Open this draft; `synced` is what the server holds (the draft may be ahead of it). */
  | { kind: 'open'; draft: BookDraft; synced: SyncSnapshot }
  /** This device has edits the server never got, and the server changed since. */
  | { kind: 'conflict'; local: BookDraft; server: BookDraft; serverSynced: SyncSnapshot }

/**
 * Which copy to open, given what this device kept and what the server returned.
 * Local edits win only when they are based on the server's current revision.
 */
export function decideOnOpen(server: { draft: BookDraft; revision: number }, local: BookDraft | null, localSync: SyncState | null): OpenDecision {
  const serverSynced = snapshotOf(server.draft, server.revision)
  const fromServer: OpenDecision = { kind: 'open', draft: server.draft, synced: serverSynced }
  if (!local || local.id !== server.draft.id) return fromServer
  if (!localSync) {
    // A copy with no record of what the server had: only an identical one can give way silently.
    if (sameSnapshotContent(snapshotOf(local, server.revision), serverSynced)) return fromServer
    return { kind: 'conflict', local, server: server.draft, serverSynced }
  }
  const base = localSync.revision === server.revision ? localSync
    : localSync.inflight && localSync.inflight.revision === server.revision && sameSnapshotContent(localSync.inflight, serverSynced) ? localSync.inflight
      : null
  if (base) {
    if (!planSync(local, base)) return fromServer
    return { kind: 'open', draft: local, synced: base }
  }
  // The server moved on. Unedited local copies simply give way to it.
  if (!planSync(local, localSync)) return fromServer
  if (sameSnapshotContent(snapshotOf(local, server.revision), serverSynced)) return fromServer
  return { kind: 'conflict', local, server: server.draft, serverSynced }
}
