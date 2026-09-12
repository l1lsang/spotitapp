export const MAX_COMMENT_MENTIONS = 5

export interface MentionToken { username: string; start: number; end: number }
export interface ActiveMention extends MentionToken { query: string }

// Keep email addresses and URL paths as ordinary text. Handles match the profile username format.
const mentionPattern = /(^|[^\p{L}\p{N}_@./:+-])@([a-z0-9._]{1,30})(?![a-z0-9._@])/giu

export function getMentionTokens(content: string): MentionToken[] {
  return Array.from(content.matchAll(mentionPattern), match => {
    const start = match.index + match[1].length
    return { username: match[2].toLowerCase(), start, end: start + match[2].length + 1 }
  })
}

export function getMentionUsernames(content: string): string[] {
  return [...new Set(getMentionTokens(content).map(token => token.username))]
}

export function getActiveMention(content: string, cursor: number): ActiveMention | null {
  const before = content.slice(0, cursor)
  const match = /(^|[^\p{L}\p{N}_@./:+-])@([a-z0-9._]{0,30})$/iu.exec(before)
  if (!match) return null
  const start = match.index + match[1].length
  const rest = /^[a-z0-9._]*/i.exec(content.slice(cursor))?.[0] || ''
  if (match[2].length + rest.length > 30) return null
  return { username: match[2].toLowerCase(), query: match[2].toLowerCase(), start, end: cursor + rest.length }
}

export function insertMention(content: string, active: ActiveMention, username: string) {
  const suffix = content.slice(active.end)
  const existingSpace = /^\s/.test(suffix)
  const insert = `@${username}${existingSpace ? '' : ' '}`
  return { content: content.slice(0, active.start) + insert + suffix, cursor: active.start + insert.length + (existingSpace ? 1 : 0) }
}
