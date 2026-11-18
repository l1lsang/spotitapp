import { useEffect, useReducer, useState } from 'react'
import { AppState } from 'react-native'
import { randomUUID } from 'expo-crypto'
import type { BookDraft } from '../types/book'
import { createEmptyDraft } from '../lib/book/draft'
import { createEditorState } from '../lib/book/editor'
import { canRedo, canUndo, createHistory, historyReducer, type HistoryAction, type HistoryState } from '../lib/book/history'
import { createSaveQueue, type SaveStatus } from '../lib/book/saveQueue'
import { loadBookDraft, removeBookDraft, saveBookDraft } from '../services/bookDraftStorage'

export type BlockedReason = 'newer' | 'unreadable' | 'failed'

type Holder =
  | { phase: 'loading' }
  | { phase: 'blocked'; reason: BlockedReason }
  | { phase: 'ready'; history: HistoryState; loaded: BookDraft }
type HolderAction = HistoryAction | { type: 'loaded'; draft: BookDraft } | { type: 'blocked'; reason: BlockedReason }

function holderReducer(holder: Holder, action: HolderAction): Holder {
  if (action.type === 'loaded') return { phase: 'ready', history: createHistory(createEditorState(action.draft)), loaded: action.draft }
  if (action.type === 'blocked') return { phase: 'blocked', reason: action.reason }
  if (holder.phase !== 'ready') return holder
  const history = historyReducer(holder.history, action)
  return history === holder.history ? holder : { ...holder, history }
}

const emptyDraft = (bookId: string) => createEmptyDraft(bookId, randomUUID(), new Date().toISOString())

/**
 * One book's editing state with undo, restored from this device and saved back to it
 * a moment after every change. A stored draft this app cannot read is never replaced
 * without the user's say. The parent remounts it (key) when the book changes.
 */
export function useBookEditor(uid: string, bookId: string) {
  const [holder, dispatch] = useReducer(holderReducer, { phase: 'loading' })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [queue] = useState(() => createSaveQueue<BookDraft>({
    delayMs: 600,
    write: draft => saveBookDraft(uid, draft),
    onStatus: status => setSaveStatus(status),
  }))

  useEffect(() => {
    let active = true
    loadBookDraft(uid, bookId)
      .then(stored => {
        if (!active) return
        if (stored.status === 'ok') dispatch({ type: 'loaded', draft: stored.draft })
        else if (stored.status === 'missing') dispatch({ type: 'loaded', draft: emptyDraft(bookId) })
        else dispatch({ type: 'blocked', reason: stored.status })
      })
      .catch(() => { if (active) dispatch({ type: 'blocked', reason: 'failed' }) })
    return () => { active = false }
  }, [uid, bookId])

  const draft = holder.phase === 'ready' ? holder.history.editor.draft : null
  const loaded = holder.phase === 'ready' ? holder.loaded : null
  useEffect(() => {
    // The draft just read from storage is already saved; only edits are queued.
    if (draft && draft !== loaded) queue.schedule(draft)
  }, [draft, loaded, queue])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') void queue.flush() })
    return () => { subscription.remove(); void queue.flush() }
  }, [queue])

  const history = holder.phase === 'ready' ? holder.history : null
  return {
    editor: history?.editor ?? null,
    canUndo: history ? canUndo(history) : false,
    canRedo: history ? canRedo(history) : false,
    blocked: holder.phase === 'blocked' ? holder.reason : null,
    dispatch: dispatch as (action: HistoryAction) => void,
    saveStatus,
    retrySave: () => { void queue.flush() },
    /** Drops a stored draft that cannot be read and starts an empty one. */
    discardAndStart: async () => {
      await removeBookDraft(uid, bookId)
      dispatch({ type: 'loaded', draft: emptyDraft(bookId) })
    },
  }
}
