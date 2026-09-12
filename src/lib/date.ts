import type { Timestamp } from 'firebase/firestore'

export function getTodayDateKey(): string {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60_000

  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

export function formatDateKey(dateKey: string): string {
  return dateKey.replaceAll('-', '.')
}

export function formatTimestamp(timestamp?: Timestamp): string {
  if (!timestamp) {
    return ''
  }

  return timestamp.toDate().toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatChatTime(timestamp?: Timestamp): string {
  if (!timestamp) {
    return ''
  }

  return timestamp.toDate().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getTimestampDateKey(timestamp?: Timestamp): string {
  if (!timestamp) {
    return ''
  }

  const date = timestamp.toDate()
  const timezoneOffset = date.getTimezoneOffset() * 60_000

  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

export function formatChatDateSeparator(dateKey: string): string {
  if (!dateKey) {
    return ''
  }

  const today = getTodayDateKey()
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  if (dateKey === today) {
    return '오늘'
  }

  if (dateKey === yesterday) {
    return '어제'
  }

  return dateKey.replaceAll('-', '.')
}
