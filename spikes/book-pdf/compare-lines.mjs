// Compares how many lines each text box takes: pdf-lib (our breaking) vs Chromium (the
// browser's), in both break modes, and against the box height the app's layout estimated.
//   node compare-lines.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const read = name => JSON.parse(readFileSync(new URL(`./out/${name}`, import.meta.url), 'utf8'))
const chromium = new Map(read('lines-chromium.json').map(item => [item.id, item]))
const report = {}
for (const mode of ['char', 'keep-all']) {
  const ours = read(`lines-pdflib-${mode}.json`)
  let same = 0
  let more = 0
  let fewer = 0
  let overEstimate = 0
  const differences = []
  for (const item of ours) {
    const browser = chromium.get(item.id)?.[mode === 'char' ? 'char' : 'keepAll']
    if (browser === undefined) continue
    if (item.lines === browser) same++
    else if (item.lines > browser) more++
    else fewer++
    if (item.lines !== browser && differences.length < 8) differences.push({ id: item.id, pdflib: item.lines, chromium: browser })
    if (item.lines > item.boxLines) overEstimate++
  }
  report[mode] = { texts: ours.length, sameAsChromium: same, pdflibMore: more, pdflibFewer: fewer, longerThanAppEstimate: overEstimate, differences }
}
const all = read('lines-chromium.json')
report.keepAllAddsLines = all.filter(item => item.keepAll > item.char).length
report.keepAllExtraLines = all.reduce((sum, item) => sum + Math.max(0, item.keepAll - item.char), 0)
writeFileSync(new URL('./results/lines.json', import.meta.url), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
