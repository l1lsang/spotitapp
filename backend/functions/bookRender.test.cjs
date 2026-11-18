const test = require('node:test')
const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const { readFileSync } = require('node:fs')
const { PDFDocument } = require('pdf-lib')
const sharp = require('sharp')
const { renderBook } = require('./bookRenderCore')
const { runRenderJob, claimDecision, photoPath, draftFrom, RenderError, STALE_RENDER_MS } = require('./bookRenderJob')
const { storagePathFromUrl } = require('./storagePaths')

const FONTS = {
  pretendard: readFileSync(require.resolve('./fonts/Pretendard-Regular.otf')),
  'gowun-batang': readFileSync(require.resolve('./fonts/GowunBatang-Regular.ttf')),
  'nanum-pen': readFileSync(require.resolve('./fonts/NanumPenScript-Regular.ttf')),
}
// 64x48 JPEG.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkqKr/AGj/AGf1o+0f7P61xf2Jjf5PxX+Z+if62ZT/AM/v/JZf/IkFFFFffH4wFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH//2Q==', 'base64')

const BUCKET = 'test-bucket'
const url = (uid, postId, file) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`posts/${uid}/${postId}/${file}`)}?alt=media&token=t`
const ref = (postId, file = 'a.jpg', uid = 'u1', photoIndex = 0) => ({ postId, photoIndex, url: url(uid, postId, file), pxWidth: 3000, pxHeight: 2250 })
const image = (id, imageRef, extra = {}) => ({ id, type: 'image', ref: imageRef, crop: { x: 0, y: 0, w: 1, h: 1 }, xMm: 74, yMm: 60, wMm: 132, hMm: 99, rotationDeg: 0, ...extra })
const textBox = (id, text, extra = {}) => ({ id, type: 'text', text, font: 'nanum-pen', sizePt: 12, color: '#161F1B', align: 'left', lineHeight: 1.5, xMm: 74, yMm: 150, wMm: 124, hMm: 30, rotationDeg: 0, ...extra })
const page = (id, elements, background = { color: '#F7F2E8' }) => ({ id, background, elements })

const draft = pages => ({ schemaVersion: 3, id: 'b1', title: '봄 산책', subtitle: '', specId: 'a5-soft', coverStyle: 'minimal', coverPhoto: null, sourcePostIds: [], updatedAt: '', pages })

test('the PDF has one page per book page, with A5 trim and 3mm bleed boxes', async () => {
  const pages = Array.from({ length: 4 }, (_, i) => page(`p${i}`, i === 0
    ? [image('i1', ref('post1'), { rotationDeg: 5 }), textBox('t1', '성북천을 따라 · 걸었다… 「봄」', { align: 'center' })]
    : [textBox(`t${i}`, '명조로 쓴 글', { font: 'gowun-batang' })], i === 1 ? { color: '#FFFFFF', pattern: 'grid' } : undefined))
  const { pdf, issues, stats } = await renderBook({ draft: draft(pages), fonts: FONTS, loadImage: async () => ({ bytes: JPEG, source: 'display' }) })
  const doc = await PDFDocument.load(pdf)
  assert.equal(doc.getPageCount(), 4)
  const first = doc.getPage(0)
  const mm = value => Math.round(value / (72 / 25.4) * 100) / 100
  assert.deepEqual([mm(first.getWidth()), mm(first.getHeight())], [154, 216])
  const trim = first.getTrimBox()
  assert.deepEqual([mm(trim.x), mm(trim.y), mm(trim.width), mm(trim.height)], [3, 3, 148, 210])
  assert.equal(stats.images, 1)
  assert.equal(doc.getTitle(), '봄 산책')
  // The 4 pages are under the printable minimum; the fallback characters are noted.
  assert.ok(issues.some(issue => issue.kind === 'page-count' && issue.severity === 'error'))
  assert.ok(issues.some(issue => issue.kind === 'glyph-fallback' && issue.severity === 'info'))
  assert.ok(!issues.some(issue => issue.kind === 'text-overflow'))
  // Fonts are embedded as subsets, so the file stays small even with the 8MB Gowun Batang.
  assert.ok(stats.bytes < 400 * 1024, `PDF is ${stats.bytes} bytes`)
})

test('text that needs more lines than its box holds is reported', async () => {
  const long = '가나다라마바사아자차카타파하'.repeat(12)
  const { issues } = await renderBook({ draft: draft([page('p0', [textBox('t1', long, { hMm: 8 })])]), fonts: FONTS, loadImage: async () => null })
  const overflow = issues.find(issue => issue.kind === 'text-overflow')
  assert.equal(overflow.severity, 'warn')
  assert.equal(overflow.elementId, 't1')
  assert.match(overflow.detail, /\d+줄 더 길어져/)
})

test('a photo that cannot be read blocks the order instead of printing a blank', async () => {
  const { issues, stats } = await renderBook({ draft: draft([page('p0', [image('i1', ref('post1'))])]), fonts: FONTS, loadImage: async () => ({ bytes: Buffer.from('not an image'), source: 'display' }) })
  assert.equal(stats.images, 1)
  const missing = issues.find(issue => issue.kind === 'photo-unavailable')
  assert.equal(missing.severity, 'error')
  assert.equal(missing.pageIndex, 0)
})

const solid = (width, height, extra = image => image) => extra(sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } } })).jpeg({ quality: 95 }).toBuffer()

test('print resolution is judged on the file actually printed, not the size the app recorded', async () => {
  // The app recorded a 4096px print copy, but only the 1600px display copy could be read.
  const claimed = { ...ref('post1'), pxWidth: 1600, pxHeight: 1200, printPxWidth: 4096, printPxHeight: 3072 }
  const fullWidth = image('i1', claimed, { wMm: 148, hMm: 111, xMm: 74, yMm: 105 })
  const zoomed = { ...fullWidth, crop: { x: 0, y: 0, w: 0.25, h: 0.25 } }
  const display = await solid(1600, 1200)
  const fromDisplay = await renderBook({ draft: draft([page('p0', [zoomed])]), fonts: FONTS, loadImage: async () => ({ bytes: display, source: 'display' }) })
  const low = fromDisplay.issues.find(issue => issue.kind === 'photo-resolution')
  assert.equal(low.severity, 'error')
  assert.match(low.detail, /약 69dpi/)
  assert.equal(fromDisplay.stats.printCopies, 0)
  // With the print copy the same placement is about 176dpi: a warning, not a block.
  const print = await solid(4096, 3072)
  const fromPrint = await renderBook({ draft: draft([page('p0', [zoomed])]), fonts: FONTS, loadImage: async () => ({ bytes: print, source: 'print' }) })
  assert.equal(fromPrint.issues.find(issue => issue.kind === 'photo-resolution').severity, 'warn')
  assert.equal(fromPrint.stats.printCopies, 1)
})

test('a large print copy is scaled down once to what its largest placement needs', async () => {
  const print = await solid(4096, 3072)
  // Placed twice: small, and across the page width. 148mm at 300dpi needs 1748px.
  const small = image('i1', ref('post1'), { wMm: 40, hMm: 30, xMm: 40, yMm: 40 })
  const wide = image('i2', ref('post1'), { wMm: 148, hMm: 111, xMm: 74, yMm: 150 })
  let reads = 0
  const { pdf, stats } = await renderBook({ draft: draft([page('p0', [small]), page('p1', [wide])]), fonts: FONTS, loadImage: async () => { reads++; return { bytes: print, source: 'print' } } })
  assert.equal(reads, 1)
  assert.equal(stats.resized, 1)
  assert.ok(stats.imageBytes < print.length)
  const doc = await PDFDocument.load(pdf)
  const xObjects = [...doc.context.enumerateIndirectObjects()].map(([, object]) => object).filter(object => object.dict?.get(doc.context.obj('Subtype'))?.toString() === '/Image')
  assert.equal(xObjects.length, 1)
  assert.equal(xObjects[0].dict.get(doc.context.obj('Width')).asNumber(), 1748)
})

test('photos are read only from the author’s own records, at the listed URL', () => {
  const posts = new Map([
    ['post1', { uid: 'u1', photoUrls: [url('u1', 'post1', 'a.jpg')] }],
    ['post2', { uid: 'u2', photoUrls: [url('u2', 'post2', 'a.jpg')] }],
  ])
  const pathOf = imageRef => photoPath(imageRef, 'u1', posts, value => storagePathFromUrl(value, BUCKET))
  assert.equal(pathOf(ref('post1')), 'posts/u1/post1/a.jpg')
  // Someone else's record, a photo the record no longer lists, a deleted record.
  assert.equal(pathOf(ref('post2', 'a.jpg', 'u2')), '')
  assert.equal(pathOf(ref('post1', 'b.jpg')), '')
  assert.equal(pathOf({ ...ref('post1'), photoIndex: 1 }), '')
  assert.equal(pathOf(ref('gone')), '')
  // A record that lists a file outside its own folder, or another host.
  const crafted = new Map([['post1', { uid: 'u1', photoUrls: [url('u2', 'post9', 'a.jpg')] }]])
  assert.equal(photoPath({ ...ref('post1'), url: url('u2', 'post9', 'a.jpg') }, 'u1', crafted, value => storagePathFromUrl(value, BUCKET)), '')
  const elsewhere = 'https://example.com/v0/b/other/o/posts%2Fu1%2Fpost1%2Fa.jpg'
  const listed = new Map([['post1', { uid: 'u1', photoUrls: [elsewhere] }]])
  assert.equal(photoPath({ ...ref('post1'), url: elsewhere }, 'u1', listed, value => storagePathFromUrl(value, BUCKET)), '')
})

test('the draft is rebuilt in page order, with missing pages blank', () => {
  const book = { schemaVersion: 3, uid: 'u1', title: '책', subtitle: '', specId: 'a5-soft', coverStyle: 'minimal', coverPhoto: null, sourcePostIds: [], pageIds: ['b', 'a', 'c'] }
  const rebuilt = draftFrom('b1', book, [{ id: 'a', data: { background: { color: '#FFFFFF' }, elements: [] } }, { id: 'b', data: { background: { color: '#000000' }, elements: [] } }])
  assert.deepEqual(rebuilt.pages.map(p => [p.id, p.background.color]), [['b', '#000000'], ['a', '#FFFFFF'], ['c', '#F7F2E8']])
})

test('a render request starts once, is joined while running and reused when done', () => {
  const base = { uid: 'u1', revision: 4, staleMs: STALE_RENDER_MS, now: 1_000_000, token: 'new' }
  assert.equal(claimDecision(null, base).kind, 'claimed')
  assert.equal(claimDecision({ revision: 4, status: 'rendering', startedAtMs: base.now - 1000 }, base).kind, 'busy')
  assert.equal(claimDecision({ revision: 4, status: 'rendering', startedAtMs: base.now - STALE_RENDER_MS - 1 }, base).kind, 'claimed')
  assert.deepEqual(claimDecision({ revision: 4, status: 'done', summary: { pageCount: 2 } }, base), { kind: 'done', summary: { pageCount: 2 } })
  assert.equal(claimDecision({ revision: 3, status: 'done', summary: {} }, base).kind, 'claimed')
  assert.equal(claimDecision({ revision: 4, status: 'failed' }, base).kind, 'claimed')
  assert.deepEqual(claimDecision(null, base).next, { uid: 'u1', revision: 4, status: 'rendering', token: 'new', startedAtMs: base.now })
})

function fakeDeps({ book, pages = [], posts = {}, files = {}, status = null } = {}) {
  const calls = { saved: {}, deleted: [], downloads: [], finished: null, failed: null }
  const deps = {
    getBook: async () => book,
    getPages: async () => pages,
    getPosts: async ids => new Map(ids.filter(id => posts[id]).map(id => [id, posts[id]])),
    storagePathFromUrl: value => storagePathFromUrl(value, BUCKET),
    download: async objectPath => { calls.downloads.push(objectPath); return files[objectPath] || null },
    fonts: async () => FONTS,
    save: async (objectPath, bytes) => { calls.saved[objectPath] = bytes },
    deleteExcept: async (prefix, keep) => { calls.deleted.push([prefix, keep]) },
    claim: async options => claimDecision(status, { ...options, now: Date.now(), token: 'tok' }),
    finish: async value => { calls.finished = value },
    fail: async value => { calls.failed = value },
  }
  return { deps, calls }
}

const storedBook = (extra = {}) => ({ schemaVersion: 3, uid: 'u1', status: 'draft', revision: 7, title: '책', subtitle: '', specId: 'a5-soft', coverStyle: 'minimal', coverPhoto: null, sourcePostIds: ['post1'], pageIds: ['p0', 'p1'], ...extra })

test('a render job checks the caller, draws the latest revision and stores it privately', async () => {
  const { deps, calls } = fakeDeps({
    book: storedBook(),
    pages: [
      { id: 'p0', data: { background: { color: '#FFFFFF' }, elements: [image('i1', ref('post1')), image('i2', ref('post2', 'a.jpg', 'u2'))] } },
      { id: 'p1', data: { background: { color: '#FFFFFF' }, elements: [textBox('t1', '안녕')] } },
    ],
    posts: { post1: { uid: 'u1', photoUrls: [url('u1', 'post1', 'a.jpg')] }, post2: { uid: 'u2', photoUrls: [url('u2', 'post2', 'a.jpg')] } },
    files: { 'posts/u1/post1/a.jpg': JPEG, 'posts/u2/post2/a.jpg': JPEG, 'posts/u2/post2/print/a.jpg': JPEG },
  })
  const result = await runRenderJob({ uid: 'u1', bookId: 'b1', revision: 7 }, deps)
  assert.equal(result.status, 'done')
  assert.equal(result.pageCount, 2)
  assert.equal(result.readiness, 'blocked')
  assert.equal(result.pdfPath, 'books/u1/b1/render/7/interior.pdf')
  // Another user's photo is never downloaded, and is reported instead.
  // The print copy is tried first and the display copy used when there is none.
  assert.deepEqual(calls.downloads, ['posts/u1/post1/print/a.jpg', 'posts/u1/post1/a.jpg'])
  assert.deepEqual(result.photos, { total: 2, printCopies: 0, resized: 0 })
  assert.ok(result.issues.some(issue => issue.kind === 'photo-unavailable' && issue.elementId === 'i2'))
  assert.deepEqual(Object.keys(calls.saved).sort(), ['books/u1/b1/render/7/interior.pdf', 'books/u1/b1/render/7/preflight.json'])
  assert.deepEqual(calls.deleted, [['books/u1/b1/render/', 'books/u1/b1/render/7/']])
  assert.equal(calls.finished.token, 'tok')
  assert.equal((await PDFDocument.load(calls.saved['books/u1/b1/render/7/interior.pdf'])).getPageCount(), 2)
})

test('a render job prints from the private print copy when the record has one', async () => {
  const print = await solid(4096, 3072)
  const { deps, calls } = fakeDeps({
    book: storedBook({ pageIds: ['p0'] }),
    pages: [{ id: 'p0', data: { background: { color: '#FFFFFF' }, elements: [image('i1', ref('post1'), { wMm: 148, hMm: 111, xMm: 74, yMm: 105 })] } }],
    posts: { post1: { uid: 'u1', photoUrls: [url('u1', 'post1', 'a.jpg')] } },
    files: { 'posts/u1/post1/print/a.jpg': print, 'posts/u1/post1/a.jpg': JPEG },
  })
  const result = await runRenderJob({ uid: 'u1', bookId: 'b1', revision: 7 }, deps)
  assert.deepEqual(calls.downloads, ['posts/u1/post1/print/a.jpg'])
  assert.deepEqual(result.photos, { total: 1, printCopies: 1, resized: 1 })
  assert.ok(!result.issues.some(issue => issue.kind === 'photo-resolution'))
})

test('a render job refuses strangers, stale revisions and bad input', async () => {
  const run = (input, book = storedBook()) => runRenderJob({ uid: 'u1', bookId: 'b1', revision: 7, ...input }, fakeDeps({ book }).deps)
  const code = async promise => { try { await promise; return 'ok' } catch (error) { assert.ok(error instanceof RenderError); return error.code } }
  assert.equal(await code(run({ uid: null })), 'unauthenticated')
  assert.equal(await code(run({ bookId: '../b1' })), 'invalid-argument')
  assert.equal(await code(run({ revision: 1.5 })), 'invalid-argument')
  assert.equal(await code(run({}, null)), 'not-found')
  assert.equal(await code(run({}, storedBook({ uid: 'u2' }))), 'not-found')
  assert.equal(await code(run({}, storedBook({ status: 'ordered' }))), 'failed-precondition')
  assert.equal(await code(run({ revision: 6 })), 'failed-precondition')
})

test('a finished render of the same revision is returned without drawing again', async () => {
  const { deps, calls } = fakeDeps({ book: storedBook(), status: { revision: 7, status: 'done', summary: { revision: 7, pageCount: 2 } } })
  assert.deepEqual(await runRenderJob({ uid: 'u1', bookId: 'b1', revision: 7 }, deps), { status: 'done', revision: 7, pageCount: 2, cached: true })
  assert.deepEqual(calls.saved, {})
})

test('a failed render is recorded and reported without internal details', async () => {
  const { deps, calls } = fakeDeps({ book: storedBook(), pages: [] })
  deps.save = async () => { throw new Error('bucket exploded: secret-path') }
  await assert.rejects(runRenderJob({ uid: 'u1', bookId: 'b1', revision: 7 }, deps), error => error.code === 'internal' && !error.message.includes('secret'))
  assert.equal(calls.failed.token, 'tok')
})
