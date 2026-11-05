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

export function getExternalMapUrl(location: LatLng): string {
  if (!isValidLocation(location)) throw new Error('핀의 위치를 확인할 수 없습니다.')
  return `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`
}
