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

test('shared groups open the group and carry a private group invite code', async () => {
  const { createGroupShareMessage, getSharedGroupFromMessage } = await import('../src/lib/chatPinShare.ts')
  const open = createGroupShareMessage({ id: 'g-1', name: '책방 모임', visibility: 'public' })
  assert.deepEqual(getSharedGroupFromMessage(open), { groupId: 'g-1', name: '책방 모임', detail: '공개 그룹', inviteCode: '' })
  const closed = createGroupShareMessage({ id: 'g-2', name: '이름\n줄바꿈', visibility: 'private' }, 'ABCD-EFGH-2345')
  assert.equal(closed.split('\n').length, 4)
  assert.equal(getSharedGroupFromMessage(closed).inviteCode, 'ABCDEFGH2345')
  assert.throws(() => createGroupShareMessage({ id: 'g-3', name: 'x', visibility: 'private' }))
  assert.equal(getSharedGroupFromMessage('[피노리 그룹]\n이름\n공개 그룹\nhttps://evil.example/groups/g-1'), null)
  assert.equal(getSharedGroupFromMessage('[피노리 그룹]\n이름\n공개 그룹\nhttps://www.pinori.kr/posts/g-1'), null)
})
