import type { Timestamp } from 'firebase/firestore'

export const LIVE_PLACE_STATUS_OPTIONS = [
  { id: 'crowded', label: '지금 붐빔' },
  { id: 'seats', label: '자리 많음' },
  { id: 'quiet', label: '조용함' },
  { id: 'waiting', label: '웨이팅 있음' },
  { id: 'outlets', label: '콘센트 있음' },
  { id: 'goodMood', label: '분위기 좋음' },
  { id: 'solo', label: '혼밥 가능' },
  { id: 'study', label: '공부 가능' },
] as const

export type LivePlaceStatusKey = (typeof LIVE_PLACE_STATUS_OPTIONS)[number]['id']

const livePlaceStatusIds = new Set<string>(LIVE_PLACE_STATUS_OPTIONS.map((option) => option.id))

export function isLivePlaceStatusKey(value: string): value is LivePlaceStatusKey {
  return livePlaceStatusIds.has(value)
}

export interface LivePlaceStatusUpdate {
  id: string
  placeId: string
  placeName: string
  address: string
  lat: number
  lng: number
  tags: LivePlaceStatusKey[]
  note: string
  uid: string
  authorNickname: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface LivePlaceStatusInput {
  placeId: string
  placeName: string
  address: string
  lat: number
  lng: number
  tags: LivePlaceStatusKey[]
  note: string
}
