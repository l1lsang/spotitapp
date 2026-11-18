// Generated from src/lib/book/pdfCoords.ts by scripts/build-book-shared.mjs. Do not edit:
// change the source, then run `node scripts/build-book-shared.mjs`.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PT_PER_MM = void 0;
exports.multiply = multiply;
exports.apply = apply;
exports.pageBoxesPt = pageBoxesPt;
exports.mmToPdfPoint = mmToPdfPoint;
exports.elementMatrixPt = elementMatrixPt;
exports.imageMatrixPt = imageMatrixPt;
exports.textPlacementPt = textPlacementPt;
// Book millimetres to PDF points, for the print renderer. The book's origin is the
// trim box's top-left with y down; a PDF page's origin is the media box's bottom-left
// with y up. Each page of the PDF is the trim size plus bleed on every side.
exports.PT_PER_MM = 72 / 25.4;
const r = (value) => Math.round(value * 1000) / 1000;
function multiply(m, n) {
    // Applies n first, then m (as nested `cm` operators m then n would).
    return [
        m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
}
function apply(m, x, y) {
    return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
/** The page boxes every interior page carries. TrimBox is where the printer cuts. */
function pageBoxesPt(spec) {
    const w = (spec.trimMm.w + spec.bleedMm * 2) * exports.PT_PER_MM;
    const h = (spec.trimMm.h + spec.bleedMm * 2) * exports.PT_PER_MM;
    const b = spec.bleedMm * exports.PT_PER_MM;
    const media = [0, 0, r(w), r(h)];
    return { media, bleed: media, trim: [r(b), r(b), r(w - b), r(h - b)] };
}
/** A point in trim millimetres as a PDF point. */
function mmToPdfPoint(xMm, yMm, spec) {
    return { x: (xMm + spec.bleedMm) * exports.PT_PER_MM, y: (spec.trimMm.h + spec.bleedMm - yMm) * exports.PT_PER_MM };
}
/**
 * Maps the unit square (0..1 both ways, origin bottom-left, as PDF images are drawn) onto
 * the element's box on the page: scaled to its size, rotated clockwise around its centre.
 */
function elementMatrixPt(element, spec) {
    const centre = mmToPdfPoint(element.xMm, element.yMm, spec);
    // Clockwise on screen (y down) is a negative angle in PDF space (y up).
    const angle = (-element.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const w = element.wMm * exports.PT_PER_MM;
    const h = element.hMm * exports.PT_PER_MM;
    const toCentre = [cos, sin, -sin, cos, centre.x, centre.y];
    const size = [w, 0, 0, h, -w / 2, -h / 2];
    return multiply(toCentre, size).map(r);
}
/**
 * Where to draw a cropped photo: the whole image, scaled so the crop fills the element.
 * Clip to `elementMatrixPt` (the unit square) first, then draw the image with this matrix.
 */
function imageMatrixPt(element, spec) {
    const { x, y, w, h } = element.crop;
    // Crop y is measured from the image top; the unit square's y runs from the bottom.
    const crop = [1 / w, 0, 0, 1 / h, -x / w, -(1 - y - h) / h];
    return multiply(elementMatrixPt(element, spec), crop).map(r);
}
/** Text placement: the box's top-left as the origin (y down inside it) and the size in points. */
function textPlacementPt(element, spec) {
    const box = elementMatrixPt(element, spec);
    return {
        /** Maps (0..wPt, 0..hPt), y down from the box's top-left, onto the page. */
        matrix: multiply(box, [1 / (element.wMm * exports.PT_PER_MM), 0, 0, -1 / (element.hMm * exports.PT_PER_MM), 0, 1]).map(r),
        widthPt: r(element.wMm * exports.PT_PER_MM),
        fontSizePt: element.sizePt,
        lineHeightPt: r(element.sizePt * element.lineHeight),
    };
}
