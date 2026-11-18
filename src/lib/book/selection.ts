// Choosing and ordering the records that go into a new book. Pure, so the screens
// stay thin and the rules are tested.

export interface SelectableRecord {
  id: string
  title: string
  placeName: string
  address?: string
  content: string
  dateKey: string
  photoUrls: readonly string[]
}

export const MAX_BOOK_RECORDS = 200

/** Adds the record at the end of the order, or takes it out. */
export function toggleRecord(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter(item => item !== id)
  return selected.length >= MAX_BOOK_RECORDS ? [...selected] : [...selected, id]
}

/** Selects every record of a group in its listed order, or clears them all when all are in. */
export function toggleGroup(selected: readonly string[], groupIds: readonly string[]): string[] {
  if (groupIds.length && groupIds.every(id => selected.includes(id))) return selected.filter(id => !groupIds.includes(id))
  const added = groupIds.filter(id => !selected.includes(id))
  return [...selected, ...added].slice(0, MAX_BOOK_RECORDS)
}

export function moveRecord(selected: readonly string[], index: number, delta: number): string[] {
  const to = index + delta
  if (index < 0 || index >= selected.length || to < 0 || to >= selected.length) return [...selected]
  const next = [...selected]
  const [moved] = next.splice(index, 1)
  next.splice(to, 0, moved)
  return next
}

/** Oldest first, as a diary is read; records without a date keep their place at the end. */
export function sortByDate<T extends Pick<SelectableRecord, 'id' | 'dateKey'>>(selected: readonly string[], records: readonly T[]): string[] {
  const dates = new Map(records.map(record => [record.id, record.dateKey]))
  return selected.map((id, index) => ({ id, index, date: dates.get(id) || '' }))
    .sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0) || a.index - b.index)
    .map(item => item.id)
}

export function matchesQuery(record: SelectableRecord, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = [record.title, record.placeName, record.address ?? '', record.content].join(' ').toLowerCase()
  return words.every(word => haystack.includes(word))
}

export interface RecordGroup<T> { key: string; label: string; records: T[] }

/** Newest month first; records inside a month newest first. */
export function groupByMonth<T extends SelectableRecord>(records: readonly T[]): RecordGroup<T>[] {
  const groups = new Map<string, T[]>()
  const sorted = [...records].sort((a, b) => b.dateKey.localeCompare(a.dateKey))
  for (const record of sorted) {
    const key = /^\d{4}-\d{2}/.test(record.dateKey) ? record.dateKey.slice(0, 7) : ''
    groups.set(key, [...(groups.get(key) ?? []), record])
  }
  return [...groups].map(([key, items]) => ({
    key, records: items,
    label: key ? `${Number(key.slice(0, 4))}년 ${Number(key.slice(5, 7))}월` : '날짜 없음',
  }))
}

/** Display prices for the first product. The server decides the amount actually charged. */
export const BOOK_PRICE_KRW = { base: 24900, shipping: 3000 } as const

export function formatWon(value: number): string {
  return `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`
}
