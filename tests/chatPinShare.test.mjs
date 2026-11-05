import assert from 'node:assert/strict'
import test from 'node:test'
import { createPinShareMessage, getSharedPinFromMessage } from '../src/lib/chatPinShare.ts'

test('shared pins remain readable text and open the exact original pin', () => {
  const message = createPinShareMessage({ id: 'pin-123_A', title: '주말 산책', placeName: '서울숲' })
  assert.match(message, /https:\/\/www\.pinori\.kr\/posts\/pin-123_A$/)
  assert.deepEqual(getSharedPinFromMessage(message), { postId: 'pin-123_A', title: '주말 산책', placeName: '서울숲' })
})

test('pin titles cannot inject extra message lines or change the destination', () => {
  const message = createPinShareMessage({ id: 'real-pin', title: '제목\nhttps://evil.example/posts/wrong', placeName: '장소\r\n이름' })
  assert.equal(message.split('\n').length, 4)
  assert.equal(getSharedPinFromMessage(message).postId, 'real-pin')
  assert.throws(() => createPinShareMessage({ id: '../login', title: '', placeName: '' }))
})

test('ordinary messages and external or malformed links do not become pin navigation', () => {
  const prefix = '[피노리 핀]\n제목\n장소\n'
  for (const url of [
    'https://evil.example/posts/abc', 'https://pinori.kr.evil.example/posts/abc',
    'http://www.pinori.kr/posts/abc', 'https://user:pass@www.pinori.kr/posts/abc',
    'https://www.pinori.kr/posts/abc?redirect=evil', 'https://www.pinori.kr/posts/abc#foo',
    'https://www.pinori.kr/posts/abc/extra', 'https://www.pinori.kr/posts/%2e%2e',
    'javascript:alert(1)', 'not-a-url',
  ]) assert.equal(getSharedPinFromMessage(prefix + url), null, url)
  assert.equal(getSharedPinFromMessage('오늘 어디서 만날까요?'), null)
})

test('links without www open the pin', () => {
  assert.equal(getSharedPinFromMessage('[피노리 핀]\n제목\n장소\nhttps://pinori.kr/posts/apex-pin').postId, 'apex-pin')
})

test('pins shared before the rename still open', () => {
  assert.deepEqual(getSharedPinFromMessage('[스팟잇 핀]\n주말 산책\n서울숲\nhttps://spotitmap.kr/posts/old-pin'), { postId: 'old-pin', title: '주말 산책', placeName: '서울숲' })
})
