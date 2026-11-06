const { logger } = require('firebase-functions')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const admin = require('firebase-admin')

admin.initializeApp()

Object.assign(exports, require('./moderation'))
Object.assign(exports, require('./nativePush'))
Object.assign(exports, require('./placeSearch'))
Object.assign(exports, require('./kakaoAuth'))
Object.assign(exports, require('./counters'))
Object.assign(exports, require('./postCleanup'))
Object.assign(exports, require('./userProfile'))
Object.assign(exports, require('./postSearch'))
Object.assign(exports, require('./groups'))
Object.assign(exports, require('./chatNotifications'))

const db = admin.firestore()
const messaging = admin.messaging()

function chunkArray(items, size) {
  const chunks = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function isInvalidTokenError(error) {
  return (
    error?.code === 'messaging/registration-token-not-registered' ||
    error?.code === 'messaging/invalid-registration-token'
  )
}

exports.sendPushForNotification = onDocumentCreated(
  'users/{recipientUid}/notifications/{notificationId}',
  async (event) => {
    const snapshot = event.data

    if (!snapshot) {
      return
    }

    const { recipientUid, notificationId } = event.params
    const notification = snapshot.data()
    const tokensSnapshot = await db.collection('users').doc(recipientUid).collection('fcmTokens').get()
    const tokenDocs = tokensSnapshot.docs
      .map((tokenDoc) => ({
        ref: tokenDoc.ref,
        token: tokenDoc.data().token,
      }))
      .filter((tokenDoc) => Boolean(tokenDoc.token))

    if (tokenDocs.length === 0) {
      return
    }

    const title = notification.title || '피노리'
    const body = notification.message || '새 알림이 도착했습니다.'
    const href = notification.href || '/notifications'
    const invalidTokenRefs = []

    await Promise.all(
      chunkArray(tokenDocs, 500).map(async (chunk) => {
        const response = await messaging.sendEachForMulticast({
          tokens: chunk.map((tokenDoc) => tokenDoc.token),
          data: {
            title,
            body,
            href,
            type: notification.type || 'notification',
            notificationId,
          },
          webpush: {
            headers: {
              TTL: '86400',
            },
          },
        })

        response.responses.forEach((sendResponse, index) => {
          if (!sendResponse.success && isInvalidTokenError(sendResponse.error)) {
            invalidTokenRefs.push(chunk[index].ref)
          }
        })
      }),
    )

    if (invalidTokenRefs.length > 0) {
      const batch = db.batch()

      invalidTokenRefs.forEach((tokenRef) => batch.delete(tokenRef))
      await batch.commit()
    }

    logger.info('Push notification sent', {
      recipientUid,
      notificationId,
      tokenCount: tokenDocs.length,
      invalidTokenCount: invalidTokenRefs.length,
    })
  },
)
