// Generated from src/lib/book/preflight.ts by scripts/build-book-shared.mjs. Do not edit:
// change the source, then run `node scripts/build-book-shared.mjs`.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.effectiveDpi = effectiveDpi;
exports.pageIssues = pageIssues;
exports.preflightBook = preflightBook;
exports.flaggedPages = flaggedPages;
exports.countBySeverity = countBySeverity;
exports.orderReadiness = orderReadiness;
const geometry_1 = require("./geometry");
const styles_1 = require("./styles");
const glyphs_1 = require("./glyphs");
const MM_PER_INCH = 25.4;
/** A photo must reach this far past the trim line to count as running into the bleed. */
const BLEED_REACH_MM = 0.5;
const round = (value, step = 0.5) => Math.ceil(value / step) * step;
/** Print resolution of a placed photo: the pixels it shows over the size it prints at. */
function effectiveDpi(element) {
    const pxW = element.ref.pxWidth * element.crop.w;
    const pxH = element.ref.pxHeight * element.crop.h;
    return Math.min(pxW / (element.wMm / MM_PER_INCH), pxH / (element.hMm / MM_PER_INCH));
}
function photoIssues(element, pageIndex, spec) {
    const issues = [];
    const dpi = Math.round(effectiveDpi(element));
    const { warn, block } = spec.minEffectiveDpi;
    if (dpi < warn) {
        const blocked = dpi < block;
        issues.push({
            id: `photo-resolution:${element.id}`, kind: 'photo-resolution', severity: blocked ? 'error' : 'warn', pageIndex, elementId: element.id,
            title: blocked ? '사진이 너무 크게 놓여 인쇄할 수 없어요' : '사진이 흐릿하게 인쇄돼요',
            // Every photo so far is the 1600px display copy: no original exists to print sharper.
            detail: `약 ${dpi}dpi예요(권장 300dpi). 원본이 없어 더 선명하게 만들 수는 없어요. ${blocked ? `${block}dpi 이상이 되도록 ` : ''}작게 놓거나 다른 사진으로 바꿔 주세요.`,
        });
    }
    const box = (0, geometry_1.elementBounds)(element);
    const edges = [
        { past: -box.left, name: '왼쪽' }, { past: -box.top, name: '위쪽' },
        { past: box.right - spec.trimMm.w, name: '오른쪽' }, { past: box.bottom - spec.trimMm.h, name: '아래쪽' },
    ].filter(edge => edge.past > 0.05);
    const short = edges.filter(edge => edge.past < spec.bleedMm - BLEED_REACH_MM);
    if (short.length) {
        issues.push({
            id: `photo-bleed-gap:${element.id}`, kind: 'photo-bleed-gap', severity: 'warn', pageIndex, elementId: element.id,
            title: '사진 가장자리에 흰 줄이 생길 수 있어요',
            detail: `${short.map(edge => edge.name).join('·')} 끝이 재단선을 조금만 넘었어요. 재단 여백까지 ${spec.bleedMm}mm 더 늘리거나 재단선 안쪽으로 옮겨 주세요.`,
        });
    }
    else if (edges.length) {
        issues.push({
            id: `photo-full-bleed:${element.id}`, kind: 'photo-full-bleed', severity: 'info', pageIndex, elementId: element.id,
            title: '사진 가장자리가 재단돼요',
            detail: '재단 여백까지 채운 사진이에요. 의도한 배치라면 그대로 두셔도 돼요.',
        });
    }
    return issues;
}
function textIssues(element, pageIndex, spec) {
    if (element.type !== 'text')
        return [];
    const issues = [];
    if (!styles_1.BOOK_FONT_IDS.includes(element.font)) {
        issues.push({
            id: `font:${element.id}`, kind: 'font', severity: 'error', pageIndex, elementId: element.id,
            title: '인쇄할 수 없는 글꼴이에요', detail: '글 스타일에서 손글씨·명조·고딕 중 하나로 바꿔 주세요.',
        });
    }
    else {
        const glyphs = (0, glyphs_1.glyphReport)(element.text, element.font);
        const list = (chars) => chars.slice(0, 8).map(char => `'${char}'`).join(' ') + (chars.length > 8 ? ` 외 ${chars.length - 8}자` : '');
        if (glyphs.missing.length) {
            issues.push({
                id: `glyph-missing:${element.id}`, kind: 'glyph-missing', severity: 'warn', pageIndex, elementId: element.id,
                title: '인쇄되지 않는 글자가 있어요',
                detail: `책 글꼴에 없어 빈 네모로 인쇄돼요: ${list(glyphs.missing)}. 지우거나 다른 글자로 바꿔 주세요.`,
            });
        }
        if (glyphs.fallback.length) {
            issues.push({
                id: `glyph-fallback:${element.id}`, kind: 'glyph-fallback', severity: 'info', pageIndex, elementId: element.id,
                title: `${(0, styles_1.getBookFont)(element.font).label} 글꼴에 없는 글자가 있어요`,
                detail: `${(0, styles_1.getBookFont)(glyphs_1.FALLBACK_FONT).label} 글꼴로 대신 인쇄돼요: ${list(glyphs.fallback)}. 화면에 보이는 모양 그대로예요.`,
            });
        }
    }
    const box = (0, geometry_1.elementBounds)(element);
    const over = Math.max(spec.safeMm - box.left, spec.safeMm - box.top, box.right - (spec.trimMm.w - spec.safeMm), box.bottom - (spec.trimMm.h - spec.safeMm));
    if (over > 0.25) {
        const cut = Math.max(-box.left, -box.top, box.right - spec.trimMm.w, box.bottom - spec.trimMm.h) > 0;
        issues.push({
            id: `text-outside-safe:${element.id}`, kind: 'text-outside-safe', severity: 'warn', pageIndex, elementId: element.id,
            title: cut ? '글이 잘려요' : '글이 잘릴 수 있어요',
            detail: `글이 안전 영역 밖으로 ${round(over)}mm 나갔어요. 재단할 때 조금씩 밀릴 수 있으니 글 상자를 안쪽으로 옮겨 주세요.`,
        });
    }
    return issues;
}
function pageIssues(page, pageIndex, spec) {
    return page.elements.flatMap(element => element.type === 'image' ? photoIssues(element, pageIndex, spec) : textIssues(element, pageIndex, spec));
}
const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };
/** Every issue in the book: most serious first, then by page. */
function preflightBook(draft, spec) {
    const issues = [];
    const count = draft.pages.length;
    const { min, max, step } = spec.pages;
    if (count < min || count > max || count % step !== 0) {
        issues.push({
            id: 'page-count', kind: 'page-count', severity: 'error', pageIndex: null,
            title: count < min ? `${min - count}쪽이 더 필요해요` : count > max ? `${count - max}쪽을 줄여야 해요` : '쪽 수를 짝수로 맞춰 주세요',
            detail: `인쇄하려면 ${min}~${max}쪽, ${step}쪽 단위가 필요해요. 지금 ${count}쪽이에요.`,
        });
    }
    draft.pages.forEach((page, index) => issues.push(...pageIssues(page, index, spec)));
    const empty = draft.pages.map((page, index) => (page.elements.length ? -1 : index)).filter(index => index >= 0);
    if (empty.length) {
        const shown = empty.slice(0, 6).map(index => index + 1).join(', ');
        const more = empty.length - 6;
        issues.push({
            id: 'empty-page', kind: 'empty-page', severity: 'info', pageIndex: empty[0],
            title: `빈 쪽이 ${empty.length}개 있어요`,
            detail: `${shown}쪽${more > 0 ? ` 외 ${more}쪽` : ''}이 비어 있어요. 빈 쪽은 흰 종이로 인쇄돼요.`,
        });
    }
    return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.pageIndex ?? -1) - (b.pageIndex ?? -1));
}
/** Pages with something to fix (error or warn), as 0-based indexes. */
function flaggedPages(issues) {
    return [...new Set(issues.filter(issue => issue.severity !== 'info' && issue.pageIndex !== null).map(issue => issue.pageIndex))].sort((a, b) => a - b);
}
function countBySeverity(issues) {
    const counts = { error: 0, warn: 0, info: 0 };
    for (const issue of issues)
        counts[issue.severity]++;
    return counts;
}
/**
 * Whether the book may go to ordering: errors block it, warnings need the user's
 * confirmation (Figma E3), otherwise it is ready. The server repeats this before charging.
 */
function orderReadiness(issues) {
    const counts = countBySeverity(issues);
    return counts.error ? 'blocked' : counts.warn ? 'confirm' : 'ready';
}
