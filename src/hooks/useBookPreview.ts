import { useEffect, useState } from 'react'
import type { BookDraft } from '../types/book'
import { loadBookLocal } from '../services/bookDraftStorage'
import { loadBook } from '../services/bookService'

type PreviewState =
  | { phase: 'loading' }
  | { phase: 'ready'; draft: BookDraft }
  | { phase: 'blocked'; reason: 'deleted' | 'newer' | 'failed' }

/**
 * The book as the editor last showed it, read only. The editor keeps this device's copy
 * current (it adopts the server copy when that is newer), so that copy comes first and
 * the preview also opens offline; the server is read only when this device has none.
 */
export function useBookPreview(uid: string, bookId: string): PreviewState {
  const [state, setState] = useState<PreviewState>({ phase: 'loading' })
  useEffect(() => {
    let active = true
    loadBookLocal(uid, bookId)
      .then(async local => {
        if (local.draft.status === 'ok') return { phase: 'ready', draft: local.draft.draft } as const
        if (local.draft.status === 'newer') return { phase: 'blocked', reason: 'newer' } as const
        const server = await loadBook(uid, bookId)
        if (server.kind === 'ok') return { phase: 'ready', draft: server.draft } as const
        return { phase: 'blocked', reason: server.kind === 'missing' ? 'deleted' : 'newer' } as const
      })
      .then(next => { if (active) setState(next) })
      .catch(() => { if (active) setState({ phase: 'blocked', reason: 'failed' }) })
    return () => { active = false }
  }, [uid, bookId])
  return state
}
