import { searchGooglePlacesByKeyword, searchGooglePlacesNearby } from './googleMap'
import type { LatLng, PlaceSearchResult } from '../mapLocation'
import { getDistanceMeters } from '../photoMetadata'
import { createReadCache } from '../readCache'

const placeCache = createReadCache(64)
export const NEARBY_PLACE_RADIUS_METERS = 200

// Every Korean address starts with the country; it only adds noise in lists.
const withoutCountry = (place: PlaceSearchResult): PlaceSearchResult => ({ ...place, address: place.address.replace(/^대한민국\s*/, '') })

export async function searchPlaces(keyword: string, center: LatLng): Promise<PlaceSearchResult[]> {
  const trimmed = keyword.trim()
  if (!trimmed) return []
  return placeCache.read(JSON.stringify([trimmed, center.lat, center.lng]),
    async () => (await searchGooglePlacesByKeyword(trimmed, center)).map(withoutCountry), 5 * 60_000)
}

// Suggests names for a photo's position, nearest first.
export async function findNearbyPlaces(location: LatLng): Promise<PlaceSearchResult[]> {
  return placeCache.read(JSON.stringify(['nearby', location.lat.toFixed(5), location.lng.toFixed(5)]),
    async () => (await searchGooglePlacesNearby(location, NEARBY_PLACE_RADIUS_METERS))
      .map(withoutCountry)
      .sort((a, b) => getDistanceMeters(location, a.location) - getDistanceMeters(location, b.location)), 5 * 60_000)
}
