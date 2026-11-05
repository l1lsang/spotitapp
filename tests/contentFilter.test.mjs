import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertCleanContent, findBlockedTerm } from '../src/lib/contentFilter.ts'

test('severe profanity is caught, including spaced or dotted spellings', () => {
  for (const value of ['씨발', '씨 발 진짜', '시.발', 'ㅅㅂ', 'ㅅ ㅂ', '병1신', 'F u C k you', '개새끼야']) {
    assert.ok(findBlockedTerm(value), value)
  }
})

test('ordinary words that contain a blocked term pass', () => {
  for (const value of ['시발점에서 출발', '오늘 카페 정말 좋았어요', '보지 않고 지나쳤다', '아이가 자지 않아요', '']) {
    assert.equal(findBlockedTerm(value), null, value)
  }
})

test('any field of a pin can trigger the filter', () => {
  assert.throws(() => assertCleanContent('맛집', undefined, '병신 같은 곳'))
  assert.doesNotThrow(() => assertCleanContent('맛집', '분위기 좋음', '서울숲'))
})
