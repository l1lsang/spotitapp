import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { emulatorHost, firebaseApp } from './firebase';
import { createReadCache } from './readCache';
import { type LatLng, type PlaceSearchResult } from './mapLocation';
import { getDistanceMeters } from './photoMetadata';
export type NativePlace = PlaceSearchResult;
const cache = createReadCache(64);
let client: Functions | undefined;
// Every Korean address starts with the country; it only adds noise in lists.
const withoutCountry = (place: NativePlace): NativePlace => ({ ...place, address: place.address.replace(/^대한민국\s*/, '') });
function functionsClient() {
  if (!firebaseApp) throw new Error('장소 검색에 실패했습니다.');
  if (!client) {
    client = getFunctions(firebaseApp, 'us-central1');
    if (__DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true') connectFunctionsEmulator(client, emulatorHost, 5001);
  }
  return client;
}
export async function searchNativePlaces(query: string, center: LatLng = { lat: 37.566535, lng: 126.9779692 }): Promise<NativePlace[]> {
  const keyword = query.trim();
  if (!keyword) return [];
  const search = httpsCallable<{ keyword: string; center: LatLng }, { places: NativePlace[] }>(functionsClient(), 'searchMapPlaces');
  return cache.read(JSON.stringify([keyword, center.lat, center.lng]), async () => {
    try { return (await search({ keyword, center })).data.places.map(withoutCountry); }
    catch { throw new Error('장소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.'); }
  }, 5 * 60_000);
}
// Suggests names for a photo's position, nearest first.
export async function findNearbyPlaces(location: LatLng): Promise<NativePlace[]> {
  const search = httpsCallable<{ center: LatLng }, { places: NativePlace[] }>(functionsClient(), 'searchNearbyMapPlaces');
  return cache.read(JSON.stringify(['nearby', location.lat.toFixed(5), location.lng.toFixed(5)]), async () =>
    (await search({ center: location })).data.places.map(withoutCountry)
      .sort((a, b) => getDistanceMeters(location, a.location) - getDistanceMeters(location, b.location)), 5 * 60_000);
}
