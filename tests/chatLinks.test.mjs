import assert from 'node:assert/strict'
import test from 'node:test'
import { getLinkSegments, normalizeChatLink } from '../src/lib/chatLinks.ts'

test('marks web addresses inside a message as links', () => {
  assert.deepEqual(getLinkSegments('여기 봐 https://pinori.kr/posts/abc 좋아'), [
    { text: '여기 봐 ' },
    { text: 'https://pinori.kr/posts/abc', url: 'https://pinori.kr/posts/abc' },
    { text: ' 좋아' },
  ])
})

test('www addresses open over https', () => {
  assert.deepEqual(getLinkSegments('www.naver.com'), [{ text: 'www.naver.com', url: 'https://www.naver.com/' }])
})

test('Korean text and sentence punctuation after a link stay outside it', () => {
  assert.deepEqual(getLinkSegments('https://a.kr/x입니다.'), [{ text: 'https://a.kr/x', url: 'https://a.kr/x' }, { text: '입니다.' }])
  assert.deepEqual(getLinkSegments('(https://a.kr/x)'), [{ text: '(' }, { text: 'https://a.kr/x', url: 'https://a.kr/x' }, { text: ')' }])
  assert.deepEqual(getLinkSegments('https://ko.wikipedia.org/wiki/A_(B)'), [{ text: 'https://ko.wikipedia.org/wiki/A_(B)', url: 'https://ko.wikipedia.org/wiki/A_(B)' }])
})

test('plain text and unsafe schemes are never links', () => {
  assert.deepEqual(getLinkSegments('그냥 문장'), [{ text: '그냥 문장' }])
  assert.deepEqual(getLinkSegments('javascript:alert(1)'), [{ text: 'javascript:alert(1)' }])
  assert.deepEqual(getLinkSegments('xhttps://a.kr'), [{ text: 'xhttps://a.kr' }])
  assert.equal(normalizeChatLink('https://localhost'), null)
})
