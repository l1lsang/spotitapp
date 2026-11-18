// Generated from src/lib/book/styles.ts by scripts/build-book-shared.mjs. Do not edit:
// change the source, then run `node scripts/build-book-shared.mjs`.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PATTERN_STEP_MM = exports.PAGE_BACKGROUNDS = exports.TEXT_COLORS = exports.BOOK_FONT_IDS = exports.BOOK_FONTS = void 0;
exports.getBookFont = getBookFont;
exports.sameBackground = sameBackground;
exports.stepTextSize = stepTextSize;
const geometry_1 = require("./geometry");
exports.BOOK_FONTS = [
    { id: 'nanum-pen', label: '손글씨', family: 'NanumPen-Regular' },
    { id: 'gowun-batang', label: '명조', family: 'GowunBatang-Regular' },
    { id: 'pretendard', label: '고딕', family: null },
];
exports.BOOK_FONT_IDS = exports.BOOK_FONTS.map(font => font.id);
function getBookFont(id) {
    return exports.BOOK_FONTS.find(font => font.id === id) ?? exports.BOOK_FONTS[exports.BOOK_FONTS.length - 1];
}
exports.TEXT_COLORS = [
    { color: '#161F1B', label: '먹색' },
    { color: '#974426', label: '벽돌색' },
    { color: '#234E43', label: '초록' },
    { color: '#8A6236', label: '갈색' },
    { color: '#3F5F82', label: '파랑' },
    { color: '#6E7470', label: '회색' },
    { color: '#FFFFFF', label: '흰색' },
];
exports.PAGE_BACKGROUNDS = [
    { id: 'cream', label: '크림', background: { color: '#F7F2E8' } },
    { id: 'white', label: '흰 종이', background: { color: '#FFFFFF' } },
    { id: 'grid', label: '모눈', background: { color: '#F4F5EE', pattern: 'grid' } },
    { id: 'lined', label: '줄지', background: { color: '#FFFFFF', pattern: 'lined' } },
    { id: 'kraft', label: '크라프트', background: { color: '#D9C3A5' } },
    { id: 'night', label: '밤', background: { color: '#2F3B4A' } },
];
/** Spacing of the printed lines, in millimetres. */
exports.PATTERN_STEP_MM = { grid: 5, lined: 8 };
function sameBackground(a, b) {
    return a.color.toUpperCase() === b.color.toUpperCase() && (a.pattern ?? null) === (b.pattern ?? null);
}
/** The next text size up or down: 1pt steps for body text, larger steps for headings. */
function stepTextSize(sizePt, direction) {
    const current = Math.round(sizePt);
    const step = (direction > 0 ? current : current - 1) >= 32 ? 4 : (direction > 0 ? current : current - 1) >= 14 ? 2 : 1;
    return Math.min(geometry_1.TEXT_SIZE_PT.max, Math.max(geometry_1.TEXT_SIZE_PT.min, current + direction * step));
}
