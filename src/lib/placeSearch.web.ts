import { findNearbyPlaces as findNearbyWebPlaces, searchPlaces } from './webMaps/placeSearch';
import { type LatLng } from './mapLocation';
export function searchNativePlaces(query: string, center: LatLng = { lat: 37.566535, lng: 126.9779692 }) {
  return searchPlaces(query, center);
}
export function findNearbyPlaces(location: LatLng) {
  return findNearbyWebPlaces(location);
}
export type { PlaceSearchResult as NativePlace } from './mapLocation';
