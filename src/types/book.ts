// Book Studio editing data. Every length is in millimetres on the trimmed page:
// (0, 0) is the top-left corner of the trim box, x grows right and y grows down.
// Screens and the print PDF convert from these numbers; nothing stores pixels.

export type BookSpecId = 'a5-soft'

/** A photo taken from one of the user's own records. The binary stays in Storage. */
export interface BookImageRef {
  postId: string
  photoIndex: number
  /** Display copy (`photoUrls[i]`), currently at most 1600px on its long side. */
  url: string
  thumbUrl?: string
  /** Pixel size of `url`, measured when the photo was placed. Used for print DPI. */
  pxWidth: number
  pxHeight: number
}

interface BookElementBase {
  id: string
  /** Centre of the element, before rotation. */
  xMm: number
  yMm: number
  wMm: number
  hMm: number
  /** Clockwise, around the centre, in (-180, 180]. */
  rotationDeg: number
}

export interface BookImageElement extends BookElementBase {
  type: 'image'
  ref: BookImageRef
  /** Visible part of the photo as fractions of its width and height. */
  crop: { x: number; y: number; w: number; h: number }
}

export type BookFontId = 'pretendard' | 'gowun-batang' | 'nanum-pen'

export interface BookTextElement extends BookElementBase {
  type: 'text'
  text: string
  font: BookFontId
  sizePt: number
  color: string
  align: 'left' | 'center' | 'right'
  /** Line height as a multiple of the font size. */
  lineHeight: number
}

export type BookElement = BookImageElement | BookTextElement

export type BookBackgroundPattern = 'grid' | 'lined'

export interface BookBackground {
  color: string
  /** Printed lines over the colour, spaced in millimetres by the renderer. */
  pattern?: BookBackgroundPattern
}

export interface BookPage {
  id: string
  background: BookBackground
  /** Drawing order: the last element is on top. */
  elements: BookElement[]
}

export type BookCoverStyle = 'photo' | 'minimal' | 'kraft'

export interface BookDraft {
  schemaVersion: number
  id: string
  title: string
  /** Printed on the first page, under the title. */
  subtitle: string
  specId: BookSpecId
  coverStyle: BookCoverStyle
  /** The cover photo for the 'photo' style; also the book's picture in lists. */
  coverPhoto: BookImageRef | null
  /** The records the book was made from, in the order the user chose. */
  sourcePostIds: string[]
  pages: BookPage[]
  /** ISO time of the last edit. */
  updatedAt: string
}

/** One row of "내 책": what a list needs without reading the pages. */
export interface BookSummary {
  id: string
  title: string
  specId: BookSpecId
  coverStyle: BookCoverStyle
  coverPhoto: BookImageRef | null
  pageCount: number
  recordCount: number
  /** Milliseconds since the epoch; 0 while the server time is not known yet. */
  updatedAtMs: number
}
