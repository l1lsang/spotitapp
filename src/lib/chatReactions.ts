import type { ChatMessage, ChatReactionEmoji } from '../types/chat'

export const CHAT_REACTION_OPTIONS = [
  { emoji: '👍', label: '좋아요' },
  { emoji: '❤️', label: '하트' },
  { emoji: '😂', label: '웃겨요' },
  { emoji: '😮', label: '놀라워요' },
  { emoji: '😢', label: '슬퍼요' },
  { emoji: '🙏', label: '고마워요' },
] as const satisfies readonly { emoji: ChatReactionEmoji; label: string }[]

export interface ChatReactionSummary {
  emoji: ChatReactionEmoji
  label: string
  count: number
  selected: boolean
}

export function getChatReactionSummaries(
  reactionsBy: ChatMessage['reactionsBy'],
  viewerUid: string,
): ChatReactionSummary[] {
  const reactions = Object.values(reactionsBy || {})

  return CHAT_REACTION_OPTIONS.flatMap(({ emoji, label }) => {
    const count = reactions.filter((reaction) => reaction === emoji).length

    return count ? [{ emoji, label, count, selected: reactionsBy?.[viewerUid] === emoji }] : []
  })
}
