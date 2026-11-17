import type { BookDraft, BookElement, BookImageRef, BookPage, BookTextElement } from '../../types/book'
import { applyTransform, fitNewImage, MM_PER_PT, newElementCentre, type ElementTransform } from './geometry'
import { getBookSpec } from './specs'

/** Matches the planned server rule, so a page that saves locally also saves later. */
export const MAX_ELEMENTS_PER_PAGE = 60
export const MAX_TEXT_LENGTH = 2000
export const DEFAULT_TEXT_STYLE = { font: 'pretendard', sizePt: 12, color: '#161F1B', align: 'left', lineHeight: 1.5 } as const

export interface EditorState {
  draft: BookDraft
  pageIndex: number
  selectedId: string | null
}

// Ids and times come in with the action so the reducer stays pure and testable.
export type EditorAction =
  | { type: 'select'; id: string | null }
  | { type: 'add-image'; id: string; ref: BookImageRef; now: string }
  | { type: 'add-text'; id: string; text: string; now: string }
  | { type: 'transform'; id: string; transform: ElementTransform; now: string }
  | { type: 'set-text'; id: string; text: string; now: string }
  | { type: 'measure-text'; id: string; hMm: number }
  | { type: 'delete'; id: string; now: string }

export function createEditorState(draft: BookDraft): EditorState {
  return { draft, pageIndex: 0, selectedId: null }
}

export function currentPage(state: EditorState): BookPage {
  return state.draft.pages[state.pageIndex]
}

export function canAddElement(state: EditorState): boolean {
  return currentPage(state).elements.length < MAX_ELEMENTS_PER_PAGE
}

function withPage(state: EditorState, page: BookPage, now: string | null, selectedId = state.selectedId): EditorState {
  const pages = state.draft.pages.slice()
  pages[state.pageIndex] = page
  return { ...state, selectedId, draft: { ...state.draft, pages, updatedAt: now ?? state.draft.updatedAt } }
}

function updateElement(state: EditorState, id: string, now: string | null, update: (element: BookElement) => BookElement | null): EditorState {
  const page = currentPage(state)
  const index = page.elements.findIndex(element => element.id === id)
  if (index < 0) return state
  const next = update(page.elements[index])
  if (next === page.elements[index]) return state
  const elements = page.elements.slice()
  if (next) elements[index] = next
  else elements.splice(index, 1)
  return withPage(state, { ...page, elements }, now, (next || state.selectedId !== id) ? state.selectedId : null)
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const spec = getBookSpec(state.draft.specId)
  switch (action.type) {
    case 'select': {
      if (action.id === state.selectedId) return state
      if (action.id && !currentPage(state).elements.some(element => element.id === action.id)) return state
      return { ...state, selectedId: action.id }
    }
    case 'add-image': {
      if (!canAddElement(state)) return state
      const page = currentPage(state)
      const element: BookElement = {
        id: action.id, type: 'image', ref: action.ref, rotationDeg: 0,
        crop: { x: 0, y: 0, w: 1, h: 1 },
        ...newElementCentre(page.elements.length, spec),
        ...fitNewImage(action.ref.pxWidth, action.ref.pxHeight, spec),
      }
      return withPage(state, { ...page, elements: [...page.elements, element] }, action.now, action.id)
    }
    case 'add-text': {
      const text = action.text.slice(0, MAX_TEXT_LENGTH)
      if (!canAddElement(state) || !text.trim()) return state
      const page = currentPage(state)
      const element: BookTextElement = {
        id: action.id, type: 'text', text, rotationDeg: 0, ...DEFAULT_TEXT_STYLE,
        ...newElementCentre(page.elements.length, spec),
        wMm: (spec.trimMm.w - spec.safeMm * 2) * 0.8,
        // A first guess; the screen measures the real height once it lays the text out.
        hMm: DEFAULT_TEXT_STYLE.sizePt * DEFAULT_TEXT_STYLE.lineHeight * MM_PER_PT,
      }
      return withPage(state, { ...page, elements: [...page.elements, element] }, action.now, action.id)
    }
    case 'transform':
      return updateElement(state, action.id, action.now, element => applyTransform(element, action.transform, spec))
    case 'set-text':
      return updateElement(state, action.id, action.now, element => {
        if (element.type !== 'text') return element
        const text = action.text.slice(0, MAX_TEXT_LENGTH)
        // Clearing every character removes the text box, as in a notebook.
        if (!text.trim()) return null
        return text === element.text ? element : { ...element, text }
      })
    case 'measure-text':
      // Layout feedback, not an edit: the time of the last edit stays.
      return updateElement(state, action.id, null, element => {
        if (element.type !== 'text' || !Number.isFinite(action.hMm) || action.hMm <= 0) return element
        return Math.abs(element.hMm - action.hMm) < 0.3 ? element : { ...element, hMm: action.hMm }
      })
    case 'delete':
      return updateElement(state, action.id, action.now, () => null)
  }
}
