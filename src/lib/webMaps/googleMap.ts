import type { LatLng, PlaceSearchResult } from '../mapLocation'

interface GoogleLatLng {
  lat: () => number
  lng: () => number
}
interface GoogleListener { remove: () => void }
export interface GoogleMapInstance {
  setCenter: (location: LatLng) => void
  getCenter: () => GoogleLatLng | undefined
  getZoom: () => number | undefined
  getProjection: () => { fromLatLngToPoint: (location: GoogleLatLng) => { x: number; y: number } | null } | undefined
  addListener: (event: string, callback: (event?: { latLng?: GoogleLatLng; stop?: () => void }) => void) => GoogleListener
}
interface GoogleMarker extends HTMLElement { map: GoogleMapInstance | null }
interface GooglePlace {
  id: string
  displayName?: string
  formattedAddress?: string
  location?: GoogleLatLng
  types?: string[]
}
interface GoogleMapsNamespace {
  Map: new (container: HTMLElement, options: {
    center: LatLng; zoom: number; mapId: string; mapTypeControl: boolean; streetViewControl: boolean
    disableDefaultUI: boolean; tilt: number; heading: number
    gestureHandling: 'auto' | 'cooperative' | 'greedy' | 'none'
  }) => GoogleMapInstance
  LatLng: new (lat: number, lng: number) => GoogleLatLng
  marker: { AdvancedMarkerElement: new (options: {
    map: GoogleMapInstance; position: LatLng; title: string; zIndex: number
  }) => GoogleMarker }
  event: { clearInstanceListeners: (instance: GoogleMapInstance) => void }
  importLibrary: (library: string) => Promise<unknown>
  places: {
    Place: {
      searchByText: (request: {
        textQuery: string; fields: string[]; locationBias: { center: LatLng; radius: number }
        maxResultCount: number; language: string
      }) => Promise<{ places: GooglePlace[] }>
      searchNearby: (request: {
        fields: string[]; locationRestriction: { center: LatLng; radius: number }
        maxResultCount: number; language: string; rankPreference?: string
      }) => Promise<{ places: GooglePlace[] }>
    }
    SearchNearbyRankPreference?: { DISTANCE: string }
  }
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsNamespace }
    __daymarkGoogleMapPromise?: Promise<void>
    __daymarkGoogleMapsReady?: () => void
  }
}

const googleMapKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
export const googleMapId = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || 'DEMO_MAP_ID'
export const isGoogleMapConfigured = Boolean(googleMapKey)
export const googleMapConfigMessage = 'Google 지도가 아직 준비되지 않았습니다. 잠시 후 다시 이용해 주세요.'

export function loadGoogleMapSdk(): Promise<void> {
  if (window.google?.maps?.importLibrary) return Promise.resolve()
  if (!isGoogleMapConfigured) return Promise.reject(new Error(googleMapConfigMessage))
  if (window.__daymarkGoogleMapPromise) return window.__daymarkGoogleMapPromise

  window.__daymarkGoogleMapPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = 'google-map-sdk'
    script.async = true
    const timeout = window.setTimeout(() => fail(), 20_000)
    function fail() {
      window.clearTimeout(timeout)
      script.remove()
      reject(new Error('Google 지도를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.'))
    }
    window.__daymarkGoogleMapsReady = () => {
      window.clearTimeout(timeout)
      resolve()
    }
    script.onerror = fail
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({
      key: googleMapKey || '', loading: 'async', callback: '__daymarkGoogleMapsReady', v: 'weekly', language: 'ko',
    })}`
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    window.__daymarkGoogleMapPromise = undefined
    throw error
  })
  return window.__daymarkGoogleMapPromise
}

export function getGoogleMaps(): GoogleMapsNamespace {
  if (!window.google?.maps) throw new Error('Google 지도가 아직 준비되지 않았습니다.')
  return window.google.maps
}

export async function searchGooglePlacesByKeyword(keyword: string, center: LatLng): Promise<PlaceSearchResult[]> {
  if (!keyword.trim()) return []
  await loadGoogleMapSdk()
  const google = getGoogleMaps()
  await google.importLibrary('places')
  const { places } = await google.places.Place.searchByText({
    textQuery: keyword.trim(),
    fields: ['id', 'displayName', 'formattedAddress', 'location'],
    locationBias: { center, radius: 50_000 },
    maxResultCount: 10,
    language: 'ko',
  })
  return places.flatMap((place) => place.location ? [{
    id: `google:${place.id}`,
    name: place.displayName || keyword,
    address: place.formattedAddress || '',
    location: { lat: place.location.lat(), lng: place.location.lng() },
    provider: 'google' as const,
  }] : [])
}

// Districts and streets are addresses, not names someone would give a visit.
const AREA_PLACE_TYPES = new Set([
  'political', 'locality', 'sublocality', 'neighborhood', 'route', 'country', 'postal_code',
  'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3', 'administrative_area_level_4',
])

export async function searchGooglePlacesNearby(center: LatLng, radius: number): Promise<PlaceSearchResult[]> {
  await loadGoogleMapSdk()
  const google = getGoogleMaps()
  await google.importLibrary('places')
  const rankPreference = google.places.SearchNearbyRankPreference?.DISTANCE
  const { places } = await google.places.Place.searchNearby({
    fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'],
    locationRestriction: { center, radius },
    maxResultCount: 10,
    language: 'ko',
    ...(rankPreference ? { rankPreference } : {}),
  })
  return places.flatMap((place) => place.location && place.displayName
    && !place.types?.some((type) => AREA_PLACE_TYPES.has(type)) ? [{
    id: `google:${place.id}`,
    name: place.displayName,
    address: place.formattedAddress || '',
    location: { lat: place.location.lat(), lng: place.location.lng() },
    provider: 'google' as const,
  }] : [])
}
