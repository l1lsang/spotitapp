function isExpoToken(token) {
  return typeof token === 'string' && token.length <= 300 && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token)
}

function buildExpoMessage(token, notification, notificationId) {
  const href = typeof notification.href === 'string' && notification.href.startsWith('/') && !notification.href.startsWith('//')
    ? notification.href.slice(0, 500) : '/notifications'
  return {
    to: token, title: String(notification.title || '스팟잇').slice(0, 100),
    body: String(notification.message || '새 알림이 도착했습니다.').slice(0, 350),
    sound: 'default', channelId: 'default', ttl: 86400,
    collapseId: notificationId, tag: notificationId,
    data: { href, type: String(notification.type || 'notification').slice(0, 40), notificationId },
  }
}

function retryDelay(attempts) { return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 60 * 60_000) }
function shouldRetry(error) { return !error.status || error.status === 429 || error.status >= 500 }

module.exports = { isExpoToken, buildExpoMessage, retryDelay, shouldRetry }
