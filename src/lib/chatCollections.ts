import type { ChatMessage } from '../types/chat'

export function getPinnedChatMessages(messages: ChatMessage[], pinnedIds: string[] = []): ChatMessage[] {
  const byId = new Map(messages.filter(message => message.uid !== 'deleted-user').map(message => [message.id, message]))
  return [...new Set(pinnedIds)].reverse().flatMap(id => {
    const message = byId.get(id)
    return message ? [message] : []
  })
}

export function getChatMedia(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(message => Boolean(message.photoUrl) && message.uid !== 'deleted-user').slice().reverse()
}
