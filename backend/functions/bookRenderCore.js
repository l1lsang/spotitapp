// Draws a book draft as an interior print PDF with pdf-lib. No Firebase here: the caller
// supplies the draft, the font files and a way to read each photo, so this runs in
// plain tests. Coordinates, line breaking, glyph fallback and print checks come from
// bookShared/, the same code the app runs (docs/book-pdf-spike.md).
const { Buffer } = require('node:buffer')
const { EventEmitter } = require('node:events')
const {
  PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix,
  moveTo, lineTo, closePath, clip, endPath,
} = require('pdf-lib')
const fontkit = require('fontkit')
const { apply, elementMatrixPt, imageMatrixPt, multiply, pageBoxesPt, PT_PER_MM } = require('./bookShared/pdfCoords')
const { baselines, breakLines } = require('./bookShared/textLayout')
const { fontRuns, hasGlyph, FALLBACK_FONT } = require('./bookShared/glyphs')
const { preflightBook } = require('./bookShared/preflight')
const { getBookSpec } = require('./bookShared/specs')
const { prepareImage } = require('./bookImages')
const { PATTERN_STEP_MM, getBookFont } = require('./bookShared/styles')

const LINE_COLOR = '#C5CEC0'
/** Text may run this many points past its box before it counts as longer than on screen. */
const OVERFLOW_TOLERANCE = 0.6

/**
 * pdf-lib's own fontkit fork cannot read CID-keyed CFF fonts such as Pretendard's OTF.
 * Upstream fontkit 2 can, but dropped `encodeStream()`, which pdf-lib's subsetter calls.
 */
const fontkitAdapter = {
  create(bytes) {
    const font = fontkit.create(Buffer.from(bytes))
    const createSubset = font.createSubset.bind(font)
    font.createSubset = () => {
      const subset = createSubset()
      subset.encodeStream = () => {
        const stream = new EventEmitter()
        queueMicrotask(() => {
          try {
            stream.emit('data', new Uint8Array(subset.encode()))
            stream.emit('end')
          } catch (error) {
            stream.emit('error', error)
          }
        })
        return stream
      }
      return subset
    }
    return font
  },
}

const hex = value => rgb(parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255)

/**
 * @param {object} input
 * @param {object} input.draft  a book draft (schema of src/types/book.ts)
 * @param {Record<string, Uint8Array>} input.fonts  font file bytes by book font id
 * @param {(ref: object) => Promise<{ bytes: Uint8Array, source: 'print' | 'display' } | null>} input.loadImage
 *   a photo's file, from its private print copy when it has one; null when it cannot be used
 * @returns {Promise<{ pdf: Uint8Array, issues: object[], stats: object }>}
 */
async function renderBook({ draft, fonts: fontFiles, loadImage, title }) {
  const started = Date.now()
  const spec = getBookSpec(draft.specId)
  const pdf = await PDFDocument.create({ updateMetadata: false })
  pdf.registerFontkit(fontkitAdapter)
  pdf.setTitle(title || draft.title || 'PINORI book')
  pdf.setProducer('PINORI print renderer (pdf-lib)')

  const fonts = {}
  const metrics = {}
  for (const [id, bytes] of Object.entries(fontFiles)) {
    fonts[id] = await pdf.embedFont(bytes, { subset: true })
    const kit = fontkit.create(Buffer.from(bytes))
    metrics[id] = { ascent: kit.ascent / kit.unitsPerEm, descent: kit.descent / kit.unitsPerEm }
  }
  if (!fonts[FALLBACK_FONT]) throw new Error(`the fallback font ${FALLBACK_FONT} is required`)

  const issues = []
  // Each photo is read and prepared once, however often it is placed, at the size its
  // largest placement needs. Done before the print checks, so resolution is judged on
  // the file actually printed rather than the size the app recorded.
  const placements = new Map()
  for (const page of draft.pages) {
    for (const element of page.elements) {
      if (element.type !== 'image') continue
      if (!placements.has(element.ref.url)) placements.set(element.ref.url, { ref: element.ref, elements: [] })
      placements.get(element.ref.url).elements.push(element)
    }
  }
  const images = new Map()
  const imageStats = { printCopies: 0, resized: 0, imageBytes: 0 }
  for (const [url, { ref, elements }] of placements) {
    const loaded = await loadImage(ref)
    const prepared = loaded ? await prepareImage(loaded.bytes, elements) : null
    if (!prepared) { images.set(url, null); continue }
    const fromPrint = loaded.source === 'print'
    const { printPxWidth: _w, printPxHeight: _h, ...plain } = ref
    images.set(url, {
      image: await pdf.embedJpg(prepared.bytes),
      ref: fromPrint
        ? { ...plain, printPxWidth: prepared.sourceWidth, printPxHeight: prepared.sourceHeight }
        : { ...plain, pxWidth: prepared.sourceWidth, pxHeight: prepared.sourceHeight },
    })
    if (fromPrint) imageStats.printCopies++
    if (prepared.resized) imageStats.resized++
    imageStats.imageBytes += prepared.bytes.length
  }
  const checked = {
    ...draft,
    pages: draft.pages.map(page => ({
      ...page,
      elements: page.elements.map(element => (element.type === 'image' && images.get(element.ref.url) ? { ...element, ref: images.get(element.ref.url).ref } : element)),
    })),
  }

  const boxes = pageBoxesPt(spec)
  const [, , W, H] = boxes.media

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

  function drawImage(page, element, pageIndex) {
    const embedded = images.get(element.ref.url)?.image
    if (!embedded) {
      issues.push({
        id: `photo-unavailable:${element.id}`, kind: 'photo-unavailable', severity: 'error', pageIndex, elementId: element.id,
        title: '사진을 찾을 수 없어요',
        detail: '기록이 지워졌거나 사진이 바뀌었어요. 이 사진을 지우거나 다른 사진으로 바꿔 주세요.',
      })
      return
    }
    // Clip to the element's rotated box, then draw the whole photo scaled so the crop fills it.
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => apply(elementMatrixPt(element, spec), x, y))
    page.pushOperators(pushGraphicsState(), moveTo(corners[0].x, corners[0].y), ...corners.slice(1).map(c => lineTo(c.x, c.y)), closePath(), clip(), endPath(),
      concatTransformationMatrix(...imageMatrixPt(element, spec)))
    page.drawImage(embedded, { x: 0, y: 0, width: 1, height: 1 })
    page.pushOperators(popGraphicsState())
  }

  function drawText(page, element, pageIndex) {
    const size = element.sizePt
    const wPt = element.wMm * PT_PER_MM
    const hPt = element.hMm * PT_PER_MM
    const own = fonts[element.font] ? element.font : FALLBACK_FONT
    // Each character is measured in the font that will draw it.
    const fontFor = char => (hasGlyph(own, char.codePointAt(0)) ? own : FALLBACK_FONT)
    const lines = breakLines(element.text, wPt, char => fonts[fontFor(char)].widthOfTextAtSize(char, size), 'char')
    const lineHeight = size * element.lineHeight
    const extra = lines.length * lineHeight - hPt
    if (extra > lineHeight * OVERFLOW_TOLERANCE) {
      const more = Math.max(1, Math.round(extra / lineHeight))
      issues.push({
        id: `text-overflow:${element.id}`, kind: 'text-overflow', severity: 'warn', pageIndex, elementId: element.id,
        title: '인쇄하면 글이 화면보다 길어요',
        detail: `실제 글꼴로 줄을 나누면 ${more}줄 더 길어져 상자 아래로 내려가요. 글 상자를 넓히거나 글을 조금 줄여 주세요.`,
      })
    }
    const { ascent, descent } = metrics[own]
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...multiply(elementMatrixPt(element, spec), [1 / wPt, 0, 0, 1 / hPt, 0, 0])))
    baselines(lines.length, size, element.lineHeight, ascent, descent).forEach((baseline, i) => {
      const runs = fontRuns(lines[i], own).filter(run => run.text)
      const widths = runs.map(run => fonts[run.font].widthOfTextAtSize(run.text, size))
      const total = widths.reduce((sum, width) => sum + width, 0)
      let x = element.align === 'center' ? (wPt - total) / 2 : element.align === 'right' ? wPt - total : 0
      runs.forEach((run, r) => {
        page.drawText(run.text, { x, y: hPt - baseline, size, font: fonts[run.font], color: hex(element.color) })
        x += widths[r]
      })
    })
    page.pushOperators(popGraphicsState())
  }

  for (const [pageIndex, bookPage] of draft.pages.entries()) {
    const page = pdf.addPage([W, H])
    page.setBleedBox(0, 0, W, H)
    page.setTrimBox(boxes.trim[0], boxes.trim[1], boxes.trim[2] - boxes.trim[0], boxes.trim[3] - boxes.trim[1])
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hex(bookPage.background.color) })
    drawPattern(page, bookPage.background)
    for (const element of bookPage.elements) {
      if (element.type === 'image') drawImage(page, element, pageIndex)
      else if (element.type === 'text') drawText(page, element, pageIndex)
    }
  }
  // pdf-lib yields to the event loop every 50 objects by default; for a book that turned
  // a fraction of a second into minutes (spike finding).
  const bytes = await pdf.save({ objectsPerTick: Infinity })

  const all = [...preflightBook(checked, spec), ...issues]
  const order = { error: 0, warn: 1, info: 2 }
  all.sort((a, b) => order[a.severity] - order[b.severity] || (a.pageIndex ?? -1) - (b.pageIndex ?? -1))
  return {
    pdf: bytes,
    issues: all,
    stats: {
      pages: draft.pages.length, images: images.size, ...imageStats, bytes: bytes.length,
      ms: Date.now() - started, fonts: Object.keys(fonts).map(id => getBookFont(id).label),
    },
  }
}

module.exports = { renderBook, fontkitAdapter }
