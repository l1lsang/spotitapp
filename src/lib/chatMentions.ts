import type { ChatParticipant } from '../types/chat'

// Group-chat tags use the participant's nickname (which may contain Korean and spaces),
// chosen from the room's member list. Each sent message stores "@nickname" → uid so the
// tag keeps pointing at the same person even if they later change their nickname.
export const MAX_CHAT_MENTIONS = 10

export interface ActiveChatMention { query: string; start: number; end: number }
export interface ChatTextSegment { text: string; uid?: string }

/** The "@query" being typed at the cursor, if any. */
export function getActiveChatMention(content: string, cursor: number): ActiveChatMention | null {
  const before = content.slice(0, cursor)
  const match = /(^|\s)@([^\s@]{0,24})$/u.exec(before)
  if (!match) return null
  const start = match.index + match[1].length
  const rest = /^[^\s@]*/u.exec(content.slice(cursor))?.[0] || ''
  return { query: match[2], start, end: cursor + rest.length }
}

export function filterMentionCandidates(participants: ChatParticipant[], query: string, selfUid: string): ChatParticipant[] {
  const needle = query.trim().toLowerCase()
  return participants
    .filter(person => person.uid !== selfUid && person.nickname.trim())
    .filter(person => !needle || person.nickname.toLowerCase().includes(needle))
    .sort((a, b) => Number(!a.nickname.toLowerCase().startsWith(needle)) - Number(!b.nickname.toLowerCase().startsWith(needle)) || a.nickname.localeCompare(b.nickname, 'ko'))
    .slice(0, 8)
}

export function insertChatMention(content: string, active: ActiveChatMention, nickname: string) {
  const suffix = content.slice(active.end)
  const insert = `@${nickname.trim()} `
  const next = content.slice(0, active.start) + insert + suffix.replace(/^\s/, '')
  return { content: next, cursor: active.start + insert.length }
}

/** Keeps only picked tags that are still in the text and still belong to the room. */
export function collectChatMentions(content: string, picked: Record<string, string>, participantIds: string[]): Record<string, string> {
  const mentions: Record<string, string> = {}
  for (const [label, uid] of Object.entries(picked)) {
    if (!label.startsWith('@') || label.length < 2 || !participantIds.includes(uid)) continue
    if (content.includes(label)) mentions[label] = uid
  }
  if (Object.keys(mentions).length > MAX_CHAT_MENTIONS) throw new Error(`한 메시지에 최대 ${MAX_CHAT_MENTIONS}명까지 태그할 수 있습니다.`)
  return mentions
}

/** Splits message text so tagged names can be styled and opened. Longer labels win overlaps. */
export function getChatTextSegments(content: string, mentions: Record<string, string> | undefined): ChatTextSegment[] {
  const labels = Object.keys(mentions || {}).filter(label => label.length > 1).sort((a, b) => b.length - a.length)
  if (!labels.length) return [{ text: content }]
  const segments: ChatTextSegment[] = []
  let index = 0
  let plain = ''
  while (index < content.length) {
    const label = content[index] === '@' && (index === 0 || /\s/.test(content[index - 1])) ? labels.find(item => content.startsWith(item, index)) : undefined
    if (label) {
      if (plain) { segments.push({ text: plain }); plain = '' }
      segments.push({ text: label, uid: mentions![label] })
      index += label.length
    } else { plain += content[index]; index += 1 }
  }
  if (plain) segments.push({ text: plain })
  return segments
}
