// Approach A: draw the book with pdf-lib (pure JavaScript, no browser).
//   node --import ../../tests/register-types.mjs render-pdflib.mjs [char|keep-all] [--no-subset]
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix,
  moveTo, lineTo, closePath, clip, endPath,
} from 'pdf-lib'
import forkedFontkit from '@pdf-lib/fontkit'
import { fontkitAdapter } from './fontkitAdapter.mjs'
import { apply, elementMatrixPt, imageMatrixPt, multiply, pageBoxesPt, PT_PER_MM } from '../../src/lib/book/pdfCoords.ts'
import { getBookSpec } from '../../src/lib/book/specs.ts'
import { PATTERN_STEP_MM } from '../../src/lib/book/styles.ts'
import { baselines, breakLines } from './textLayout.mjs'

const mode = process.argv[2] === 'keep-all' ? 'keep-all' : 'char'
const subset = !process.argv.includes('--no-subset')
// --fork: pdf-lib's own fontkit fork, which fails on Pretendard (kept to show the finding).
const fork = process.argv.includes('--fork')
const fontkit = fork ? forkedFontkit : fontkitAdapter
const FONT_FILES = {
  // Print uses the full Gowun Batang; the app ships a subset of it.
  'gowun-batang': 'C:/Users/jkm08/AppData/Local/Temp/fonts/GowunBatang-Regular.ttf',
  'nanum-pen': new URL('../../assets/fonts/book/NanumPenScript-Regular.ttf', import.meta.url),
  pretendard: new URL('../../assets/fonts/Pretendard-Regular.otf', import.meta.url),
}
const LINE_COLOR = '#C5CEC0'

const hex = value => rgb(parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255)

const started = performance.now()
let peakRss = 0
const sample = () => { peakRss = Math.max(peakRss, process.memoryUsage().rss) }
const sampler = setInterval(sample, 50)

const draft = JSON.parse(readFileSync(new URL('./out/sample-book.json', import.meta.url), 'utf8'))
const spec = getBookSpec(draft.specId)
const pdf = await PDFDocument.create()
pdf.registerFontkit(fontkit)
pdf.setTitle(draft.title)
pdf.setProducer('PINORI book-pdf spike (pdf-lib)')

const fonts = {}
const metrics = {}
for (const [id, file] of Object.entries(FONT_FILES)) {
  const bytes = readFileSync(file)
  fonts[id] = await pdf.embedFont(bytes, { subset })
  const kit = fontkit.create(bytes)
  metrics[id] = { ascent: kit.ascent / kit.unitsPerEm, descent: kit.descent / kit.unitsPerEm }
}
const images = new Map()
async function image(url) {
  if (!images.has(url)) images.set(url, await pdf.embedJpg(readFileSync(fileURLToPath(url))))
  return images.get(url)
}

const boxes = pageBoxesPt(spec)
const [, , W, H] = boxes.media
const lineReport = []
const phases = { fontsAndSetup: 0, images: 0, text: 0, save: 0 }
const setupDone = performance.now()
phases.fontsAndSetup = setupDone - started

function drawPattern(page, background) {
  if (!background.pattern) return
  const step = PATTERN_STEP_MM[background.pattern]
  const positions = length => {
    const values = []
    for (let mm = -Math.floor(spec.bleedMm / step) * step; mm <= length + spec.bleedMm; mm += step) if (mm > -spec.bleedMm) values.push((mm + spec.bleedMm) * PT_PER_MM)
    return values
  }
  const thickness = 0.15 * PT_PER_MM
  for (const y of positions(spec.trimMm.h)) page.drawLine({ start: { x: 0, y: H - y }, end: { x: W, y: H - y }, thickness, color: hex(LINE_COLOR) })
  if (background.pattern === 'grid') for (const x of positions(spec.trimMm.w)) page.drawLine({ start: { x, y: 0 }, end: { x, y: H }, thickness, color: hex(LINE_COLOR) })
}

async function drawImage(page, element) {
  const embedded = await image(element.ref.url)
  // Clip to the element's rotated box in page space, then draw the whole photo scaled so the crop fills it.
  const box = elementMatrixPt(element, spec)
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => apply(box, x, y))
  page.pushOperators(pushGraphicsState(), moveTo(corners[0].x, corners[0].y), ...corners.slice(1).map(c => lineTo(c.x, c.y)), closePath(), clip(), endPath(),
    concatTransformationMatrix(...imageMatrixPt(element, spec)))
  page.drawImage(embedded, { x: 0, y: 0, width: 1, height: 1 })
  page.pushOperators(popGraphicsState())
}

function drawText(page, element) {
  const font = fonts[element.font]
  const { ascent, descent } = metrics[element.font]
  const wPt = element.wMm * PT_PER_MM
  const hPt = element.hMm * PT_PER_MM
  const size = element.sizePt
  const lines = breakLines(element.text, wPt, piece => font.widthOfTextAtSize(piece, size), mode)
  lineReport.push({ id: element.id, lines: lines.length, boxLines: Math.round(hPt / (size * element.lineHeight)) })
  // Box space: origin at the box's bottom-left, y up, in points, rotated with the element.
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...multiply(elementMatrixPt(element, spec), [1 / wPt, 0, 0, 1 / hPt, 0, 0])))
  baselines(lines.length, size, element.lineHeight, ascent, descent).forEach((baseline, i) => {
    const width = font.widthOfTextAtSize(lines[i], size)
    const x = element.align === 'center' ? (wPt - width) / 2 : element.align === 'right' ? wPt - width : 0
    if (lines[i]) page.drawText(lines[i], { x, y: hPt - baseline, size, font, color: hex(element.color) })
  })
  page.pushOperators(popGraphicsState())
}

for (const bookPage of draft.pages) {
  const page = pdf.addPage([W, H])
  page.setMediaBox(...boxes.media.slice(0, 2), W, H)
  page.setBleedBox(0, 0, W, H)
  page.setTrimBox(boxes.trim[0], boxes.trim[1], boxes.trim[2] - boxes.trim[0], boxes.trim[3] - boxes.trim[1])
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hex(bookPage.background.color) })
  drawPattern(page, bookPage.background)
  for (const element of bookPage.elements) {
    const t = performance.now()
    if (element.type === 'image') await drawImage(page, element)
    else drawText(page, element)
    phases[element.type === 'image' ? 'images' : 'text'] += performance.now() - t
  }
  sample()
}
// Default saving yields to the event loop every 50 objects, which is slow for big books.
const saveStart = performance.now()
const bytes = await pdf.save({ objectsPerTick: Infinity })
phases.save = performance.now() - saveStart
sample()
clearInterval(sampler)
const name = `out/pdflib-${mode}${subset ? '' : '-nosubset'}.pdf`
writeFileSync(new URL(`./${name}`, import.meta.url), bytes)
writeFileSync(new URL(`./out/lines-pdflib-${mode}.json`, import.meta.url), JSON.stringify(lineReport))
const result = {
  renderer: 'pdf-lib', mode, subset, pages: draft.pages.length, uniqueImages: images.size,
  seconds: +((performance.now() - started) / 1000).toFixed(1), peakRssMB: Math.round(peakRss / 2 ** 20), sizeMB: +(bytes.length / 2 ** 20).toFixed(1), file: name,
  phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, +(v / 1000).toFixed(1)])),
}
console.log(JSON.stringify(result))
