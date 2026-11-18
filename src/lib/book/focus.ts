// A one-shot request to show a page (and an element on it) when the editor next comes
// into view, used when the preview sends the user back to fix something.

export interface BookFocus {
  pageIndex: number
  elementId?: string
}

const pending = new Map<string, BookFocus>()

export function requestBookFocus(bookId: string, focus: BookFocus): void {
  pending.set(bookId, focus)
}

export function takeBookFocus(bookId: string): BookFocus | null {
  const focus = pending.get(bookId) ?? null
  pending.delete(bookId)
  return focus
}
