import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as search from '../src/lib/userSearch.ts'
import server from '../backend/functions/userSearchCore.js'

const users = [
  { uid: 'jimin', nickname: '김지민', username: 'jimin.day' },
  { uid: 'jiho', nickname: '지호', username: 'jiho' },
  { uid: 'soo', nickname: '수현', username: 'soohyun' },
  { uid: 'legacy', nickname: 'Jimin' },
]

test('the app normalises queries exactly like the server-built index', () => {
  for (const value of ['  @Jimin.Day ', 'ＡＢＣ', '김지민', '', undefined]) {
    assert.equal(search.normalizeUserSearch(value), server.normalizeUserSearch(value))
  }
})

test('the probe of any query found in a name is one of that name\'s tokens', () => {
  for (const user of users) {
    const tokens = server.buildUserSearchTokens(user)
    for (const name of [user.nickname, user.username].filter(Boolean)) {
      const chars = Array.from(server.normalizeUserSearch(name))
      for (let start = 0; start < chars.length; start++) {
        for (let end = start + 1; end <= chars.length; end++) {
          const term = chars.slice(start, end).join('')
          assert.ok(tokens.includes(search.getUserSearchProbe(term)), `${name}: ${term}`)
        }
      }
    }
  }
})

test('results keep whole-query matches only, exact and leading matches first', () => {
  assert.deepEqual(search.rankUserSearchResults(users, 'jimin').map(user => user.uid), ['legacy', 'jimin'])
  assert.deepEqual(search.rankUserSearchResults(users, '지').map(user => user.uid), ['jiho', 'jimin'])
  assert.deepEqual(search.rankUserSearchResults(users, '지민').map(user => user.uid), ['jimin'])
  assert.deepEqual(search.rankUserSearchResults(users, 'example').map(user => user.uid), [])
})
