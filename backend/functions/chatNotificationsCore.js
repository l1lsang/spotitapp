// Pure rules for chat message notifications, shared by the trigger and its tests.

const MAX_CHAT_MENTIONS = 5
const PREVIEW_LIMIT = 300
// Messages written by apps that fan out notifications on the server carry this marker.
// Older apps still write notifications themselves, so unmarked messages are left alone.
const SERVER_NOTIFY = 'server'

function messagePreview(message) {
  const text = typeof message.content === 'string' ? message.content.trim() : ''
  if (!text) return '사진을 보냈습니다.'
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}…` : text
}

// Same filter the app applies: group rooms only, current members only, label still in the text.
function cleanMentions(message, chat) {
  if (chat.kind !== 'group' || !message.mentions || typeof message.mentions !== 'object') return new Set()
  const content = typeof message.content === 'string' ? message.content : ''
  const participants = chat.participantIds || []
  const tagged = Object.entries(message.mentions)
    .filter(([label, uid]) => label.startsWith('@') && label.length > 1 && content.includes(label)
      && typeof uid === 'string' && uid !== message.uid && participants.includes(uid))
    .slice(0, MAX_CHAT_MENTIONS)
    .map(([, uid]) => uid)
  return new Set(tagged)
}

/**
 * One notification per other participant, skipping anyone who has blocked the author.
 * Returns [{ recipientUid, id, data }] without createdAt, which the caller stamps.
 */
function buildChatNotifications({ chatId, messageId, message, chat, actorPhotoURL = '', blockedBy = new Set() }) {
  if (!message || message.notify !== SERVER_NOTIFY || !chat) return []
  const author = message.uid
  const participants = Array.isArray(chat.participantIds) ? chat.participantIds : []
  if (typeof author !== 'string' || !participants.includes(author)) return []
  const preview = messagePreview(message)
  const nickname = typeof message.authorNickname === 'string' && message.authorNickname ? message.authorNickname : '멤버'
  const tagged = cleanMentions(message, chat)
  const id = `chat_${messageId}`
  return [...new Set(participants)]
    .filter(uid => typeof uid === 'string' && uid && uid !== author && !blockedBy.has(uid))
    .map(recipientUid => {
      const mentioned = tagged.has(recipientUid)
      return {
        recipientUid, id,
        data: {
          id, recipientUid, actorUid: author, actorNickname: nickname, actorPhotoURL,
          type: 'chat',
          title: mentioned ? '회원님을 태그했어요' : '새 채팅 메시지',
          message: mentioned ? `${nickname}님이 회원님을 태그했어요: ${preview}` : `${nickname}: ${preview}`,
          href: `/chats/${chatId}`, postId: '', chatId, commentId: '', replyId: '', readAt: null,
        },
      }
    })
}

module.exports = { SERVER_NOTIFY, MAX_CHAT_MENTIONS, messagePreview, cleanMentions, buildChatNotifications }
