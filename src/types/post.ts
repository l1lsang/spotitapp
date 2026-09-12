import type { Timestamp } from 'firebase/firestore'

export type PostVisibility = 'followers' | 'private' | 'public' | 'group'

export interface PinTheme {
  id: string
  name: string
  color: string
}

export const DEFAULT_POST_PIN_COLOR = '#df7658'
export const FOLLOWING_PIN_COLOR = '#81905a'
export const PIN_THEME_NAME_MAX_LENGTH = 18

export const PIN_COLOR_PALETTE = [
  { name: '메모리 코랄', color: '#df7658' },
  { name: '프라이머리 틸', color: '#356f68' },
  { name: '저니 올리브', color: '#81905a' },
  { name: '딥 틸', color: '#2b5e58' },
  { name: '그레이 그린', color: '#6f746d' },
  { name: '라이트 그린', color: '#a0a49d' },
] as const

export function parsePinColorCode(value: string): string | null {
  const hex = value.trim().replace(/^#/, '')
  if (/^[\da-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`
  if (/^[\da-f]{3}$/i.test(hex)) return `#${[...hex.toLowerCase()].map(char => char + char).join('')}`
  return null
}

// Preserve colors on records saved before custom themes were introduced.
const legacyPinColors: Record<string, string> = {
  default: '#e8674f', cafe: '#2b756d', food: '#bc7a1f',
  study: '#297e99', date: '#c44b6a', solo: '#6d7f42', walk: '#4f5f9f',
}

export function normalizePinColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_POST_PIN_COLOR
  const color = parsePinColorCode(value)
  if (color) return color
  return Object.hasOwn(legacyPinColors, value) ? legacyPinColors[value] : DEFAULT_POST_PIN_COLOR
}

export function getPinThemeError(theme: PinTheme): string {
  if (!/^[\w-]{1,80}$/.test(theme.id)) return '핀 테마 정보를 확인해 주세요.'
  if (!theme.name.trim() || theme.name.trim().length > PIN_THEME_NAME_MAX_LENGTH) return `테마 이름은 1~${PIN_THEME_NAME_MAX_LENGTH}자로 입력해 주세요.`
  if (!/^#[\da-f]{6}$/i.test(theme.color)) return '핀 색상을 선택해 주세요.'
  return ''
}

export function getPostPinColor(post: Pick<Post, 'pinColor' | 'pinThemeId'>, themes: PinTheme[] = []): string {
  const theme = themes.find((item) => item.id === post.pinThemeId)
  return normalizePinColor(theme?.color || post.pinColor)
}

export function getPostMarkerColor(post: Pick<Post, 'uid' | 'pinColor' | 'pinThemeId'>, currentUid?: string, themes: PinTheme[] = []): string {
  return currentUid && post.uid === currentUid ? getPostPinColor(post, themes) : FOLLOWING_PIN_COLOR
}

export interface Post {
  id: string
  uid: string
  authorNickname: string
  title: string
  content: string
  placeName: string
  address: string
  lat: number
  lng: number
  dateKey: string
  visibility: PostVisibility
  pinColor: string
  pinThemeId?: string
  photoUrls: string[]
  photoThumbnailUrls?: string[]
  groupId?: string
  likeCount: number
  commentCount: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface PostFormInput {
  groupId?: string
  title: string
  content: string
  placeName: string
  address: string
  lat: number
  lng: number
  dateKey: string
  visibility: PostVisibility
  pinColor: string
  pinThemeId?: string
}
