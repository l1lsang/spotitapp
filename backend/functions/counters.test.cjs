const assert = require('node:assert/strict')
const test = require('node:test')
const { commentTotal, commentWeight, isStaleEvent } = require('./countersCore')

test('a comment counts itself unless deleted, plus its attached replies', () => {
  assert.equal(commentWeight(undefined), 0)
  assert.equal(commentWeight({ replyCount: 0 }), 1)
  assert.equal(commentWeight({}), 1)
  assert.equal(commentWeight({ replyCount: 2 }), 3)
  assert.equal(commentWeight({ deleted: true, replyCount: 2 }), 2)
  assert.equal(commentWeight({ deleted: true, replyCount: 0 }), 0)
  // Malformed legacy values never inflate the count.
  assert.equal(commentWeight({ replyCount: -4 }), 1)
  assert.equal(commentWeight({ replyCount: '9' }), 1)
})

test('soft deletion and reply changes are recount triggers; unrelated edits are not', () => {
  const live = { replyCount: 1 }
  assert.notEqual(commentWeight(live), commentWeight({ ...live, deleted: true }))
  assert.notEqual(commentWeight(live), commentWeight({ ...live, replyCount: 2 }))
  assert.notEqual(commentWeight(live), commentWeight(undefined))
  assert.equal(commentWeight({ deleted: true, replyCount: 0 }), commentWeight(undefined))
})

test('the post total subtracts deleted comments and adds every reply', () => {
  assert.equal(commentTotal({ total: 5, deleted: 2, replies: 4 }), 7)
  assert.equal(commentTotal({ total: 0, deleted: 0, replies: 0 }), 0)
  assert.equal(commentTotal({ total: 1, deleted: 3, replies: 0 }), 0)
  assert.equal(commentTotal({ total: 2, deleted: 0, replies: null }), 2)
})

test('retries stop once an event is older than the allowed age', () => {
  const now = Date.parse('2026-10-22T12:00:00Z')
  assert.equal(isStaleEvent('2026-10-22T11:30:00Z', now), false)
  assert.equal(isStaleEvent('2026-10-22T10:59:00Z', now), true)
  assert.equal(isStaleEvent('2026-10-21T13:00:00Z', now, 24 * 60 * 60_000), false)
  assert.equal(isStaleEvent(undefined, now), false)
})
