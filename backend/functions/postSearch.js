const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { isStaleEvent } = require('./countersCore')
const { buildPostSearchTokens } = require('./postSearchCore')
const { sameTokens } = require('./userSearchCore')

const options = { region: 'us-central1', maxInstances: 10, retry: true }

// The feed search index of a pin is written only here.
exports.syncPostSearchTokens = onDocumentWritten({ ...options, document: 'posts/{postId}' }, async event => {
  if (isStaleEvent(event.time, Date.now(), 24 * 60 * 60_000)) return
  const after = event.data?.after
  if (!after?.exists) return
  const post = after.data()
  const tokens = buildPostSearchTokens(post)
  if (sameTokens(post.searchTokens, tokens)) return
  try {
    await after.ref.update({ searchTokens: tokens }, { lastUpdateTime: after.updateTime })
  } catch (error) {
    // Deleted or changed again since this event: that write's own run applies.
    if (error.code !== 5 && error.code !== 9) throw error
  }
})
