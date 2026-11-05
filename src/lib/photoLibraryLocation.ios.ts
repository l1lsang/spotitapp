import { Asset, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library'
import type { LatLng } from './mapLocation'

// The iOS photo picker can hand over a copy without GPS even when Photos shows a
// location. The library asset behind the same identifier still has it, so ask
// for photo library access only when a picked photo came back without one.
export async function readLibraryLocations(assetIds: (string | null | undefined)[]): Promise<(LatLng | null)[]> {
  if (!assetIds.some(Boolean)) return assetIds.map(() => null)
  try {
    let permission = await getPermissionsAsync()
    if (!permission.granted && permission.canAskAgain) permission = await requestPermissionsAsync()
    if (!permission.granted) return assetIds.map(() => null)
  } catch {
    return assetIds.map(() => null)
  }
  return Promise.all(assetIds.map(async id => {
    if (!id) return null
    try {
      const location = await new Asset(id).getLocation()
      return location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
        && (location.latitude !== 0 || location.longitude !== 0)
        ? { lat: location.latitude, lng: location.longitude } : null
    } catch {
      // Limited access may exclude this photo; the user places the pin instead.
      return null
    }
  }))
}
