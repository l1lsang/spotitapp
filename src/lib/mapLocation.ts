export interface LatLng {
  lat: number
  lng: number
}

export interface PlaceSearchResult {
  id: string
  name: string
  address: string
  location: LatLng
  provider: 'google'
  distanceMeters?: number
}

export function isValidLocation(location: LatLng | null | undefined): location is LatLng {
  return !!location && Number.isFinite(location.lat) && Number.isFinite(location.lng) &&
    Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180
}

export type MapApp = 'google' | 'apple'

export const mapAppLabels: Record<MapApp, string> = { google: 'Google 지도', apple: 'Apple 지도' }

export function getExternalMapUrl(location: LatLng, app: MapApp = 'google', label?: string): string {
  if (!isValidLocation(location)) throw new Error('핀의 위치를 확인할 수 없습니다.')
  if (app === 'apple') {
    // maps.apple.com is a universal link: it opens the Maps app on iOS and shows a pin named by q.
    const query = new URLSearchParams({ ll: `${location.lat},${location.lng}`, q: label?.trim() || '선택한 핀' })
    return `https://maps.apple.com/?${query}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`
}
