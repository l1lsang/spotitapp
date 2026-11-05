import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as search from '../src/lib/feedSearch.ts'
import server from '../backend/functions/postSearchCore.js'

const at = millis => ({ toMillis: () => millis })
const posts = [
  { id: 'walk', title: '햇살 좋은 산책', placeName: '서울숲', address: '서울 성동구 뚝섬로 273', content: 'Latte 한 잔', authorNickname: '김지민', createdAt: at(3) },
  { id: 'cafe', title: '카페 라떼', placeName: '성수 카페거리', address: '서울 성동구 성수동2가', content: '창가 자리', authorNickname: 'Jiho', createdAt: at(2) },
  { id: 'jeju', title: '바다', placeName: '협재 해변', address: '제주 한림읍', content: '', authorNickname: '수현', createdAt: at(1) },
]

test('the app splits queries exactly like the server-built index', () => {
  for (const value of ['  ＬＡＴＴＥ\n한  잔 ', '서울숲', '', '　전각 공백']) {
    assert.deepEqual(search.getFeedSearchTerms(value), server.postSearchWords(value))
  }
})

test('the probe of any word piece found in a pin is one of that pin\'s tokens', () => {
  for (const post of posts) {
    const tokens = server.buildPostSearchTokens(post)
    for (const field of ['title', 'placeName', 'address', 'content', 'authorNickname']) {
      for (const word of server.postSearchWords(post[field])) {
        const chars = Array.from(word)
        for (let start = 0; start < chars.length; start++) {
          for (let end = start + 1; end <= chars.length; end++) {
            const term = chars.slice(start, end).join('')
            assert.ok(tokens.includes(search.getFeedSearchProbe([term])), `${post.id}: ${term}`)
          }
        }
      }
    }
  }
})

test('the probe comes from the longest query word', () => {
  assert.equal(search.getFeedSearchProbe(['잔', '서울숲']), '서울')
  assert.equal(search.getFeedSearchProbe(['a']), 'a')
  assert.equal(search.getFeedSearchProbe([]), '')
})

test('results keep pins containing every word, loaded and found ones once, newest first', () => {
  assert.deepEqual(search.filterFeedPosts(posts, '성동 카페').map(post => post.id), ['cafe'])
  assert.deepEqual(search.filterFeedPosts(posts, 'latte').map(post => post.id), ['walk'])
  assert.deepEqual(search.filterFeedPosts(posts, '  ').map(post => post.id), ['walk', 'cafe', 'jeju'])
  const merged = search.mergeFeedSearchResults([posts[1]], [posts[2], posts[0], posts[1]])
  assert.deepEqual(merged.map(post => post.id), ['walk', 'cafe', 'jeju'])
})
