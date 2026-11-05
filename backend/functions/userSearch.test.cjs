const assert = require('node:assert/strict')
const test = require('node:test')
const { buildUserSearchTokens, normalizeUserSearch, sameTokens } = require('./userSearchCore')

test('queries and names are normalised the same way, without a leading @', () => {
  assert.equal(normalizeUserSearch('  @Jimin.Day '), 'jimin.day')
  assert.equal(normalizeUserSearch('ＡＢＣ'), 'abc')
  assert.equal(normalizeUserSearch(undefined), '')
})

test('tokens cover every one- and two-character piece of nickname and username', () => {
  const tokens = buildUserSearchTokens({ nickname: '김지민', username: 'jimin' })
  for (const token of ['김', '지', '민', '김지', '지민', 'j', 'ji', 'im', 'mi', 'in']) assert.ok(tokens.includes(token), token)
  assert.ok(!tokens.includes('김민'))
  assert.deepEqual(tokens, [...new Set(tokens)].sort())
  assert.deepEqual(buildUserSearchTokens({ nickname: 'A' }), ['a'])
})

test('unfinished signups and missing profiles are not searchable', () => {
  assert.deepEqual(buildUserSearchTokens({ nickname: '가입 중', onboardingComplete: false }), [])
  assert.deepEqual(buildUserSearchTokens(undefined), [])
  assert.ok(buildUserSearchTokens({ nickname: '기존 웹 회원' }).length > 0)
})

test('token comparison detects any change', () => {
  assert.equal(sameTokens(['a', 'b'], ['a', 'b']), true)
  assert.equal(sameTokens(['a'], ['a', 'b']), false)
  assert.equal(sameTokens(undefined, []), false)
})
