// Generated from src/lib/book/glyphs.ts by scripts/build-book-shared.mjs. Do not edit:
// change the source, then run `node scripts/build-book-shared.mjs`.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_FONT = void 0;
exports.decodeRanges = decodeRanges;
exports.hasGlyph = hasGlyph;
exports.fontRuns = fontRuns;
exports.glyphReport = glyphReport;
const glyphCoverage_1 = require("./glyphCoverage");
// Which characters a book font can draw, and how text is split when it cannot.
// The app and the print renderer use the same rule, so a missing character looks the
// same on screen and on paper: it is drawn with the fallback font instead.
exports.FALLBACK_FONT = 'pretendard';
const decoded = new Map();
function decodeRanges(encoded) {
    const starts = [];
    const ends = [];
    let previous = -1;
    for (const token of encoded ? encoded.split(',') : []) {
        const [gap, size] = token.split('.').map(part => parseInt(part, 36));
        const first = previous + 1 + gap;
        starts.push(first);
        ends.push(first + size);
        previous = first + size;
    }
    return { starts, ends };
}
function ranges(font) {
    let value = decoded.get(font);
    if (!value) {
        value = decodeRanges(glyphCoverage_1.GLYPH_COVERAGE[font] ?? '');
        decoded.set(font, value);
    }
    return value;
}
/** Line breaks, tabs and spaces never need a glyph of their own. */
const isLayoutOnly = (code) => code === 0x0a || code === 0x0d || code === 0x09 || code === 0x20;
function hasGlyph(font, code) {
    if (isLayoutOnly(code))
        return true;
    const { starts, ends } = ranges(font);
    let low = 0;
    let high = starts.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (code < starts[mid])
            high = mid - 1;
        else if (code > ends[mid])
            low = mid + 1;
        else
            return true;
    }
    return false;
}
/**
 * The text cut into runs drawn with one font each: the element's font where it has
 * the character, the fallback font otherwise. Spaces stay with the run they are in.
 */
function fontRuns(text, font) {
    const runs = [];
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        const current = runs[runs.length - 1];
        const use = isLayoutOnly(code) && current ? current.font : hasGlyph(font, code) ? font : exports.FALLBACK_FONT;
        if (current && current.font === use)
            current.text += char;
        else
            runs.push({ text: char, font: use });
    }
    return runs;
}
function glyphReport(text, font) {
    const fallback = new Set();
    const missing = new Set();
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        // Variation selectors and joiners only adjust the character before them.
        if (hasGlyph(font, code) || (code >= 0xfe00 && code <= 0xfe0f) || code === 0x200d)
            continue;
        if (hasGlyph(exports.FALLBACK_FONT, code))
            fallback.add(char);
        else
            missing.add(char);
    }
    return { fallback: [...fallback], missing: [...missing] };
}
