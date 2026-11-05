import type { Timestamp } from 'firebase/firestore'

export function formatRelativeTime(value: unknown): string {
  const millis = value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function' ? value.toMillis() as number : 0
  if (!millis) return '방금 전'
  const minutes = Math.max(0, Math.floor((Date.now() - millis) / 60000))
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`
}

export function getTodayDateKey(): string {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60_000

  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

export function formatDateKey(dateKey: string): string {
  return dateKey.replaceAll('-', '.')
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function formatDateKeyWithWeekday(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일 (${WEEKDAYS[new Date(year, month - 1, day).getDay()]})`
}

export function formatClockTime(time: string): string {
  const [hour, minute] = time.split(':').map(Number)
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(minute).padStart(2, '0')}`
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
