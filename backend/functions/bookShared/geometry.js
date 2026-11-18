// Generated from src/lib/book/geometry.ts by scripts/build-book-shared.mjs. Do not edit:
// change the source, then run `node scripts/build-book-shared.mjs`.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_TRANSFORM = exports.TEXT_SIZE_PT = exports.MIN_ELEMENT_MM = exports.MM_PER_PT = void 0;
exports.fitPageLayout = fitPageLayout;
exports.pagePxToMm = pagePxToMm;
exports.elementBoxPx = elementBoxPx;
exports.normalizeRotation = normalizeRotation;
exports.elementBounds = elementBounds;
exports.snapRotation = snapRotation;
exports.clampToPage = clampToPage;
exports.limitScale = limitScale;
exports.applyTransform = applyTransform;
exports.hitTest = hitTest;
exports.fitNewImage = fitNewImage;
exports.newElementCentre = newElementCentre;
exports.MM_PER_PT = 25.4 / 72;
/** Smallest side an element may shrink to, so it can still be found and grabbed. */
exports.MIN_ELEMENT_MM = 8;
exports.TEXT_SIZE_PT = { min: 6, max: 96 };
/** The largest page (trim plus bleed) that fits the area, keeping its proportions. */
function fitPageLayout(spec, availableWidth, availableHeight) {
    const wMm = spec.trimMm.w + spec.bleedMm * 2;
    const hMm = spec.trimMm.h + spec.bleedMm * 2;
    const scale = Math.max(0.01, Math.min(availableWidth / wMm, availableHeight / hMm));
    return { scale, bleedMm: spec.bleedMm, widthPx: wMm * scale, heightPx: hMm * scale };
}
/** A point measured from the drawn page's top-left corner, in trim millimetres. */
function pagePxToMm(xPx, yPx, layout) {
    return { x: xPx / layout.scale - layout.bleedMm, y: yPx / layout.scale - layout.bleedMm };
}
/** Where an element's unrotated box sits on the drawn page. */
function elementBoxPx(element, layout) {
    return {
        left: (element.xMm - element.wMm / 2 + layout.bleedMm) * layout.scale,
        top: (element.yMm - element.hMm / 2 + layout.bleedMm) * layout.scale,
        width: element.wMm * layout.scale,
        height: element.hMm * layout.scale,
    };
}
/** Degrees in (-180, 180]. */
function normalizeRotation(deg) {
    if (!Number.isFinite(deg))
        return 0;
    const turned = ((deg % 360) + 360) % 360;
    return turned > 180 ? turned - 360 : turned;
}
/** The axis-aligned box around an element after rotation, in trim millimetres. */
function elementBounds(element) {
    const angle = (element.rotationDeg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const halfW = (element.wMm * cos + element.hMm * sin) / 2;
    const halfH = (element.wMm * sin + element.hMm * cos) / 2;
    return { left: element.xMm - halfW, top: element.yMm - halfH, right: element.xMm + halfW, bottom: element.yMm + halfH };
}
/** Pulls a rotation onto a right angle when it is within `toleranceDeg` of one. */
function snapRotation(deg, toleranceDeg = 4) {
    const normal = normalizeRotation(deg);
    const nearest = Math.round(normal / 90) * 90;
    return Math.abs(normal - nearest) <= toleranceDeg ? normalizeRotation(nearest) : normal;
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
/** Keeps the element's centre on the trimmed page so it can never be lost off the edge. */
function clampToPage(element, spec) {
    return { ...element, xMm: clamp(element.xMm, 0, spec.trimMm.w), yMm: clamp(element.yMm, 0, spec.trimMm.h) };
}
/** The scale factor actually allowed, so a resize stays between the size limits. */
function limitScale(element, factor, spec) {
    if (!Number.isFinite(factor) || factor <= 0)
        return 1;
    let min;
    let max = Math.min((spec.trimMm.w * 2) / element.wMm, (spec.trimMm.h * 2) / element.hMm);
    if (element.type === 'text') {
        // A line of text is shorter than the grab size; its font size is the limit instead.
        min = Math.max(exports.TEXT_SIZE_PT.min / element.sizePt, exports.MIN_ELEMENT_MM / element.wMm);
        max = Math.min(max, exports.TEXT_SIZE_PT.max / element.sizePt);
    }
    else {
        min = exports.MIN_ELEMENT_MM / Math.min(element.wMm, element.hMm);
    }
    // An element already outside the limits may still move back toward them.
    return clamp(factor, Math.min(min, 1), Math.max(max, 1));
}
exports.NO_TRANSFORM = { dxMm: 0, dyMm: 0, scale: 1, dRotationDeg: 0 };
/** The element after a finished gesture: limited, snapped and kept on the page. */
function applyTransform(element, transform, spec) {
    const factor = limitScale(element, transform.scale, spec);
    const next = {
        ...element,
        xMm: element.xMm + transform.dxMm,
        yMm: element.yMm + transform.dyMm,
        wMm: element.wMm * factor,
        hMm: element.hMm * factor,
        rotationDeg: transform.dRotationDeg ? snapRotation(element.rotationDeg + transform.dRotationDeg) : element.rotationDeg,
    };
    if (element.type === 'text')
        next.sizePt = Math.round(element.sizePt * factor * 10) / 10;
    return clampToPage(next, spec);
}
/**
 * The topmost element under a point, or null. Small elements get a larger target
 * (`minTouchMm`) so a fingertip can still pick them.
 */
function hitTest(elements, xMm, yMm, minTouchMm = 9) {
    for (let i = elements.length - 1; i >= 0; i--) {
        const element = elements[i];
        const angle = (-element.rotationDeg * Math.PI) / 180;
        const dx = xMm - element.xMm;
        const dy = yMm - element.yMm;
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
        const halfW = Math.max(element.wMm, minTouchMm) / 2;
        const halfH = Math.max(element.hMm, minTouchMm) / 2;
        if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH)
            return element.id;
    }
    return null;
}
/** A new photo's size: its own proportions, inside 70% of the safe area. */
function fitNewImage(pxWidth, pxHeight, spec) {
    const ratio = pxWidth > 0 && pxHeight > 0 ? pxWidth / pxHeight : 1;
    const boxW = (spec.trimMm.w - spec.safeMm * 2) * 0.7;
    const boxH = (spec.trimMm.h - spec.safeMm * 2) * 0.7;
    const wMm = Math.min(boxW, boxH * ratio);
    return { wMm, hMm: wMm / ratio };
}
/** Where the n-th new element lands: the page centre, stepped so new items never hide each other. */
function newElementCentre(existingCount, spec) {
    const step = (existingCount % 6) * 6;
    return { xMm: spec.trimMm.w / 2 + step, yMm: spec.trimMm.h / 2 + step };
}
