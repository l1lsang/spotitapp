import type { ChatMessage, ChatParticipant, DaymarkChat } from '../types/chat'

export function getMessageReaders(message: ChatMessage, chat: DaymarkChat): ChatParticipant[] {
  if (!message.createdAt) {
    return []
  }

  const messageTime = message.createdAt.toMillis()

  return chat.participantIds.flatMap((uid) => {
    const readAt = chat.readAtBy?.[uid]

    if (uid === message.uid || !readAt || readAt.toMillis() < messageTime) {
      return []
    }

    return [chat.participants[uid] || { uid, nickname: '참여자', photoURL: '' }]
  })
}
