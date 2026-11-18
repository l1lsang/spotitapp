// Generated from src/lib/book/textLayout.ts by scripts/build-book-shared.mjs. Do not edit:
// change the source, then run `node scripts/build-book-shared.mjs`.
"use strict";
// Line breaking for book text, shared by the print renderer and the checks. It follows
// what CSS and React Native do by default for Korean: a line may break between any two
// Hangul syllables ('char'), or, as `word-break: keep-all`, only at spaces ('keep-all').
// Widths come from the caller, so the same rules run with any font measurer.
Object.defineProperty(exports, "__esModule", { value: true });
exports.breakLines = breakLines;
exports.baselines = baselines;
const WIDE = /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;
/** No line may start with these. */
const NO_START = new Set([...'.,!?)]}」』’”…:;%·、。，']);
/** No line may end with these. */
const NO_END = new Set([...'([{「『‘“']);
/** ok[i]: a line may end right before chars[i]. */
function breakPoints(chars, mode) {
    const ok = new Array(chars.length + 1).fill(false);
    for (let i = 1; i < chars.length; i++) {
        const before = chars[i - 1];
        const after = chars[i];
        if (NO_START.has(after) || NO_END.has(before))
            continue;
        if (before === ' ' && after !== ' ')
            ok[i] = true;
        else if (mode === 'char' && before !== ' ' && after !== ' ' && (WIDE.test(before) || WIDE.test(after)))
            ok[i] = true;
    }
    ok[chars.length] = true;
    return ok;
}
/**
 * Lines of `text` in a box `width` wide, filled greedily like a browser: spaces at a
 * line end hang past the edge and are dropped; a word longer than a line is cut.
 * Widths add up per character (no kerning between them), measured once each.
 */
function breakLines(text, width, measure, mode = 'char') {
    const cache = new Map();
    const charWidth = (char) => {
        let value = cache.get(char);
        if (value === undefined) {
            value = measure(char);
            cache.set(char, value);
        }
        return value;
    };
    const lines = [];
    for (const paragraph of text.split(/\r?\n/)) {
        const chars = [...paragraph];
        if (!chars.length) {
            lines.push('');
            continue;
        }
        const ok = breakPoints(chars, mode);
        const prefix = [0];
        for (const char of chars)
            prefix.push(prefix[prefix.length - 1] + charWidth(char));
        const widthOf = (from, to) => {
            let end = to;
            while (end > from && chars[end - 1] === ' ')
                end--;
            return prefix[end] - prefix[from];
        };
        let start = 0;
        while (start < chars.length) {
            let lastBreak = -1;
            let end = start + 1;
            for (; end <= chars.length; end++) {
                if (widthOf(start, end) > width + 0.01)
                    break;
                if (ok[end])
                    lastBreak = end;
            }
            if (end > chars.length) {
                lines.push(chars.slice(start).join('').replace(/ +$/, ''));
                break;
            }
            const cut = lastBreak > start ? lastBreak : Math.max(start + 1, end - 1);
            lines.push(chars.slice(start, cut).join('').replace(/ +$/, ''));
            start = cut;
            while (chars[start] === ' ')
                start++;
        }
    }
    return lines;
}
/**
 * Baseline of each line, measured down from the box top, placed as CSS does: the line
 * height's extra space split evenly above and below the font's ascent and descent.
 * `ascent` and `descent` are fractions of the font size (descent is negative).
 */
function baselines(lineCount, sizePt, lineHeight, ascent, descent) {
    const line = sizePt * lineHeight;
    const glyphs = (ascent - descent) * sizePt;
    return Array.from({ length: lineCount }, (_, i) => i * line + (line - glyphs) / 2 + ascent * sizePt);
}
