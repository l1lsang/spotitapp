// Copies the Book Studio rules the server needs from src/lib/book into Cloud Functions as
// CommonJS, so the print renderer checks and draws a book exactly as the app does.
//   node scripts/build-book-shared.mjs           write backend/functions/bookShared/
//   node scripts/build-book-shared.mjs --check   fail if it is out of date
// Functions deploy only backend/functions, so the files are generated and committed.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = new URL('..', import.meta.url)
export const SOURCE = 'src/lib/book/'
export const OUTPUT = 'backend/functions/bookShared/'
export const MODULES = ['specs', 'geometry', 'styles', 'glyphCoverage', 'glyphs', 'textLayout', 'pdfCoords', 'preflight', 'draft']

const HEADER = (name) => `// Generated from ${SOURCE}${name}.ts by scripts/build-book-shared.mjs. Do not edit:\n// change the source, then run \`node scripts/build-book-shared.mjs\`.\n`

/** File name to content, for every shared module. */
export function renderShared() {
  const files = new Map()
  for (const name of MODULES) {
    // Line endings differ between checkouts (autocrlf); the output must not.
    const source = readFileSync(new URL(`${SOURCE}${name}.ts`, root), 'utf8').replace(/\r\n/g, '\n')
    const { outputText, diagnostics } = ts.transpileModule(source, {
      fileName: `${name}.ts`,
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, removeComments: false, newLine: ts.NewLineKind.LineFeed },
    })
    if (diagnostics?.length) throw new Error(`${name}.ts: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n')}`)
    // Only type imports may leave the shared set; they vanish when transpiled.
    for (const [, target] of outputText.matchAll(/require\("([^"]+)"\)/g)) {
      if (!target.startsWith('./') || !MODULES.includes(target.slice(2))) throw new Error(`${name}.ts requires ${target}, which is not shared with Functions`)
    }
    files.set(`${name}.js`, HEADER(name) + outputText)
  }
  return files
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = new URL(OUTPUT, root)
  const files = renderShared()
  if (process.argv.includes('--check')) {
    const stale = [...files].filter(([name, text]) => !existsSync(new URL(name, dir)) || readFileSync(new URL(name, dir), 'utf8').replace(/\r\n/g, '\n') !== text)
    const extra = existsSync(dir) ? readdirSync(dir).filter(name => !files.has(name)) : []
    if (stale.length || extra.length) {
      console.error(`${OUTPUT} is out of date (${[...stale.map(([name]) => name), ...extra].join(', ')}): run node scripts/build-book-shared.mjs`)
      process.exit(1)
    }
    console.log(`${OUTPUT} is up to date`)
  } else {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    for (const [name, text] of files) writeFileSync(new URL(name, dir), text)
    console.log(`wrote ${files.size} files to ${OUTPUT}`)
  }
}
