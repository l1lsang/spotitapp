import type { BookBackground, BookDraft, BookElement, BookImageRef, BookPage, BookTextElement } from '../../types/book'
import { applyTransform, clampToPage, fitNewImage, MM_PER_PT, newElementCentre, TEXT_SIZE_PT, type ElementTransform } from './geometry'
import { getBookSpec } from './specs'
import { BOOK_FONT_IDS, sameBackground } from './styles'

/** Matches the planned server rule, so a page that saves locally also saves later. */
export const MAX_ELEMENTS_PER_PAGE = 60
export const MAX_TEXT_LENGTH = 2000
export const DUPLICATE_OFFSET_MM = 6
export const DEFAULT_TEXT_STYLE = { font: 'pretendard', sizePt: 12, color: '#161F1B', align: 'left', lineHeight: 1.5 } as const

export interface EditorState {
  draft: BookDraft
  pageIndex: number
  selectedId: string | null
}

export type TextStyle = Pick<BookTextElement, 'font' | 'sizePt' | 'color' | 'align'>
export type LayerMove = 'forward' | 'backward' | 'front' | 'back'

// Ids and times come in with the action so the reducer stays pure and testable.
export type EditorAction =
  | { type: 'select'; id: string | null }
  | { type: 'go-page'; index: number }
  | { type: 'add-image'; id: string; ref: BookImageRef; now: string }
  | { type: 'add-text'; id: string; text: string; now: string }
  | { type: 'transform'; id: string; transform: ElementTransform; now: string }
  | { type: 'set-text'; id: string; text: string; now: string }
  | { type: 'set-text-style'; id: string; style: Partial<TextStyle>; now: string }
  | { type: 'measure-text'; id: string; hMm: number }
  | { type: 'arrange'; id: string; to: LayerMove; now: string }
  | { type: 'duplicate'; id: string; newId: string; now: string }
  | { type: 'delete'; id: string; now: string }
  | { type: 'add-page'; pageId: string; now: string }
  | { type: 'duplicate-page'; pageId: string; elementIds: string[]; now: string }
  | { type: 'delete-page'; now: string }
  | { type: 'move-page'; to: number; now: string }
  | { type: 'set-background'; background: BookBackground; allPages: boolean; now: string }

export function createEditorState(draft: BookDraft): EditorState {
  return { draft, pageIndex: 0, selectedId: null }
}

export function currentPage(state: EditorState): BookPage {
  return state.draft.pages[state.pageIndex]
}

export function canAddElement(state: EditorState): boolean {
  return currentPage(state).elements.length < MAX_ELEMENTS_PER_PAGE
}

export function canAddPage(state: EditorState): boolean {
  return state.draft.pages.length < getBookSpec(state.draft.specId).pages.max
}

const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

function withPages(state: EditorState, pages: BookPage[], now: string | null, pageIndex = state.pageIndex, selectedId = state.selectedId): EditorState {
  return { pageIndex, selectedId, draft: { ...state.draft, pages, updatedAt: now ?? state.draft.updatedAt } }
}

function withElements(state: EditorState, elements: BookElement[], now: string | null, selectedId = state.selectedId): EditorState {
  const pages = state.draft.pages.slice()
  pages[state.pageIndex] = { ...currentPage(state), elements }
  return withPages(state, pages, now, state.pageIndex, selectedId)
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
  return withElements(state, elements, now, (next || state.selectedId !== id) ? state.selectedId : null)
}

function arrange(elements: BookElement[], index: number, to: LayerMove): BookElement[] {
  const target = { forward: index + 1, backward: index - 1, front: elements.length - 1, back: 0 }[to]
  const clamped = Math.max(0, Math.min(elements.length - 1, target))
  if (clamped === index) return elements
  const next = elements.slice()
  const [moved] = next.splice(index, 1)
  next.splice(clamped, 0, moved)
  return next
}

function styleText(element: BookTextElement, style: Partial<TextStyle>): BookTextElement {
  const next = { ...element }
  if (style.font && BOOK_FONT_IDS.includes(style.font)) next.font = style.font
  if (style.align && ['left', 'center', 'right'].includes(style.align)) next.align = style.align
  if (isColor(style.color)) next.color = style.color.toUpperCase()
  if (typeof style.sizePt === 'number' && Number.isFinite(style.sizePt)) {
    next.sizePt = Math.min(TEXT_SIZE_PT.max, Math.max(TEXT_SIZE_PT.min, Math.round(style.sizePt * 10) / 10))
  }
  const same = next.font === element.font && next.align === element.align && next.color === element.color && next.sizePt === element.sizePt
  return same ? element : next
}

/** A copy of the open page placed right after it, which then becomes the open page. */
function insertAfterCurrent(state: EditorState, page: BookPage, now: string): EditorState {
  const pages = state.draft.pages
  const next = [...pages.slice(0, state.pageIndex + 1), page, ...pages.slice(state.pageIndex + 1)]
  return withPages(state, next, now, state.pageIndex + 1, null)
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const spec = getBookSpec(state.draft.specId)
  const pages = state.draft.pages
  switch (action.type) {
    case 'select': {
      if (action.id === state.selectedId) return state
      if (action.id && !currentPage(state).elements.some(element => element.id === action.id)) return state
      return { ...state, selectedId: action.id }
    }
    case 'go-page': {
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= pages.length || action.index === state.pageIndex) return state
      return { ...state, pageIndex: action.index, selectedId: null }
    }
    case 'add-image': {
      if (!canAddElement(state)) return state
      const elements = currentPage(state).elements
      const element: BookElement = {
        id: action.id, type: 'image', ref: action.ref, rotationDeg: 0,
        crop: { x: 0, y: 0, w: 1, h: 1 },
        ...newElementCentre(elements.length, spec),
        ...fitNewImage(action.ref.pxWidth, action.ref.pxHeight, spec),
      }
      return withElements(state, [...elements, element], action.now, action.id)
    }
    case 'add-text': {
      const text = action.text.slice(0, MAX_TEXT_LENGTH)
      if (!canAddElement(state) || !text.trim()) return state
      const elements = currentPage(state).elements
      const element: BookTextElement = {
        id: action.id, type: 'text', text, rotationDeg: 0, ...DEFAULT_TEXT_STYLE,
        ...newElementCentre(elements.length, spec),
        wMm: (spec.trimMm.w - spec.safeMm * 2) * 0.8,
        // A first guess; the screen measures the real height once it lays the text out.
        hMm: DEFAULT_TEXT_STYLE.sizePt * DEFAULT_TEXT_STYLE.lineHeight * MM_PER_PT,
      }
      return withElements(state, [...elements, element], action.now, action.id)
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
    case 'set-text-style':
      return updateElement(state, action.id, action.now, element => element.type === 'text' ? styleText(element, action.style) : element)
    case 'measure-text':
      // Layout feedback, not an edit: the time of the last edit stays.
      return updateElement(state, action.id, null, element => {
        if (element.type !== 'text' || !Number.isFinite(action.hMm) || action.hMm <= 0) return element
        return Math.abs(element.hMm - action.hMm) < 0.3 ? element : { ...element, hMm: action.hMm }
      })
    case 'arrange': {
      const elements = currentPage(state).elements
      const index = elements.findIndex(element => element.id === action.id)
      if (index < 0) return state
      const next = arrange(elements, index, action.to)
      return next === elements ? state : withElements(state, next, action.now)
    }
    case 'duplicate': {
      if (!canAddElement(state)) return state
      const elements = currentPage(state).elements
      const index = elements.findIndex(element => element.id === action.id)
      if (index < 0 || elements.some(element => element.id === action.newId)) return state
      const source = elements[index]
      const copy = clampToPage({ ...source, id: action.newId, xMm: source.xMm + DUPLICATE_OFFSET_MM, yMm: source.yMm + DUPLICATE_OFFSET_MM }, spec)
      // The copy sits right above its source, so it never jumps over unrelated layers.
      return withElements(state, [...elements.slice(0, index + 1), copy, ...elements.slice(index + 1)], action.now, action.newId)
    }
    case 'delete':
      return updateElement(state, action.id, action.now, () => null)
    case 'add-page': {
      if (!canAddPage(state) || pages.some(page => page.id === action.pageId)) return state
      // A new page continues the paper of the page it follows.
      return insertAfterCurrent(state, { id: action.pageId, background: { ...currentPage(state).background }, elements: [] }, action.now)
    }
    case 'duplicate-page': {
      const source = currentPage(state)
      if (!canAddPage(state) || pages.some(page => page.id === action.pageId)) return state
      if (action.elementIds.length !== source.elements.length || new Set(action.elementIds).size !== action.elementIds.length) return state
      return insertAfterCurrent(state, {
        id: action.pageId, background: { ...source.background },
        elements: source.elements.map((element, index) => ({ ...element, id: action.elementIds[index] })),
      }, action.now)
    }
    case 'delete-page': {
      // A book always keeps one page to draw on.
      if (pages.length <= 1) return state
      const next = pages.filter((_, index) => index !== state.pageIndex)
      return withPages(state, next, action.now, Math.min(state.pageIndex, next.length - 1), null)
    }
    case 'move-page': {
      if (!Number.isFinite(action.to)) return state
      const to = Math.max(0, Math.min(pages.length - 1, Math.round(action.to)))
      if (to === state.pageIndex) return state
      const next = pages.slice()
      const [moved] = next.splice(state.pageIndex, 1)
      next.splice(to, 0, moved)
      // The open page travels with the move, so the user keeps looking at it.
      return withPages(state, next, action.now, to)
    }
    case 'set-background': {
      if (!isColor(action.background.color)) return state
      const background: BookBackground = { color: action.background.color.toUpperCase(), ...(action.background.pattern ? { pattern: action.background.pattern } : {}) }
      const affected = (index: number) => action.allPages || index === state.pageIndex
      if (pages.every((page, index) => !affected(index) || sameBackground(page.background, background))) return state
      const next = pages.map((page, index) => affected(index) ? { ...page, background } : page)
      return withPages(state, next, action.now)
    }
  }
}
