// Generated from src/lib/book/specs.ts by scripts/build-book-shared.mjs. Do not edit:
// change the source, then run `node scripts/build-book-shared.mjs`.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOOK_SPECS = void 0;
exports.getBookSpec = getBookSpec;
// Assumed values until the print partner's BookSpecs response confirms them
// (docs/book-feature-design.md, 4.1 and 6.1). Change them here, not in screens.
exports.BOOK_SPECS = {
    'a5-soft': {
        id: 'a5-soft',
        label: 'A5 소프트커버',
        trimMm: { w: 148, h: 210 },
        bleedMm: 3,
        safeMm: 8,
        pages: { min: 50, max: 200, step: 2 },
        minEffectiveDpi: { warn: 200, block: 100 },
    },
};
function getBookSpec(id) {
    return exports.BOOK_SPECS[id];
}
