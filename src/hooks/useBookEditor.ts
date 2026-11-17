import { useEffect, useReducer, useState } from 'react'
import { AppState } from 'react-native'
import { randomUUID } from 'expo-crypto'
import type { BookDraft } from '../types/book'
import { createEmptyDraft } from '../lib/book/draft'
import { createEditorState, editorReducer, type EditorAction, type EditorState } from '../lib/book/editor'
import { createSaveQueue, type SaveStatus } from '../lib/book/saveQueue'
import { loadBookDraft, saveBookDraft } from '../services/bookDraftStorage'

type Holder =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; editor: EditorState; loaded: BookDraft }
type HolderAction = EditorAction | { type: 'loaded'; draft: BookDraft } | { type: 'load-failed'; message: string }

function holderReducer(holder: Holder, action: HolderAction): Holder {
  if (action.type === 'loaded') return { phase: 'ready', editor: createEditorState(action.draft), loaded: action.draft }
  if (action.type === 'load-failed') return { phase: 'failed', message: action.message }
  if (holder.phase !== 'ready') return holder
  const editor = editorReducer(holder.editor, action)
  return editor === holder.editor ? holder : { ...holder, editor }
}

/**
 * One book's editing state, restored from this device and saved back to it a
 * moment after every change. The parent remounts it (key) when the book changes.
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
      .then(draft => { if (active) dispatch({ type: 'loaded', draft: draft ?? createEmptyDraft(bookId, randomUUID(), new Date().toISOString()) }) })
      .catch(() => { if (active) dispatch({ type: 'load-failed', message: '이 기기에 저장된 책을 열지 못했어요. 앱을 다시 열어 주세요.' }) })
    return () => { active = false }
  }, [uid, bookId])

  const draft = holder.phase === 'ready' ? holder.editor.draft : null
  const loaded = holder.phase === 'ready' ? holder.loaded : null
  useEffect(() => {
    // The draft just read from storage is already saved; only edits are queued.
    if (draft && draft !== loaded) queue.schedule(draft)
  }, [draft, loaded, queue])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') void queue.flush() })
    return () => { subscription.remove(); void queue.flush() }
  }, [queue])

  return {
    editor: holder.phase === 'ready' ? holder.editor : null,
    loadError: holder.phase === 'failed' ? holder.message : '',
    dispatch: dispatch as (action: EditorAction) => void,
    saveStatus,
    retrySave: () => { void queue.flush() },
  }
}
