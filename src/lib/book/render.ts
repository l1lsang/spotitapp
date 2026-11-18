import type { BookDraft } from '../../types/book'
import type { IssueSeverity, PreflightIssue } from './preflight'
import { planSync, type SyncState } from './sync'

// The print file made on the server (renderBookPdf) as the app sees it. The server
// draws what is saved there, at one revision, so the app only asks once this
// device's copy is that same saved revision.

export interface RenderSummary {
  revision: number
  pageCount: number
  counts: Record<IssueSeverity, number>
  readiness: 'blocked' | 'confirm' | 'ready'
  /** The server's print check: the app's rules plus the real fonts and photo files. */
  issues: PreflightIssue[]
  issueTotal: number
  bytes: number
  ms: number
  photos: { total: number; printCopies: number; resized: number }
}

export type RenderResult = { status: 'done'; summary: RenderSummary } | { status: 'rendering'; revision: number }

/** Where this device's copy stands against the server. */
export type SaveState =
  | { kind: 'saved'; revision: number }
  /** Edits not yet confirmed by the server. */
  | { kind: 'unsaved' }
  /** No record of what the server holds (opened from a copy saved before sync existed). */
  | { kind: 'unknown' }

export function saveStateOf(draft: BookDraft, sync: SyncState | null): SaveState {
  if (!sync) return { kind: 'unknown' }
  if (sync.inflight || planSync(draft, sync)) return { kind: 'unsaved' }
  return { kind: 'saved', revision: sync.revision }
}

const SEVERITIES: readonly IssueSeverity[] = ['error', 'warn', 'info']
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0)

function readIssue(raw: unknown): PreflightIssue | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.kind !== 'string' || typeof raw.title !== 'string' || typeof raw.detail !== 'string') return null
  if (!SEVERITIES.includes(raw.severity as IssueSeverity)) return null
  const pageIndex = Number.isInteger(raw.pageIndex) && (raw.pageIndex as number) >= 0 ? raw.pageIndex as number : null
  return {
    id: raw.id, kind: raw.kind as PreflightIssue['kind'], severity: raw.severity as IssueSeverity, pageIndex,
    title: raw.title, detail: raw.detail, ...(typeof raw.elementId === 'string' ? { elementId: raw.elementId } : {}),
  }
}

/** A summary from the callable or the status document; null when it is not one. */
export function readRenderSummary(raw: unknown): RenderSummary | null {
  if (!isObject(raw) || !Number.isInteger(raw.revision) || !Number.isInteger(raw.pageCount)) return null
  if (!['blocked', 'confirm', 'ready'].includes(raw.readiness as string)) return null
  const issues = Array.isArray(raw.issues) ? raw.issues.map(readIssue).filter((issue): issue is PreflightIssue => issue !== null) : []
  const counts = isObject(raw.counts) ? raw.counts : {}
  const photos = isObject(raw.photos) ? raw.photos : {}
  return {
    revision: raw.revision as number, pageCount: raw.pageCount as number,
    counts: { error: count(counts.error), warn: count(counts.warn), info: count(counts.info) },
    readiness: raw.readiness as RenderSummary['readiness'],
    issues, issueTotal: Math.max(issues.length, count(raw.issueTotal)),
    bytes: count(raw.bytes), ms: count(raw.ms),
    photos: { total: count(photos.total), printCopies: count(photos.printCopies), resized: count(photos.resized) },
  }
}

export function readRenderResult(raw: unknown): RenderResult | null {
  if (!isObject(raw)) return null
  if (raw.status === 'rendering' && Number.isInteger(raw.revision)) return { status: 'rendering', revision: raw.revision as number }
  if (raw.status !== 'done') return null
  const summary = readRenderSummary(raw)
  return summary ? { status: 'done', summary } : null
}

/**
 * What the server found that the app's own check did not, or judged differently:
 * text measured with the real fonts, photos it could not read, resolution of the
 * files actually printed.
 */
export function serverOnlyIssues(server: readonly PreflightIssue[], local: readonly PreflightIssue[]): PreflightIssue[] {
  const known = new Map(local.map(issue => [issue.id, issue]))
  return server.filter(issue => {
    const mine = known.get(issue.id)
    return !mine || mine.severity !== issue.severity || mine.detail !== issue.detail
  })
}

export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`
}
