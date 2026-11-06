import assert from 'node:assert/strict'
import test from 'node:test'
import { collectChatMentions, filterMentionCandidates, getActiveChatMention, getChatTextSegments, insertChatMention } from '../src/lib/chatMentions.ts'

const people = [
  { uid: 'me', nickname: '나', photoURL: '' },
  { uid: 'a', nickname: '민지', photoURL: '' },
  { uid: 'b', nickname: '피노리 사용자', photoURL: '' },
  { uid: 'c', nickname: 'Mina', photoURL: '' },
]

test('detects the tag being typed only at a word start', () => {
  assert.deepEqual(getActiveChatMention('안녕 @민', 6), { query: '민', start: 3, end: 6 })
  assert.deepEqual(getActiveChatMention('@', 1), { query: '', start: 0, end: 1 })
  assert.equal(getActiveChatMention('mail@test', 9), null)
  assert.equal(getActiveChatMention('@민지 안녕', 7), null)
})

test('suggests other participants, prefix matches first', () => {
  assert.deepEqual(filterMentionCandidates(people, '', 'me').map(p => p.uid), ['a', 'b', 'c'])
  assert.deepEqual(filterMentionCandidates(people, 'mi', 'me').map(p => p.uid), ['c'])
  assert.deepEqual(filterMentionCandidates(people, '사용', 'me').map(p => p.uid), ['b'])
})

test('inserts a nickname with spaces and a trailing space', () => {
  const active = getActiveChatMention('hi @피노', 6)
  assert.deepEqual(insertChatMention('hi @피노', active, '피노리 사용자'), { content: 'hi @피노리 사용자 ', cursor: 12 })
})

test('stores only tags still present and belonging to the room', () => {
  const picked = { '@민지': 'a', '@Mina': 'c', '@떠난사람': 'gone' }
  assert.deepEqual(collectChatMentions('@민지 @떠난사람 밥 먹자', picked, ['me', 'a', 'c']), { '@민지': 'a' })
})

test('renders tagged names as linked segments, longest label first', () => {
  const segments = getChatTextSegments('@피노리 사용자 님 @피노리 안녕 email@피노리', { '@피노리': 'x', '@피노리 사용자': 'b' })
  assert.deepEqual(segments, [
    { text: '@피노리 사용자', uid: 'b' }, { text: ' 님 ' }, { text: '@피노리', uid: 'x' }, { text: ' 안녕 email@피노리' },
  ])
  assert.deepEqual(getChatTextSegments('그냥 텍스트', undefined), [{ text: '그냥 텍스트' }])
})
