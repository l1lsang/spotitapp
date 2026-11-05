import type { PinGroup } from '../types/group'

export interface QueryMatch {
  before: string
  match: string
  after: string
}

// Highlights the query inside a place name, or the shared prefix for near matches
// such as '청계광장' for '청계천'.
export function splitQueryMatch(text: string, query: string): QueryMatch {
  const trimmed = query.trim()
  if (!trimmed) return { before: text, match: '', after: '' }
  const index = text.toLocaleLowerCase().indexOf(trimmed.toLocaleLowerCase())
  if (index >= 0) {
    return { before: text.slice(0, index), match: text.slice(index, index + trimmed.length), after: text.slice(index + trimmed.length) }
  }
  let prefix = 0
  while (prefix < Math.min(text.length, trimmed.length)
    && text[prefix].toLocaleLowerCase() === trimmed[prefix].toLocaleLowerCase()) prefix += 1
  return { before: '', match: text.slice(0, prefix), after: text.slice(prefix) }
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return ''
  const rounded = Math.max(10, Math.round(meters / 10) * 10)
  if (rounded < 1000) return `${rounded}m`
  if (meters < 100_000) return `${Number((meters / 1000).toFixed(1))}km`
  return `${Math.round(meters / 1000)}km`
}

// The scope sheet offers joined groups plus the one currently shown on the map.
export function getMapScopeGroups(groups: PinGroup[], joinedIds: string[], currentGroupId: string): PinGroup[] {
  return groups.filter((group) => joinedIds.includes(group.id) || group.id === currentGroupId)
}
