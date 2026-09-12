export interface LatLng {
  lat: number
  lng: number
}

export type MapProvider = 'kakao' | 'google'

export interface PlaceSearchResult {
  id: string
  name: string
  address: string
  location: LatLng
  provider: MapProvider
  distanceMeters?: number
}

export function isValidLocation(location: LatLng): boolean {
  return Number.isFinite(location.lat) && Number.isFinite(location.lng) &&
    Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180
}

// Approximate service area, not an administrative boundary. Keep nearby Japan
// (especially Tsushima) outside the mainland area; include the outlying islands.
const mainland: [number, number][] = [
  [126.0, 37.8], [126.6, 37.8], [127.1, 38.35], [128.4, 38.65],
  [129.6, 37.2], [129.65, 35.5], [129.25, 35.0], [128.5, 34.55],
  [127.5, 34.25], [126.0, 33.9], [125.0, 34.3], [125.8, 36.0],
]

export function isSouthKoreaLocation(location: LatLng): boolean {
  if (!isValidLocation(location)) return false
  const { lat, lng } = location
  let inside = false
  for (let i = 0, j = mainland.length - 1; i < mainland.length; j = i++) {
    const [xi, yi] = mainland[i]
    const [xj, yj] = mainland[j]
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside || [
    [33.05, 33.65, 126.05, 127.0], // Jeju and nearby islands
    [37.4, 37.6, 130.75, 130.95], // Ulleungdo
    [37.2, 37.3, 131.8, 131.95], // Dokdo
    [37.55, 38.05, 124.55, 125.1], // Northwestern islands
  ].some(([south, north, west, east]) => lat >= south && lat <= north && lng >= west && lng <= east)
}

export function getMapProvider(location: LatLng): MapProvider {
  return isSouthKoreaLocation(location) ? 'kakao' : 'google'
}

export function getExternalMapUrl(location: LatLng, name: string): string {
  if (getMapProvider(location) === 'kakao') {
    return `https://map.kakao.com/link/map/${encodeURIComponent(name || '선택한 위치')},${location.lat},${location.lng}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`
}
