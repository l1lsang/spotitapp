import type { DaymarkChat } from '../types/chat'
import type { DaymarkUser } from '../types/user'

// Matches nicknames, and usernames with or without the leading @. Emails are never searched.
export function filterChatCandidates(users: DaymarkUser[], keyword: string): DaymarkUser[] {
  const search = keyword.trim().toLowerCase()
  if (!search) return users
  const handle = search.replace(/^@/, '')
  return users.filter((user) => user.nickname.toLowerCase().includes(search)
    || Boolean(user.username?.toLowerCase().includes(handle)))
}

// People the viewer already has a 1:1 room with, so the picker can say so.
export function getDirectChatPartnerIds(chats: DaymarkChat[], viewerUid: string): Set<string> {
  return new Set(chats
    .filter((chat) => chat.kind !== 'group')
    .flatMap((chat) => chat.participantIds.filter((uid) => uid !== viewerUid)))
}
