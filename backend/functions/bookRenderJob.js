// One print render of a book revision: checks who asks, rebuilds the draft from its
// stored pages, reads only photos the author owns, draws the PDF and records the result.
// Firebase access comes in as `deps`, so every rule here is tested without emulators.
const { Buffer } = require('node:buffer')
const { readBookMeta, readImageRef, readPage, DEFAULT_BACKGROUND } = require('./bookShared/draft')
const { countBySeverity, orderReadiness } = require('./bookShared/preflight')
const { renderBook } = require('./bookRenderCore')

const BOOK_ID = /^[A-Za-z0-9_-]{1,64}$/
/** A render still marked as running after this long is treated as abandoned. */
const STALE_RENDER_MS = 12 * 60 * 1000
/** Issues kept on the status document; preflight.json in Storage keeps all of them. */
const MAX_STORED_ISSUES = 300

class RenderError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const renderPrefix = (uid, bookId) => `books/${uid}/${bookId}/render/`

/** The draft as the app saved it: book document plus its pages in `pageIds` order. */
function draftFrom(bookId, book, pages) {
  const meta = readBookMeta(book)
  if (!meta || !Array.isArray(book.pageIds)) throw new RenderError('failed-precondition', '책 정보를 읽지 못했어요.')
  const byId = new Map(pages.map(page => [page.id, readPage(page.data, page.id)]))
  return {
    schemaVersion: book.schemaVersion, id: bookId, ...meta, coverPhoto: readImageRef(book.coverPhoto), updatedAt: '',
    pages: book.pageIds.map(id => byId.get(id) || { id, background: { ...DEFAULT_BACKGROUND }, elements: [] }),
  }
}

/**
 * Where a placed photo may be read from, or '' when it must not be: the record must be
 * the author's own and still list this exact photo, and the file must sit in that
 * record's folder. The URL saved in the book is never fetched as given.
 */
function photoPath(ref, uid, posts, pathFromUrl) {
  const post = posts.get(ref.postId)
  if (!post || post.uid !== uid || !Array.isArray(post.photoUrls) || post.photoUrls[ref.photoIndex] !== ref.url) return ''
  const path = pathFromUrl(ref.url)
  return path && path.startsWith(`posts/${uid}/${ref.postId}/`) ? path : ''
}

function summaryOf(revision, pageCount, issues, extra) {
  return {
    revision, pageCount,
    counts: countBySeverity(issues),
    readiness: orderReadiness(issues),
    issues: issues.slice(0, MAX_STORED_ISSUES),
    issueTotal: issues.length,
    ...extra,
  }
}

/**
 * @returns {Promise<object>} `{ status: 'done', ...summary }` or `{ status: 'rendering', revision }`
 */
async function runRenderJob({ uid, bookId, revision }, deps) {
  if (!uid) throw new RenderError('unauthenticated', '로그인 후 이용해 주세요.')
  if (typeof bookId !== 'string' || !BOOK_ID.test(bookId) || !Number.isInteger(revision) || revision < 1) {
    throw new RenderError('invalid-argument', '책 정보를 확인해 주세요.')
  }
  const book = await deps.getBook(bookId)
  // Someone else's book reads exactly like a missing one.
  if (!book || book.uid !== uid) throw new RenderError('not-found', '책을 찾을 수 없어요.')
  if (book.status !== 'draft') throw new RenderError('failed-precondition', '인쇄 파일을 만들 수 없는 책이에요.')
  if (book.revision !== revision) throw new RenderError('failed-precondition', '책이 그사이 바뀌었어요. 저장이 끝난 뒤 다시 시도해 주세요.')

  const claim = await deps.claim({ bookId, uid, revision, staleMs: STALE_RENDER_MS })
  if (claim.kind === 'done') return { status: 'done', ...claim.summary, cached: true }
  if (claim.kind === 'busy') return { status: 'rendering', revision }

  try {
    const draft = draftFrom(bookId, book, await deps.getPages(bookId))
    const refs = draft.pages.flatMap(page => page.elements.filter(element => element.type === 'image').map(element => element.ref))
    const posts = await deps.getPosts([...new Set(refs.map(ref => ref.postId))])
    const { pdf, issues, stats } = await renderBook({
      draft,
      fonts: await deps.fonts(),
      loadImage: async ref => {
        const path = photoPath(ref, uid, posts, deps.storagePathFromUrl)
        return path ? deps.download(path) : null
      },
    })
    const prefix = renderPrefix(uid, bookId)
    const folder = `${prefix}${revision}/`
    await deps.save(`${folder}interior.pdf`, pdf, 'application/pdf')
    await deps.save(`${folder}preflight.json`, Buffer.from(JSON.stringify({ revision, issues, stats })), 'application/json')
    // Only the latest revision's files are kept while the book is a draft.
    await deps.deleteExcept(prefix, folder)
    const summary = summaryOf(revision, draft.pages.length, issues, { bytes: stats.bytes, ms: stats.ms, pdfPath: `${folder}interior.pdf` })
    await deps.finish({ bookId, token: claim.token, summary })
    return { status: 'done', ...summary }
  } catch (error) {
    await deps.fail({ bookId, token: claim.token, revision, message: String(error && error.message || error).slice(0, 300) }).catch(() => undefined)
    if (error instanceof RenderError) throw error
    throw new RenderError('internal', '인쇄 파일을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  }
}

/**
 * The status document's next state when a render is requested, or the reason not to
 * start one: a finished render of this revision is reused, a running one is joined.
 */
function claimDecision(current, { uid, revision, staleMs, now, token }) {
  if (current && current.revision === revision) {
    if (current.status === 'done') return { kind: 'done', summary: current.summary }
    if (current.status === 'rendering' && now - current.startedAtMs < staleMs) return { kind: 'busy' }
  }
  return { kind: 'claimed', token, next: { uid, revision, status: 'rendering', token, startedAtMs: now } }
}

module.exports = { runRenderJob, claimDecision, photoPath, draftFrom, RenderError, renderPrefix, STALE_RENDER_MS }
