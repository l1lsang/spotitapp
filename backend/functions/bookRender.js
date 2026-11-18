// renderBookPdf: makes the interior print PDF for the latest saved revision of a book.
// Output stays in private Storage (books/{uid}/{bookId}/render/{revision}/), which the
// storage rules keep closed to clients; bookRenders/{bookId} carries the status and
// the server's print check for the author to read.
const { readFile } = require('node:fs/promises')
const { randomUUID } = require('node:crypto')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const { runRenderJob, claimDecision, RenderError } = require('./bookRenderJob')
const { storagePathFromUrl } = require('./storagePaths')

const FONT_FILES = {
  pretendard: 'Pretendard-Regular.otf',
  'gowun-batang': 'GowunBatang-Regular.ttf',
  'nanum-pen': 'NanumPenScript-Regular.ttf',
}
let fontBytes = null
const loadFonts = async () => {
  fontBytes ??= Object.fromEntries(await Promise.all(Object.entries(FONT_FILES).map(async ([id, file]) => [id, await readFile(require.resolve(`./fonts/${file}`))])))
  return fontBytes
}

function firebaseDeps() {
  const db = admin.firestore()
  const bucket = admin.storage().bucket()
  const statusRef = bookId => db.collection('bookRenders').doc(bookId)
  return {
    getBook: async bookId => {
      const snapshot = await db.collection('books').doc(bookId).get()
      return snapshot.exists ? snapshot.data() : null
    },
    getPages: async bookId => (await db.collection('books').doc(bookId).collection('pages').get()).docs.map(doc => ({ id: doc.id, data: doc.data() })),
    getPosts: async postIds => {
      const posts = new Map()
      for (let i = 0; i < postIds.length; i += 100) {
        const refs = postIds.slice(i, i + 100).map(id => db.collection('posts').doc(id))
        if (!refs.length) continue
        for (const snapshot of await db.getAll(...refs)) if (snapshot.exists) posts.set(snapshot.id, snapshot.data())
      }
      return posts
    },
    storagePathFromUrl: url => storagePathFromUrl(url, bucket.name),
    download: async objectPath => {
      try {
        const [bytes] = await bucket.file(objectPath).download()
        return bytes
      } catch (error) {
        if (error && error.code === 404) return null
        throw error
      }
    },
    fonts: loadFonts,
    save: (objectPath, bytes, contentType) => bucket.file(objectPath).save(bytes, { contentType, resumable: false, metadata: { cacheControl: 'private, max-age=0' } }),
    deleteExcept: async (prefix, keep) => {
      const [files] = await bucket.getFiles({ prefix })
      await Promise.all(files.filter(file => !file.name.startsWith(keep)).map(file => file.delete({ ignoreNotFound: true })))
    },
    // One transaction decides who renders, so two taps never draw the same book twice.
    claim: ({ bookId, uid, revision, staleMs }) => db.runTransaction(async transaction => {
      const snapshot = await transaction.get(statusRef(bookId))
      const decision = claimDecision(snapshot.exists ? snapshot.data() : null, { uid, revision, staleMs, now: Date.now(), token: randomUUID() })
      if (decision.kind === 'claimed') transaction.set(statusRef(bookId), { ...decision.next, summary: null, error: null, updatedAt: FieldValue.serverTimestamp() })
      return decision
    }),
    // A newer request may have taken over; only the request that still holds the token writes.
    finish: ({ bookId, token, summary }) => db.runTransaction(async transaction => {
      const snapshot = await transaction.get(statusRef(bookId))
      if (snapshot.exists && snapshot.get('token') === token) transaction.update(statusRef(bookId), { status: 'done', summary, updatedAt: FieldValue.serverTimestamp() })
    }),
    fail: ({ bookId, token, revision, message }) => db.runTransaction(async transaction => {
      const snapshot = await transaction.get(statusRef(bookId))
      if (snapshot.exists && snapshot.get('token') === token) transaction.update(statusRef(bookId), { status: 'failed', error: '인쇄 파일을 만들지 못했어요.', updatedAt: FieldValue.serverTimestamp() })
      logger.error('book render failed', { bookId, revision, message })
    }),
  }
}

exports.renderBookPdf = onCall({
  region: 'us-central1',
  memory: '2GiB',
  timeoutSeconds: 540,
  concurrency: 1,
  maxInstances: 3,
}, async request => {
  const data = request.data || {}
  try {
    const result = await runRenderJob({ uid: request.auth && request.auth.uid, bookId: data.bookId, revision: data.revision }, firebaseDeps())
    if (result.status === 'done' && !result.cached) logger.info('book rendered', { bookId: data.bookId, revision: result.revision, pages: result.pageCount, bytes: result.bytes, ms: result.ms })
    return result
  } catch (error) {
    if (error instanceof RenderError) throw new HttpsError(error.code, error.message)
    throw error
  }
})
