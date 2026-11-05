import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getChatReactionSummaries } from '../src/lib/chatReactions.ts'

test('legacy messages and messages with all reactions removed have no reaction badges', () => {
  assert.deepEqual(getChatReactionSummaries(undefined, 'viewer'), [])
  assert.deepEqual(getChatReactionSummaries({}, 'viewer'), [])
})

test('reaction badges aggregate participants and identify the viewer in the standard emoji order', () => {
  assert.deepEqual(getChatReactionSummaries({ first: '🙏', viewer: '❤️', second: '👍', third: '❤️' }, 'viewer'), [
    { emoji: '👍', label: '좋아요', count: 1, selected: false },
    { emoji: '❤️', label: '하트', count: 2, selected: true },
    { emoji: '🙏', label: '고마워요', count: 1, selected: false },
  ])
})

test('switching a reaction moves the viewer highlight and removes the empty badge', () => {
  const previous = { viewer: '😮', friend: '😂' }
  const before = getChatReactionSummaries(previous, 'viewer')
  const after = getChatReactionSummaries({ ...previous, viewer: '😂' }, 'viewer')
  assert.deepEqual(after, [{ emoji: '😂', label: '웃겨요', count: 2, selected: true }])
  assert.deepEqual(before, [
    { emoji: '😂', label: '웃겨요', count: 1, selected: false },
    { emoji: '😮', label: '놀라워요', count: 1, selected: true },
  ])
  assert.equal(previous.viewer, '😮')
})

test('unsupported stored values do not render badges or select someone else’s reaction', () => {
  assert.deepEqual(getChatReactionSummaries({ first: '🔥', second: '😢', third: null }, 'viewer'), [
    { emoji: '😢', label: '슬퍼요', count: 1, selected: false },
  ])
})
