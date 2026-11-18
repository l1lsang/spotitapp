// Approach B: lay the book out as HTML/CSS and print it with Chromium (local Chrome here;
// @sparticuz/chromium on Cloud Functions). Then adds TrimBox/BleedBox with pdf-lib,
// because Chromium's PDFs only carry a MediaBox.
//   node --import ../../tests/register-types.mjs render-chromium.mjs [char|keep-all]
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'
import { PDFDocument, ParseSpeeds } from 'pdf-lib'
import { pageBoxesPt } from '../../src/lib/book/pdfCoords.ts'
import { getBookSpec } from '../../src/lib/book/specs.ts'
import { PATTERN_STEP_MM } from '../../src/lib/book/styles.ts'

const mode = process.argv[2] === 'keep-all' ? 'keep-all' : 'char'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const FONT_FILES = {
  'gowun-batang': 'C:/Users/jkm08/AppData/Local/Temp/fonts/GowunBatang-Regular.ttf',
  'nanum-pen': new URL('../../assets/fonts/book/NanumPenScript-Regular.ttf', import.meta.url),
  pretendard: new URL('../../assets/fonts/Pretendard-Regular.otf', import.meta.url),
}
const fileUrl = file => (file instanceof URL ? file.href : pathToFileURL(file).href)
const esc = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const draft = JSON.parse(readFileSync(new URL('./out/sample-book.json', import.meta.url), 'utf8'))
const spec = getBookSpec(draft.specId)
const b = spec.bleedMm
const W = spec.trimMm.w + b * 2
const H = spec.trimMm.h + b * 2

function pattern(background) {
  if (!background.pattern) return ''
  const step = PATTERN_STEP_MM[background.pattern]
  const lines = []
  const positions = length => {
    const values = []
    for (let mm = -Math.floor(b / step) * step; mm <= length + b; mm += step) if (mm > -b) values.push(mm + b)
    return values
  }
  for (const y of positions(spec.trimMm.h)) lines.push(`<line x1="0" x2="${W}" y1="${y}" y2="${y}"/>`)
  if (background.pattern === 'grid') for (const x of positions(spec.trimMm.w)) lines.push(`<line y1="0" y2="${H}" x1="${x}" x2="${x}"/>`)
  return `<svg class="pattern" viewBox="0 0 ${W} ${H}" stroke="#C5CEC0" stroke-width="0.15">${lines.join('')}</svg>`
}

function element(el) {
  const box = `left:${el.xMm - el.wMm / 2 + b}mm;top:${el.yMm - el.hMm / 2 + b}mm;width:${el.wMm}mm;height:${el.hMm}mm;transform:rotate(${el.rotationDeg}deg)`
  if (el.type === 'image') {
    const { x, y, w, h } = el.crop
    const iw = el.wMm / w
    const ih = el.hMm / h
    return `<div class="el" style="${box};overflow:hidden"><img src="${el.ref.url}" style="position:absolute;left:${-x * iw}mm;top:${-y * ih}mm;width:${iw}mm;height:${ih}mm"></div>`
  }
  // Height is not fixed: the text sets it, as in the app; overflow is measured below.
  return `<div class="el text" data-id="${el.id}" data-lh="${el.sizePt * el.lineHeight}" style="${box.replace(/height:[^;]+;/, '')};font-family:'${el.font}';font-size:${el.sizePt}pt;line-height:${el.lineHeight};color:${el.color};text-align:${el.align}">${esc(el.text)}</div>`
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${Object.entries(FONT_FILES).map(([id, file]) => `@font-face{font-family:'${id}';src:url('${fileUrl(file)}')}`).join('\n')}
@page{size:${W}mm ${H}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;width:${W}mm;height:${H}mm;overflow:hidden;break-after:page}
.pattern{position:absolute;left:0;top:0;width:100%;height:100%}
.el{position:absolute;transform-origin:center}
.text{white-space:pre-wrap;overflow-wrap:anywhere}
body.keep-all .text{word-break:keep-all}
</style></head><body class="${mode === 'keep-all' ? 'keep-all' : ''}">
${draft.pages.map(page => `<section class="page" style="background:${page.background.color}">${pattern(page.background)}${page.elements.map(element).join('')}</section>`).join('\n')}
</body></html>`

const work = mkdtempSync(join(tmpdir(), 'book-pdf-spike-'))
const htmlFile = join(work, 'book.html')
writeFileSync(htmlFile, html)

// Chrome is many processes; sum the working sets of the ones using this profile.
const profile = join(work, 'profile')
let peak = 0
const poll = () => {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      `(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${work.split('\\').pop()}*' } | Measure-Object WorkingSetSize -Sum).Sum`], { encoding: 'utf8' })
    peak = Math.max(peak, Number(out.trim()) || 0)
  } catch { /* process list changed mid-query */ }
}

const started = performance.now()
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--allow-file-access-from-files'] })
const timer = setInterval(poll, 1000)
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load', timeout: 0 })
  await page.evaluate(() => document.fonts.ready)
  // Lines each text takes with both break rules, to compare with pdf-lib and the app's estimate.
  const lines = await page.evaluate(() => {
    const count = () => [...document.querySelectorAll('.text')].map(el => Math.round(el.offsetHeight / (parseFloat(el.dataset.lh) * 96 / 72)))
    const keepAll = document.body.classList.contains('keep-all')
    document.body.classList.remove('keep-all')
    const char = count()
    document.body.classList.add('keep-all')
    const kept = count()
    if (!keepAll) document.body.classList.remove('keep-all')
    return [...document.querySelectorAll('.text')].map((el, i) => ({ id: el.dataset.id, char: char[i], keepAll: kept[i] }))
  })
  writeFileSync(new URL('./out/lines-chromium.json', import.meta.url), JSON.stringify(lines))
  const laidOut = performance.now()
  const printed = await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 0 })
  poll()
  const pdfDone = performance.now()
  // Chromium writes only a MediaBox; printers need TrimBox and BleedBox.
  writeFileSync(new URL(`./out/chromium-${mode}-raw.pdf`, import.meta.url), printed)
  const doc = await PDFDocument.load(printed, { updateMetadata: false, parseSpeed: ParseSpeeds.Fastest })
  const loaded = performance.now()
  const boxes = pageBoxesPt(spec)
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize()
    p.setBleedBox(0, 0, width, height)
    p.setTrimBox(boxes.trim[0], boxes.trim[1], boxes.trim[2] - boxes.trim[0], boxes.trim[3] - boxes.trim[1])
  }
  // pdf-lib yields to the event loop between small batches by default; that alone took
  // 3 minutes here (38 s load + 142 s save). Without yielding it is a fraction of a second.
  const bytes = await doc.save({ objectsPerTick: Infinity })
  const name = `out/chromium-${mode}.pdf`
  writeFileSync(new URL(`./${name}`, import.meta.url), bytes)
  console.log(JSON.stringify({
    renderer: 'chromium', mode, pages: doc.getPageCount(), chrome: await browser.version(),
    layoutSeconds: +((laidOut - started) / 1000).toFixed(1), printSeconds: +((pdfDone - laidOut) / 1000).toFixed(1),
    boxLoadSeconds: +((loaded - pdfDone) / 1000).toFixed(1), boxSeconds: +((performance.now() - pdfDone) / 1000).toFixed(1), seconds: +((performance.now() - started) / 1000).toFixed(1),
    chromePeakMB: Math.round(peak / 2 ** 20), nodeRssMB: Math.round(process.memoryUsage().rss / 2 ** 20),
    printedMB: +(printed.length / 2 ** 20).toFixed(1), sizeMB: +(bytes.length / 2 ** 20).toFixed(1), file: name,
  }))
} finally {
  clearInterval(timer)
  await browser.close()
  rmSync(work, { recursive: true, force: true })
}
