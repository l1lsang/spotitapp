const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const { SERVER_NOTIFY, buildChatNotifications } = require('./chatNotificationsCore')

const db = admin.firestore()
const ALREADY_EXISTS = 6
const STALE_AFTER_MS = 15 * 60 * 1000

async function blockersOf(authorUid, recipientUids) {
  const blocked = new Set()
  for (let index = 0; index < recipientUids.length; index += 300) {
    const refs = recipientUids.slice(index, index + 300).map(uid => db.doc(`users/${uid}/blocks/${authorUid}`))
    if (!refs.length) continue
    const snapshots = await db.getAll(...refs)
    snapshots.forEach((snapshot, offset) => { if (snapshot.exists) blocked.add(recipientUids[index + offset]) })
  }
  return blocked
}

// Rooms of any size: notifications go out through a BulkWriter rather than the sender's
// 500-write batch. Notification ids are fixed per message, so a retry never duplicates one.
exports.notifyChatMessage = onDocumentCreated({
  region: 'us-central1', maxInstances: 20, timeoutSeconds: 120, retry: true,
  document: 'chats/{chatId}/messages/{messageId}',
}, async event => {
  const message = event.data?.data()
  if (!message || message.notify !== SERVER_NOTIFY) return
  if (Date.now() - Date.parse(event.time) > STALE_AFTER_MS) {
    logger.warn('stale chat notification skipped', { chatId: event.params.chatId, messageId: event.params.messageId })
    return
  }
  const { chatId, messageId } = event.params
  const chat = (await db.doc(`chats/${chatId}`).get()).data()
  if (!chat || !Array.isArray(chat.participantIds) || !chat.participantIds.includes(message.uid)) return
  const recipients = chat.participantIds.filter(uid => uid !== message.uid)
  const [author, blockedBy] = await Promise.all([
    db.doc(`users/${message.uid}`).get(),
    blockersOf(message.uid, recipients),
  ])
  const notifications = buildChatNotifications({
    chatId, messageId, message, chat, blockedBy, actorPhotoURL: author.data()?.photoURL || '',
  })
  if (!notifications.length) return

  const writer = db.bulkWriter()
  let failed = 0
  writer.onWriteError(error => {
    if (error.code === ALREADY_EXISTS) return false
    if (error.failedAttempts < 3) return true
    failed += 1
    return false
  })
  notifications.forEach(item => {
    writer.create(db.doc(`users/${item.recipientUid}/notifications/${item.id}`), { ...item.data, createdAt: FieldValue.serverTimestamp() })
      .catch(() => {})
  })
  await writer.close()
  if (failed) throw new Error(`${failed} chat notifications failed`)
  logger.info('chat notifications sent', { chatId, messageId, count: notifications.length, blocked: blockedBy.size })
})
