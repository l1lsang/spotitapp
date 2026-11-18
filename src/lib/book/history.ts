import type { BookDraft } from '../../types/book'
import { editorReducer, type EditorAction, type EditorState } from './editor'

/** Undo keeps this many steps; older ones are dropped first. */
export const HISTORY_LIMIT = 100

interface Snapshot {
  draft: BookDraft
  pageIndex: number
}

export interface HistoryState {
  editor: EditorState
  past: Snapshot[]
  future: Snapshot[]
}

export type HistoryAction = EditorAction | { type: 'undo' } | { type: 'redo' }

// Layout measurements follow from the text and are not something the user did.
const NOT_UNDOABLE = new Set<EditorAction['type']>(['measure-text'])

export function createHistory(editor: EditorState): HistoryState {
  return { editor, past: [], future: [] }
}

export const canUndo = (history: HistoryState) => history.past.length > 0
export const canRedo = (history: HistoryState) => history.future.length > 0

const snapshot = (editor: EditorState): Snapshot => ({ draft: editor.draft, pageIndex: editor.pageIndex })

/**
 * Brings back a saved moment: the page that changed comes into view, and the
 * selection stays only when that element still exists there.
 */
function restore(editor: EditorState, to: Snapshot): EditorState {
  const pageIndex = Math.min(to.pageIndex, to.draft.pages.length - 1)
  const page = to.draft.pages[pageIndex]
  const keep = editor.selectedId !== null && page.elements.some(element => element.id === editor.selectedId)
  return { draft: to.draft, pageIndex, selectedId: keep ? editor.selectedId : null }
}

export function historyReducer(history: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'undo') {
    const previous = history.past[history.past.length - 1]
    if (!previous) return history
    return {
      editor: restore(history.editor, previous),
      past: history.past.slice(0, -1),
      future: [snapshot(history.editor), ...history.future],
    }
  }
  if (action.type === 'redo') {
    const [next, ...rest] = history.future
    if (!next) return history
    return {
      editor: restore(history.editor, next),
      past: [...history.past, snapshot(history.editor)].slice(-HISTORY_LIMIT),
      future: rest,
    }
  }
  const editor = editorReducer(history.editor, action)
  if (editor === history.editor) return history
  // Selecting and turning pages change the view, not the book.
  if (editor.draft === history.editor.draft || NOT_UNDOABLE.has(action.type)) return { ...history, editor }
  return {
    editor,
    // The step records where the user was looking, so undo returns there.
    past: [...history.past, snapshot(history.editor)].slice(-HISTORY_LIMIT),
    future: [],
  }
}
