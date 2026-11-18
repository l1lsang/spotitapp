import { useEffect, useReducer, useState } from 'react'
import { AppState } from 'react-native'
import type { BookDraft } from '../types/book'
import { createEditorState } from '../lib/book/editor'
import { canRedo, canUndo, createHistory, historyReducer, type HistoryAction, type HistoryState } from '../lib/book/history'
import { createBookSession, type BookSaveStatus } from '../lib/book/bookSession'
import { loadBookLocal, removeBookLocal, saveBookDraft, saveBookSync } from '../services/bookDraftStorage'
import { isRefusal, loadBook, writeBookChanges } from '../services/bookService'

export type BlockedReason = 'deleted' | 'newer' | 'failed'

type Holder =
  | { phase: 'loading' }
  | { phase: 'blocked'; reason: BlockedReason }
  | { phase: 'ready'; history: HistoryState; loaded: BookDraft; conflict: boolean }
type HolderAction =
  | HistoryAction
  | { type: 'loaded'; draft: BookDraft; conflict?: boolean }
  | { type: 'blocked'; reason: BlockedReason }
  | { type: 'conflict-resolved'; draft: BookDraft | null }

function holderReducer(holder: Holder, action: HolderAction): Holder {
  if (action.type === 'loaded') return { phase: 'ready', history: createHistory(createEditorState(action.draft)), loaded: action.draft, conflict: !!action.conflict }
  if (action.type === 'blocked') return { phase: 'blocked', reason: action.reason }
  if (holder.phase !== 'ready') return holder
  if (action.type === 'conflict-resolved') {
    // Showing the server's copy starts a fresh history: undo must not bring back the other copy.
    if (action.draft && action.draft !== holder.history.editor.draft) return holderReducer(holder, { type: 'loaded', draft: action.draft })
    return { ...holder, conflict: false }
  }
  const history = historyReducer(holder.history, action)
  return history === holder.history ? holder : { ...holder, history }
}

/**
 * One book's editing state with undo. It opens the server copy (or this device's newer
 * one), saves every change to this device at once and to the server a moment later, and
 * stops to ask when another device changed the same book. The parent remounts it (key)
 * when the book changes.
 */
export function useBookEditor(uid: string, bookId: string) {
  const [holder, dispatch] = useReducer(holderReducer, { phase: 'loading' })
  const [saveStatus, setSaveStatus] = useState<BookSaveStatus>('saved')
  const [session] = useState(() => createBookSession({
    local: {
      load: () => loadBookLocal(uid, bookId),
      saveDraft: draft => saveBookDraft(uid, draft),
      saveSync: state => saveBookSync(uid, bookId, state),
      clear: () => removeBookLocal(uid, bookId),
    },
    server: {
      load: () => loadBook(uid, bookId),
      write: (draft, plan) => writeBookChanges(bookId, draft, plan),
    },
    isRefusal,
    onStatus: setSaveStatus,
  }))

  useEffect(() => {
    let active = true
    session.open()
      .then(result => {
        if (!active) return
        if (result.kind === 'blocked') dispatch({ type: 'blocked', reason: result.reason })
        else if (result.kind === 'conflict') dispatch({ type: 'loaded', draft: result.local, conflict: true })
        else dispatch({ type: 'loaded', draft: result.draft })
      })
      .catch(() => { if (active) dispatch({ type: 'blocked', reason: 'failed' }) })
    return () => { active = false }
  }, [session])

  const draft = holder.phase === 'ready' ? holder.history.editor.draft : null
  const loaded = holder.phase === 'ready' ? holder.loaded : null
  useEffect(() => {
    // The draft just opened is already stored; only edits are sent.
    if (draft && draft !== loaded) session.edit(draft)
  }, [draft, loaded, session])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') void session.flush() })
    return () => { subscription.remove(); void session.flush().finally(() => session.dispose()) }
  }, [session])

  const history = holder.phase === 'ready' ? holder.history : null
  return {
    editor: history?.editor ?? null,
    canUndo: history ? canUndo(history) : false,
    canRedo: history ? canRedo(history) : false,
    blocked: holder.phase === 'blocked' ? holder.reason : null,
    conflict: holder.phase === 'ready' && (holder.conflict || saveStatus === 'conflict'),
    dispatch: dispatch as (action: HistoryAction) => void,
    saveStatus,
    retrySave: () => {
      void session.retry().then(result => {
        if (result?.kind === 'conflict') dispatch({ type: 'loaded', draft: result.local, conflict: true })
        else if (result?.kind === 'blocked') dispatch({ type: 'blocked', reason: result.reason })
        // Back online with the server's copy, because this device had nothing newer.
        else if (result?.kind === 'ready' && result.draft !== draft) dispatch({ type: 'loaded', draft: result.draft })
      }).catch(() => undefined)
    },
    /** The user's answer when another device changed the book. */
    resolveConflict: async (keep: 'server' | 'local') => {
      const next = await session.resolveConflict(keep)
      dispatch({ type: 'conflict-resolved', draft: keep === 'server' ? next : null })
    },
  }
}
