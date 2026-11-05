const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const { isStaleEvent } = require('./countersCore')
const { buildUserSearchTokens, sameTokens } = require('./userSearchCore')

const db = admin.firestore()
const options = { region: 'us-central1', maxInstances: 10, retry: true }

// Every signed-in member can read profiles, so the sign-in email never stays on
// one; Firebase Authentication keeps it. The search index is written only here.
exports.syncUserProfile = onDocumentWritten({ ...options, document: 'users/{uid}' }, async event => {
  if (isStaleEvent(event.time, Date.now(), 24 * 60 * 60_000)) return
  const after = event.data?.after
  if (!after?.exists) {
    if (event.data?.before?.exists) await removeAccountFiles(event.params.uid)
    return
  }
  const user = after.data()
  const tokens = buildUserSearchTokens(user)
  const patch = {}
  if (!sameTokens(user.searchTokens, tokens)) patch.searchTokens = tokens
  if ('email' in user) patch.email = FieldValue.delete()
  if (!Object.keys(patch).length) return
  try {
    await after.ref.update(patch, { lastUpdateTime: after.updateTime })
  } catch (error) {
    // Deleted or changed again since this event: that write's own run applies.
    if (error.code !== 5 && error.code !== 9) throw error
  }
})

// Account deletion removes the documents from the app; uploaded files are removed here.
async function removeAccountFiles(uid) {
  const bucket = admin.storage().bucket()
  const chats = await db.collection('chats').where('participantIds', 'array-contains', uid).get()
  const prefixes = [`profiles/${uid}/`, `posts/${uid}/`, ...chats.docs.map(chat => `chats/${chat.id}/${uid}/`)]
  await Promise.all(prefixes.map(prefix => bucket.deleteFiles({ prefix })))
}
