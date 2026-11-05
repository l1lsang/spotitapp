// A comment counts once unless it was deleted, plus every reply still attached to it.
function commentWeight(comment) {
  if (!comment) return 0
  const replies = Number.isInteger(comment.replyCount) && comment.replyCount > 0 ? comment.replyCount : 0
  return (comment.deleted === true ? 0 : 1) + replies
}

// The post's comment count from one aggregation over its comments.
function commentTotal({ total, deleted, replies }) {
  return Math.max(0, (total || 0) - (deleted || 0) + (replies || 0))
}

// Retried deliveries stop after an hour; a later write recounts anyway.
function isStaleEvent(time, now = Date.now(), maxAgeMs = 60 * 60_000) {
  const issuedAt = Date.parse(time)
  return Number.isFinite(issuedAt) && now - issuedAt > maxAgeMs
}

module.exports = { commentWeight, commentTotal, isStaleEvent }
