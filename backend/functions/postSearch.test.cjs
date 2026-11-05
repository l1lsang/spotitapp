const assert = require('node:assert/strict')
const test = require('node:test')
const { INDEXED_LENGTH, buildPostSearchTokens, postSearchWords } = require('./postSearchCore')

const post = { title: '햇살 좋은 산책', placeName: '서울숲', address: '서울 성동구 뚝섬로 273', content: 'Latte 한 잔', authorNickname: '김지민' }

test('queries and pins are split into the same normalised words', () => {
  assert.deepEqual(postSearchWords('  ＬＡＴＴＥ\n한  잔 '), ['latte', '한', '잔'])
  assert.deepEqual(postSearchWords(undefined), [])
})

test('tokens cover every one- and two-character piece of each word of every field', () => {
  const tokens = buildPostSearchTokens(post)
  for (const token of ['햇', '햇살', '산책', '서울', '울숲', '성동', '뚝섬', '27', '73', 'la', 'te', '한', '잔', '김지', '지민']) assert.ok(tokens.includes(token), token)
  // Pieces never span two words or two fields.
  for (const token of ['살 ', '살좋', '숲서', ' ']) assert.ok(!tokens.includes(token), token)
  assert.deepEqual(tokens, [...new Set(tokens)].sort())
})

test('only the opening of a long field is indexed', () => {
  const tokens = buildPostSearchTokens({ content: `${'가'.repeat(INDEXED_LENGTH.content)}나` })
  assert.deepEqual(tokens, ['가', '가가'])
  assert.deepEqual(buildPostSearchTokens({ title: 42, content: null }), [])
  assert.deepEqual(buildPostSearchTokens(undefined), [])
})
