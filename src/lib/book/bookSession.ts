import type { BookDraft } from '../../types/book'
import type { StoredDraft } from './draft'
import { createSaveQueue, type SaveQueueOptions, type SaveStatus } from './saveQueue'
import { decideOnOpen, planSync, sameSnapshotContent, snapshotOf, type SyncPlan, type SyncSnapshot, type SyncState } from './sync'

// One open book: this device's copy, the server copy, and the writes between them.
// Storage and network come in as functions so the rules here run in plain tests.

export type ServerBook =
  | { kind: 'ok'; draft: BookDraft; revision: number }
  | { kind: 'missing' }
  /** Saved by a newer app version; this one must not rewrite it. */
  | { kind: 'newer' }

export interface BookSessionDeps {
  local: {
    load(): Promise<{ draft: StoredDraft; sync: SyncState | null }>
    saveDraft(draft: BookDraft): Promise<void>
    saveSync(state: SyncState): Promise<void>
    clear(): Promise<void>
  }
  server: {
    load(): Promise<ServerBook>
    write(draft: BookDraft, plan: SyncPlan): Promise<void>
  }
  /** True when the server refused a write (rules), as opposed to not answering. */
  isRefusal(error: unknown): boolean
  onStatus(status: BookSaveStatus): void
  localDelayMs?: number
  serverDelayMs?: number
  /** A write unanswered this long is treated as waiting for the network. */
  slowWriteMs?: number
  /** With a copy on this device, opening waits this long for the server before using it. */
  openTimeoutMs?: number
  timers?: SaveQueueOptions<BookDraft>['timers']
}

/**
 * saved: on the server. saving: on its way. offline: kept on this device while a write
 * waits for the network; it goes out by itself once connected. local: kept on this
 * device only after a failed write or an offline start; retry sends it. error: not even
 * this device could keep it. conflict: another device changed the book; the user must
 * choose. deleted: the book is gone.
 */
export type BookSaveStatus = 'saved' | 'saving' | 'offline' | 'local' | 'error' | 'conflict' | 'deleted'

export type OpenResult =
  | { kind: 'ready'; draft: BookDraft }
  | { kind: 'conflict'; local: BookDraft; server: BookDraft }
  | { kind: 'blocked'; reason: 'deleted' | 'newer' | 'failed' }

class RefusedError extends Error {}
class TimeoutError extends Error {}

const defaultTimers = {
  set: (run: () => void, ms: number): unknown => setTimeout(run, ms),
  clear: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createBookSession(deps: BookSessionDeps) {
  let synced: SyncSnapshot | null = null
  let conflict: { draft: BookDraft; synced: SyncSnapshot } | null = null
  let deleted = false
  let current: BookDraft | null = null
  /** What this device last knew of the server when the book was opened. */
  let openedSync: SyncState | null = null
  let localStatus: SaveStatus = 'saved'
  let serverStatus: SaveStatus = 'saved'
  /**
   * Firestore never rejects a write for being offline: it keeps it queued and answers
   * once connected. A write that stays unanswered is therefore read as "offline".
   */
  let waitingForNetwork = false
  const timers = deps.timers ?? defaultTimers

  const report = () => {
    if (deleted) return deps.onStatus('deleted')
    if (conflict) return deps.onStatus('conflict')
    if (!synced) return deps.onStatus(localStatus === 'error' ? 'error' : 'local')
    if (serverStatus === 'saved') return deps.onStatus('saved')
    if (serverStatus === 'pending' || serverStatus === 'saving') return deps.onStatus(waitingForNetwork ? 'offline' : 'saving')
    deps.onStatus(localStatus === 'error' ? 'error' : 'local')
  }

  const keepSync = (state: SyncState) => deps.local.saveSync(state).catch(() => undefined)

  async function writeToServer(draft: BookDraft) {
    const base = synced
    if (!base || conflict || deleted) throw new RefusedError('not connected')
    const plan = planSync(draft, base)
    if (!plan) return
    const target = snapshotOf(draft, base.revision + 1)
    await keepSync({ ...base, inflight: target })
    const slow = timers.set(() => { waitingForNetwork = true; report() }, deps.slowWriteMs ?? 3000)
    try {
      await deps.server.write(draft, plan)
      waitingForNetwork = false
    } catch (error) {
      waitingForNetwork = false
      if (!deps.isRefusal(error)) throw error
      // Refused: either another device saved first, or the book is gone.
      const now = await deps.server.load()
      if (now.kind === 'missing') { deleted = true; throw new RefusedError('deleted') }
      if (now.kind !== 'ok' || now.revision === base.revision) throw error
      const serverSynced = snapshotOf(now.draft, now.revision)
      if (sameSnapshotContent(serverSynced, snapshotOf(draft, now.revision))) {
        synced = serverSynced
        await keepSync(serverSynced)
        return
      }
      conflict = { draft: now.draft, synced: serverSynced }
      throw new RefusedError('conflict')
    } finally {
      timers.clear(slow)
    }
    synced = target
    await keepSync(target)
  }

  const localQueue = createSaveQueue<BookDraft>({
    delayMs: deps.localDelayMs ?? 600, timers: deps.timers,
    write: draft => deps.local.saveDraft(draft),
    onStatus: status => { localStatus = status; report() },
  })
  const serverQueue = createSaveQueue<BookDraft>({
    delayMs: deps.serverDelayMs ?? 1500, timers: deps.timers,
    write: writeToServer,
    onStatus: status => { serverStatus = status; report() },
  })

  /** Remembers the server copy on this device so it opens offline next time. */
  const adopt = (draft: BookDraft, snapshot: SyncSnapshot) => {
    current = draft
    synced = snapshot
    void deps.local.saveDraft(draft).catch(() => undefined)
    void keepSync(snapshot)
  }

  /** The server's answer, or a TimeoutError after `ms` (no limit when undefined). */
  function loadServer(ms: number | undefined): Promise<ServerBook> {
    const load = deps.server.load()
    if (ms === undefined) return load
    return new Promise((resolve, reject) => {
      const timer = timers.set(() => reject(new TimeoutError('server')), ms)
      load.then(
        value => { timers.clear(timer); resolve(value) },
        error => { timers.clear(timer); reject(error) },
      )
    })
  }

  async function connect(local: BookDraft | null, localSync: SyncState | null): Promise<OpenResult | null> {
    let server: ServerBook
    // Without a copy here there is nothing else to show, so only then wait for as long as it takes.
    try { server = await loadServer(local ? deps.openTimeoutMs ?? 6000 : undefined) } catch { return null }
    if (server.kind === 'missing') {
      deleted = true
      await deps.local.clear().catch(() => undefined)
      return { kind: 'blocked', reason: 'deleted' }
    }
    if (server.kind === 'newer') return { kind: 'blocked', reason: 'newer' }
    const decision = decideOnOpen(server, local, localSync)
    if (decision.kind === 'conflict') {
      current = decision.local
      conflict = { draft: decision.server, synced: decision.serverSynced }
      report()
      return { kind: 'conflict', local: decision.local, server: decision.server }
    }
    if (decision.draft === server.draft) adopt(server.draft, decision.synced)
    else {
      current = decision.draft
      synced = decision.synced
      serverQueue.schedule(decision.draft)
    }
    report()
    return { kind: 'ready', draft: decision.draft }
  }

  return {
    async open(): Promise<OpenResult> {
      const stored = await deps.local.load().catch(() => ({ draft: { status: 'unreadable' } as StoredDraft, sync: null }))
      if (stored.draft.status === 'newer') return { kind: 'blocked', reason: 'newer' }
      const local = stored.draft.status === 'ok' ? stored.draft.draft : null
      openedSync = stored.sync
      const connected = await connect(local, stored.sync)
      if (connected) return connected
      // No answer from the server: keep working on this device's copy.
      if (!local) return { kind: 'blocked', reason: 'failed' }
      current = local
      synced = stored.sync ? { revision: stored.sync.revision, meta: stored.sync.meta, pages: stored.sync.pages } : null
      // Edits made earlier on this device go out once the connection is back.
      if (synced && planSync(local, synced)) serverQueue.schedule(local)
      report()
      return { kind: 'ready', draft: local }
    },
    edit(draft: BookDraft) {
      current = draft
      localQueue.schedule(draft)
      if (synced && !conflict && !deleted) serverQueue.schedule(draft)
      else report()
    },
    /** Sends what is waiting now (leaving the editor, app to background, a retry tap). */
    async flush() {
      await Promise.all([localQueue.flush(), serverQueue.flush()])
    },
    /** Writes this device's copy now. Unlike `flush`, it never waits for the network. */
    async flushLocal() {
      await localQueue.flush()
    },
    /** After a failure or an offline start: reconnects if needed, then sends again. */
    async retry(): Promise<OpenResult | null> {
      if (conflict || deleted) return null
      if (!synced) return connect(current, openedSync)
      if (current) serverQueue.schedule(current)
      await serverQueue.flush()
      return null
    },
    /** The user's choice after a conflict. Returns the draft to show. */
    async resolveConflict(keep: 'server' | 'local'): Promise<BookDraft | null> {
      if (!conflict) return current
      const theirs = conflict
      conflict = null
      if (keep === 'server') {
        adopt(theirs.draft, theirs.synced)
        report()
        return theirs.draft
      }
      // Keep this device's copy: rewrite it on top of the server's latest revision.
      synced = theirs.synced
      if (current) { localQueue.schedule(current); serverQueue.schedule(current) }
      await serverQueue.flush()
      return current
    },
    hasUnsaved: () => localQueue.hasUnsaved() || serverQueue.hasUnsaved(),
    dispose() { localQueue.dispose(); serverQueue.dispose() },
  }
}

export type BookSession = ReturnType<typeof createBookSession>
