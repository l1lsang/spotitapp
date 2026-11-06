const assert = require('node:assert/strict')
const test = require('node:test')
const { buildChatNotifications, cleanMentions, messagePreview } = require('./chatNotificationsCore')

const chat = { kind: 'group', participantIds: ['a', 'b', 'c', 'd'] }
const message = { uid: 'a', authorNickname: '하나', content: '안녕 @둘', notify: 'server', mentions: { '@둘': 'b' } }

test('every other participant gets one notification with a fixed id per message', () => {
  const list = buildChatNotifications({ chatId: 'room', messageId: 'm1', message, chat, actorPhotoURL: 'p.png' })
  assert.deepEqual(list.map(item => item.recipientUid), ['b', 'c', 'd'])
  assert.ok(list.every(item => item.id === 'chat_m1' && item.data.id === 'chat_m1'))
  const plain = list.find(item => item.recipientUid === 'c').data
  assert.equal(plain.title, '새 채팅 메시지')
  assert.equal(plain.message, '하나: 안녕 @둘')
  assert.equal(plain.href, '/chats/room')
  assert.equal(plain.actorUid, 'a')
  assert.equal(plain.actorPhotoURL, 'p.png')
  assert.equal(plain.readAt, null)
})

test('tagged members get the mention wording', () => {
  const tagged = buildChatNotifications({ chatId: 'room', messageId: 'm1', message, chat }).find(item => item.recipientUid === 'b').data
  assert.equal(tagged.title, '회원님을 태그했어요')
  assert.equal(tagged.message, '하나님이 회원님을 태그했어요: 안녕 @둘')
})

test('people who blocked the author are skipped', () => {
  const list = buildChatNotifications({ chatId: 'room', messageId: 'm1', message, chat, blockedBy: new Set(['c']) })
  assert.deepEqual(list.map(item => item.recipientUid), ['b', 'd'])
})

test('large rooms are not capped', () => {
  const participantIds = Array.from({ length: 1200 }, (_, index) => `u${index}`)
  const list = buildChatNotifications({ chatId: 'big', messageId: 'm', message: { ...message, uid: 'u0', mentions: {} }, chat: { kind: 'group', participantIds } })
  assert.equal(list.length, 1199)
})

test('unmarked messages from older apps, outsiders and missing rooms send nothing', () => {
  assert.deepEqual(buildChatNotifications({ chatId: 'room', messageId: 'm', message: { ...message, notify: undefined }, chat }), [])
  assert.deepEqual(buildChatNotifications({ chatId: 'room', messageId: 'm', message: { ...message, uid: 'x' }, chat }), [])
  assert.deepEqual(buildChatNotifications({ chatId: 'room', messageId: 'm', message, chat: null }), [])
})

test('mentions must be in the text, in the room and not the author; direct rooms have none', () => {
  const mentions = { '@둘': 'b', '@셋': 'c', '@나': 'a', '@밖': 'z', '@': 'd' }
  assert.deepEqual([...cleanMentions({ uid: 'a', content: '@둘 @나 @밖 @', mentions }, chat)], ['b'])
  assert.deepEqual([...cleanMentions({ uid: 'a', content: '@둘', mentions }, { ...chat, kind: 'direct' })], [])
})

test('photo messages and long text get a short preview', () => {
  assert.equal(messagePreview({ content: '  ' }), '사진을 보냈습니다.')
  assert.equal(messagePreview({ content: 'x'.repeat(400) }).length, 301)
})
