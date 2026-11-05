const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const admin = require('firebase-admin')
const { AggregateField } = require('firebase-admin/firestore')
const { commentTotal, commentWeight, isStaleEvent } = require('./countersCore')

const db = admin.firestore()
const options = { region: 'us-central1', maxInstances: 10, retry: true }
const exists = snapshot => Boolean(snapshot?.exists)

// Counts are recounted from the stored documents instead of incremented. Repeated
// event delivery, older app versions that still write counts, and earlier drift
// therefore all converge on the real number. Clients can no longer write counts.
exports.countPostLikes = onDocumentWritten({ ...options, document: 'posts/{postId}/likes/{likeId}' }, async event => {
  if (isStaleEvent(event.time) || exists(event.data?.before) === exists(event.data?.after)) return
  const postRef = db.doc(`posts/${event.params.postId}`)
  await db.runTransaction(async transaction => {
    const post = await transaction.get(postRef)
    if (!post.exists) return
    const { count } = (await transaction.get(postRef.collection('likes').count())).data()
    if (post.data().likeCount !== count) transaction.update(postRef, { likeCount: count })
  })
})

exports.countCommentReplies = onDocumentWritten({ ...options, document: 'posts/{postId}/comments/{commentId}/replies/{replyId}' }, async event => {
  if (isStaleEvent(event.time) || exists(event.data?.before) === exists(event.data?.after)) return
  const { postId, commentId } = event.params
  await syncCommentReplies(db.doc(`posts/${postId}/comments/${commentId}`))
})

// Reply count changes reach the post through this trigger, since they update the comment.
exports.countPostComments = onDocumentWritten({ ...options, document: 'posts/{postId}/comments/{commentId}' }, async event => {
  if (isStaleEvent(event.time)) return
  const after = event.data?.after
  if (exists(after) && after.data().deleted === true) await syncCommentReplies(after.ref)
  if (commentWeight(event.data?.before?.data()) === commentWeight(after?.data())) return
  const postRef = db.doc(`posts/${event.params.postId}`)
  const comments = postRef.collection('comments')
  await db.runTransaction(async transaction => {
    const post = await transaction.get(postRef)
    if (!post.exists) return
    const totals = (await transaction.get(comments.aggregate({ total: AggregateField.count(), replies: AggregateField.sum('replyCount') }))).data()
    const deleted = (await transaction.get(comments.where('deleted', '==', true).count())).data().count
    const count = commentTotal({ total: totals.total, deleted, replies: totals.replies })
    if (post.data().commentCount !== count) transaction.update(postRef, { commentCount: count })
  })
})

// Clients only mark a comment deleted. It is removed here once no reply hangs under it,
// which new replies cannot change: the rules reject replies to a deleted comment.
async function syncCommentReplies(commentRef) {
  await db.runTransaction(async transaction => {
    const comment = await transaction.get(commentRef)
    if (!comment.exists) return
    const { count } = (await transaction.get(commentRef.collection('replies').count())).data()
    if (comment.data().deleted === true && count === 0) transaction.delete(commentRef)
    else if (comment.data().replyCount !== count) transaction.update(commentRef, { replyCount: count })
  })
}
