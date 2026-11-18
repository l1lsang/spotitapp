import type { BookElement, BookImageElement, BookTextElement } from '../../types/book'
import type { BookSpec } from './specs'

// Book millimetres to PDF points, for the print renderer. The book's origin is the
// trim box's top-left with y down; a PDF page's origin is the media box's bottom-left
// with y up. Each page of the PDF is the trim size plus bleed on every side.

export const PT_PER_MM = 72 / 25.4

/** [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (the PDF `cm` operator). */
export type PdfMatrix = readonly [number, number, number, number, number, number]
/** [left, bottom, right, top] in points. */
export type PdfBox = readonly [number, number, number, number]

const r = (value: number) => Math.round(value * 1000) / 1000

export function multiply(m: PdfMatrix, n: PdfMatrix): PdfMatrix {
  // Applies n first, then m (as nested `cm` operators m then n would).
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

export function apply(m: PdfMatrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
}

/** The page boxes every interior page carries. TrimBox is where the printer cuts. */
export function pageBoxesPt(spec: BookSpec): { media: PdfBox; bleed: PdfBox; trim: PdfBox } {
  const w = (spec.trimMm.w + spec.bleedMm * 2) * PT_PER_MM
  const h = (spec.trimMm.h + spec.bleedMm * 2) * PT_PER_MM
  const b = spec.bleedMm * PT_PER_MM
  const media: PdfBox = [0, 0, r(w), r(h)]
  return { media, bleed: media, trim: [r(b), r(b), r(w - b), r(h - b)] }
}

/** A point in trim millimetres as a PDF point. */
export function mmToPdfPoint(xMm: number, yMm: number, spec: BookSpec): { x: number; y: number } {
  return { x: (xMm + spec.bleedMm) * PT_PER_MM, y: (spec.trimMm.h + spec.bleedMm - yMm) * PT_PER_MM }
}

/**
 * Maps the unit square (0..1 both ways, origin bottom-left, as PDF images are drawn) onto
 * the element's box on the page: scaled to its size, rotated clockwise around its centre.
 */
export function elementMatrixPt(element: Pick<BookElement, 'xMm' | 'yMm' | 'wMm' | 'hMm' | 'rotationDeg'>, spec: BookSpec): PdfMatrix {
  const centre = mmToPdfPoint(element.xMm, element.yMm, spec)
  // Clockwise on screen (y down) is a negative angle in PDF space (y up).
  const angle = (-element.rotationDeg * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const w = element.wMm * PT_PER_MM
  const h = element.hMm * PT_PER_MM
  const toCentre: PdfMatrix = [cos, sin, -sin, cos, centre.x, centre.y]
  const size: PdfMatrix = [w, 0, 0, h, -w / 2, -h / 2]
  return multiply(toCentre, size).map(r) as unknown as PdfMatrix
}

/**
 * Where to draw a cropped photo: the whole image, scaled so the crop fills the element.
 * Clip to `elementMatrixPt` (the unit square) first, then draw the image with this matrix.
 */
export function imageMatrixPt(element: Pick<BookImageElement, 'xMm' | 'yMm' | 'wMm' | 'hMm' | 'rotationDeg' | 'crop'>, spec: BookSpec): PdfMatrix {
  const { x, y, w, h } = element.crop
  // Crop y is measured from the image top; the unit square's y runs from the bottom.
  const crop: PdfMatrix = [1 / w, 0, 0, 1 / h, -x / w, -(1 - y - h) / h]
  return multiply(elementMatrixPt(element, spec), crop).map(r) as unknown as PdfMatrix
}

/** Text placement: the box's top-left as the origin (y down inside it) and the size in points. */
export function textPlacementPt(element: BookTextElement, spec: BookSpec) {
  const box = elementMatrixPt(element, spec)
  return {
    /** Maps (0..wPt, 0..hPt), y down from the box's top-left, onto the page. */
    matrix: multiply(box, [1 / (element.wMm * PT_PER_MM), 0, 0, -1 / (element.hMm * PT_PER_MM), 0, 1]).map(r) as unknown as PdfMatrix,
    widthPt: r(element.wMm * PT_PER_MM),
    fontSizePt: element.sizePt,
    lineHeightPt: r(element.sizePt * element.lineHeight),
  }
}
