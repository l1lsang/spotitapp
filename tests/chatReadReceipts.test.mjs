import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Timestamp } from 'firebase/firestore'
import { getMessageReaders } from '../src/lib/chatReadReceipts.ts'

const timestamp = milliseconds => Timestamp.fromMillis(milliseconds)
const participant = uid => ({ uid, nickname: uid, photoURL: '' })
const message = { id: 'message', chatId: 'group', uid: 'sender', createdAt: timestamp(2000) }
const chat = {
  participantIds: ['sender', 'early', 'equal', 'later', 'unread'],
  participants: Object.fromEntries(['sender', 'early', 'equal', 'later', 'unread'].map(uid => [uid, participant(uid)])),
  readAtBy: { sender: timestamp(3000), early: timestamp(1999), equal: timestamp(2000), later: timestamp(3000) },
}

test('lists every recipient who read this message, including the exact timestamp boundary, and excludes the sender', () => {
  assert.deepEqual(getMessageReaders(message, chat).map(reader => reader.uid), ['equal', 'later'])
})

test('does not show receipts before a message timestamp or read timestamp has been saved', () => {
  assert.deepEqual(getMessageReaders({ ...message, createdAt: undefined }, chat), [])
  assert.deepEqual(getMessageReaders(message, { ...chat, readAtBy: undefined }), [])
  assert.deepEqual(getMessageReaders(message, { ...chat, readAtBy: { equal: null } }), [])
})

test('ignores former participants and preserves readers whose profile has not loaded', () => {
  assert.deepEqual(getMessageReaders(message, {
    participantIds: ['sender', 'missing'],
    participants: { sender: participant('sender') },
    readAtBy: { missing: timestamp(2000), former: timestamp(3000) },
  }), [{ uid: 'missing', nickname: '참여자', photoURL: '' }])
})

test('readers update as people read newer messages without changing earlier results', () => {
  const before = getMessageReaders(message, chat)
  const updated = { ...chat, readAtBy: { ...chat.readAtBy, unread: timestamp(4000) } }
  assert.deepEqual(getMessageReaders(message, updated).map(reader => reader.uid), ['equal', 'later', 'unread'])
  assert.deepEqual(getMessageReaders({ ...message, createdAt: timestamp(3500) }, updated).map(reader => reader.uid), ['unread'])
  assert.deepEqual(before.map(reader => reader.uid), ['equal', 'later'])
})
