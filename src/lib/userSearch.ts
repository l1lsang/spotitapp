import type { DaymarkUser } from '../types/user'

// Keep identical to backend/functions/userSearchCore.js, which builds searchTokens.
export function normalizeUserSearch(value: string | undefined): string {
  return typeof value === 'string' ? value.normalize('NFKC').toLowerCase().trim().replace(/^@/, '') : ''
}

// The query's first one or two characters: a searchTokens entry of every name containing it.
export function getUserSearchProbe(term: string): string {
  return Array.from(term).slice(0, 2).join('')
}

// Keeps names containing the whole query: exact matches, then leading matches, then the rest.
export function rankUserSearchResults(users: DaymarkUser[], term: string): DaymarkUser[] {
  const rank = (user: DaymarkUser) => {
    const names = [user.nickname, user.username].map(normalizeUserSearch).filter(Boolean)
    if (names.includes(term)) return 0
    if (names.some(name => name.startsWith(term))) return 1
    return names.some(name => name.includes(term)) ? 2 : -1
  }
  return users.map(user => ({ user, rank: rank(user) }))
    .filter(item => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || (a.user.nickname || '').localeCompare(b.user.nickname || ''))
    .map(item => item.user)
}
