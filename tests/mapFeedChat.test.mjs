import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as candidates from '../src/lib/chatCandidates.ts'
import * as feedPosts from '../src/lib/feedPosts.ts'
import * as mapHelpers from '../src/lib/mapHelpers.ts'

const post = id => ({ id, title: `기록 ${id}`, placeName: '장소', photoUrls: [] })

test('soft tile colours are stable per record and dates read in Korean', () => {
  assert.equal(feedPosts.getFeedTone({ id: 'same' }), feedPosts.getFeedTone({ id: 'same' }))
  assert.ok(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(id => feedPosts.getFeedTone({ id }))).size > 1)
  assert.equal(feedPosts.formatFeedDate('2026-10-14'), '2026년 10월 14일')
})

test('the detail feed continues from the tapped record for the same viewer only', () => {
  const posts = [post('1'), post('2'), post('3')]
  feedPosts.rememberFeedPosts('viewer', posts)
  assert.deepEqual(feedPosts.readFeedPostsFrom('viewer', '2').map(item => item.id), ['2', '3'])
  assert.equal(feedPosts.readFeedPostsFrom('viewer', 'missing'), null)
  assert.equal(feedPosts.readFeedPostsFrom('someone-else', '2'), null)
})

const users = [
  { uid: 'jimin', nickname: '지민', username: 'jimin.day', email: 'jimin@example.test', photoURL: '' },
  { uid: 'soo', nickname: '수현', username: 'soohyun', email: 'soo@example.test', photoURL: 'https://example.test/soo.webp' },
  { uid: 'legacy', nickname: '도윤', email: 'doyun@example.test', photoURL: '' },
]

test('candidate search matches nicknames and usernames with or without @, never emails', () => {
  assert.equal(candidates.filterChatCandidates(users, '  '), users)
  assert.deepEqual(candidates.filterChatCandidates(users, '지민').map(user => user.uid), ['jimin'])
  assert.deepEqual(candidates.filterChatCandidates(users, '@SOOHYUN').map(user => user.uid), ['soo'])
  assert.deepEqual(candidates.filterChatCandidates(users, 'example').map(user => user.uid), [])
})

test('only 1:1 rooms mark someone as already chatting', () => {
  const chats = [
    { id: 'a', participantIds: ['me', 'jimin'] },
    { id: 'b', kind: 'direct', participantIds: ['soo', 'me'] },
    { id: 'c', kind: 'group', participantIds: ['me', 'legacy', 'jimin'] },
  ]
  assert.deepEqual([...candidates.getDirectChatPartnerIds(chats, 'me')].sort(), ['jimin', 'soo'])
})

test('the map scope offers joined groups plus the one currently shown', () => {
  const groups = [{ id: 'my-group' }, { id: 'public-group' }]
  assert.deepEqual(mapHelpers.getMapScopeGroups(groups, ['my-group'], '').map(group => group.id), ['my-group'])
  assert.deepEqual(mapHelpers.getMapScopeGroups(groups, ['my-group'], 'public-group').map(group => group.id), ['my-group', 'public-group'])
})

test('place search highlights the query or its shared prefix and shows readable distances', () => {
  const { splitQueryMatch, formatDistance } = mapHelpers
  assert.deepEqual(splitQueryMatch('청계천 광통교', '청계천'), { before: '', match: '청계천', after: ' 광통교' })
  assert.deepEqual(splitQueryMatch('서울 청계천박물관', ' 청계천 '), { before: '서울 ', match: '청계천', after: '박물관' })
  assert.deepEqual(splitQueryMatch('청계광장', '청계천'), { before: '', match: '청계', after: '광장' })
  assert.deepEqual(splitQueryMatch('Cafe Onion', 'onion'), { before: 'Cafe ', match: 'Onion', after: '' })
  assert.deepEqual(splitQueryMatch('남산타워', '청계'), { before: '', match: '', after: '남산타워' })
  assert.deepEqual(splitQueryMatch('서울숲', ''), { before: '서울숲', match: '', after: '' })
  assert.equal(formatDistance(4), '10m')
  assert.equal(formatDistance(123), '120m')
  assert.equal(formatDistance(999), '1km')
  assert.equal(formatDistance(2600), '2.6km')
  assert.equal(formatDistance(2000), '2km')
  assert.equal(formatDistance(152_400), '152km')
  assert.equal(formatDistance(Number.NaN), '')
})
