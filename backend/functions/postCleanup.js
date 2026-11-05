const { onDocumentDeleted, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const admin = require('firebase-admin')
const { isStaleEvent } = require('./countersCore')
const { removedPostPhotoPaths } = require('./storagePaths')

const db = admin.firestore()
const options = { region: 'us-central1', maxInstances: 10, retry: true }

// Download URLs keep working after a pin is deleted unless the file itself is
// removed, so deleting a pin also deletes its photos and the comments, replies
// and likes stored under it.
exports.cleanupDeletedPost = onDocumentDeleted({ ...options, document: 'posts/{postId}', timeoutSeconds: 300 }, async event => {
  if (isStaleEvent(event.time, Date.now(), 24 * 60 * 60_000)) return
  const { postId } = event.params
  // An operator hiding a pin moves it to moderationPosts so it can be restored;
  // its photos, comments and likes must survive until that review ends.
  if ((await db.doc(`moderationPosts/${postId}`).get()).exists) return
  await db.recursiveDelete(db.doc(`posts/${postId}`))
  const uid = event.data?.data()?.uid
  if (typeof uid === 'string' && uid && !uid.includes('/')) {
    await admin.storage().bucket().deleteFiles({ prefix: `posts/${uid}/${postId}/` })
  }
})

// Photos taken out of a pin while editing it.
exports.cleanupRemovedPostPhotos = onDocumentUpdated({ ...options, document: 'posts/{postId}' }, async event => {
  if (isStaleEvent(event.time, Date.now(), 24 * 60 * 60_000)) return
  const bucket = admin.storage().bucket()
  const paths = removedPostPhotoPaths(event.data?.before.data(), event.data?.after.data(), event.params.postId, bucket.name)
  await Promise.all(paths.map(path => bucket.file(path).delete({ ignoreNotFound: true })))
})
