import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { baselines, breakLines } from '../src/lib/book/textLayout.ts'
import { decodeRanges, fontRuns, glyphReport, hasGlyph } from '../src/lib/book/glyphs.ts'
import { preflightBook } from '../src/lib/book/preflight.ts'
import { getBookSpec } from '../src/lib/book/specs.ts'
import { encodeRanges, OUTPUT as GLYPH_OUTPUT, renderCoverageModule } from '../scripts/build-book-glyphs.mjs'
import { OUTPUT as SHARED_OUTPUT, renderShared } from '../scripts/build-book-shared.mjs'

const spec = getBookSpec('a5-soft')
// Monospace measurer: Hangul 10, everything else 5, so lines are easy to reason about.
const mono = char => (/[\uac00-\ud7a3]/.test(char) ? 10 : 5)

test('Korean breaks between syllables by default, only at spaces with keep-all', () => {
  assert.deepEqual(breakLines('가나다 라마바사', 40, mono), ['가나다', '라마바사'])
  assert.deepEqual(breakLines('가나다라마 바사', 40, mono), ['가나다라', '마 바사'])
  assert.deepEqual(breakLines('가나 다라마바사', 50, mono), ['가나 다라', '마바사'])
  assert.deepEqual(breakLines('가나 다라마바사', 50, mono, 'keep-all'), ['가나', '다라마바사'])
  // A word longer than the line is still cut, as `overflow-wrap: anywhere` does.
  assert.deepEqual(breakLines('가나다라마 바사', 40, mono, 'keep-all'), ['가나다라', '마 바사'])
})

test('closing marks never start a line and opening marks never end one', () => {
  // "가나다." needs 35: the period may not begin the next line, so 다 moves down with it.
  assert.deepEqual(breakLines('가나다.', 30, mono), ['가나', '다.'])
  assert.deepEqual(breakLines('가나「다라」', 30, mono), ['가나', '「다라」'])
})

test('spaces at a line end hang, paragraphs and blank lines are kept, long words are cut', () => {
  assert.deepEqual(breakLines('abcd    efgh', 20, mono), ['abcd', 'efgh'])
  assert.deepEqual(breakLines('가\n\n나', 40, mono), ['가', '', '나'])
  assert.deepEqual(breakLines('abcdefghij', 20, mono), ['abcd', 'efgh', 'ij'])
  assert.deepEqual(breakLines('', 20, mono), [''])
})

test('each distinct character is measured once', () => {
  let calls = 0
  breakLines('가나가나가나 가나', 30, char => { calls++; return mono(char) })
  assert.equal(calls, 3)
})

test('baselines sit where CSS puts them', () => {
  // 10pt at 1.5: 15pt lines; glyphs 0.8 + 0.2 = 10pt tall, so 2.5pt above, baseline 2.5 + 8.
  assert.deepEqual(baselines(2, 10, 1.5, 0.8, -0.2), [10.5, 25.5])
})

test('glyph ranges survive encoding and look up correctly', () => {
  const ranges = [[32, 126], [0xac00, 0xd7a3], [0x1f600, 0x1f600]]
  const decoded = decodeRanges(encodeRanges(ranges))
  assert.deepEqual(decoded.starts.map((start, i) => [start, decoded.ends[i]]), ranges)
  assert.deepEqual(decodeRanges(''), { starts: [], ends: [] })
})

test('coverage matches the real fonts: Nanum Pen lacks some symbols, the app Gowun subset lacks rare syllables', () => {
  for (const font of ['pretendard', 'gowun-batang', 'nanum-pen']) assert.equal(hasGlyph(font, '가'.codePointAt(0)), true)
  assert.equal(hasGlyph('nanum-pen', '·'.codePointAt(0)), false)
  assert.equal(hasGlyph('nanum-pen', '…'.codePointAt(0)), false)
  assert.equal(hasGlyph('nanum-pen', '똠'.codePointAt(0)), true)
  assert.equal(hasGlyph('gowun-batang', '똠'.codePointAt(0)), false)
  assert.equal(hasGlyph('pretendard', '·'.codePointAt(0)), true)
  assert.equal(hasGlyph('pretendard', '😀'.codePointAt(0)), false)
  assert.equal(hasGlyph('nanum-pen', '\n'.codePointAt(0)), true)
})

test('text splits into font runs only where the font lacks a character', () => {
  assert.deepEqual(fontRuns('가나 다', 'nanum-pen'), [{ text: '가나 다', font: 'nanum-pen' }])
  assert.deepEqual(fontRuns('성북천 · 한강…', 'nanum-pen'), [
    { text: '성북천 ', font: 'nanum-pen' }, { text: '· ', font: 'pretendard' }, { text: '한강', font: 'nanum-pen' }, { text: '…', font: 'pretendard' },
  ])
  assert.deepEqual(fontRuns('똠양꿍', 'gowun-batang'), [{ text: '똠', font: 'pretendard' }, { text: '양꿍', font: 'gowun-batang' }])
  assert.equal(fontRuns('· 😀', 'pretendard').length, 1)
})

test('the glyph report separates fallback characters from ones nothing can print', () => {
  assert.deepEqual(glyphReport('좋아 · 😀\u{fe0f} ♥ ♥', 'nanum-pen'), { fallback: ['·', '♥'], missing: ['😀'] })
  assert.deepEqual(glyphReport('평범한 문장입니다.', 'nanum-pen'), { fallback: [], missing: [] })
})

const textPage = (text, font) => ({ pages: [{ id: 'p', background: { color: '#FFFFFF' }, elements: [
  { id: 't', type: 'text', text, font, sizePt: 12, color: '#161F1B', align: 'left', lineHeight: 1.5, xMm: 74, yMm: 100, wMm: 100, hMm: 6, rotationDeg: 0 },
] }] })
const glyphIssues = draft => preflightBook(draft, spec).filter(issue => issue.kind.startsWith('glyph')).map(issue => `${issue.kind}:${issue.severity}`)

test('preflight notes fallback characters and warns about ones that print as boxes', () => {
  assert.deepEqual(glyphIssues(textPage('걷기 · 산책 😀', 'nanum-pen')), ['glyph-missing:warn', 'glyph-fallback:info'])
  assert.deepEqual(glyphIssues(textPage('걷기 · 산책', 'pretendard')), [])
  assert.deepEqual(glyphIssues(textPage('걷기 😀', 'pretendard')), ['glyph-missing:warn'])
  const fallback = preflightBook(textPage('a · b', 'nanum-pen'), spec).find(issue => issue.kind === 'glyph-fallback')
  assert.equal(fallback.title, '손글씨 글꼴에 없는 글자가 있어요')
  assert.match(fallback.detail, /^고딕 글꼴로 대신 인쇄돼요: '·'\./)
})

const disk = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('generated glyph coverage is up to date with the font files', () => {
  assert.equal(disk(GLYPH_OUTPUT), renderCoverageModule(), 'run node scripts/build-book-glyphs.mjs')
})

test('the Functions copy of the book rules is up to date and behaves the same', () => {
  for (const [name, text] of renderShared()) assert.equal(disk(`${SHARED_OUTPUT}${name}`), text, `${name}: run node scripts/build-book-shared.mjs`)
  const require = createRequire(new URL(`../${SHARED_OUTPUT}`, import.meta.url))
  const shared = require('./preflight.js')
  const draft = textPage('걷기 · 산책 😀', 'nanum-pen')
  assert.deepEqual(shared.preflightBook(draft, require('./specs.js').getBookSpec('a5-soft')), preflightBook(draft, spec))
})
