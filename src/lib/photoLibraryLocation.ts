import type { LatLng } from './mapLocation'

// Only iOS reads locations from the photo library (photoLibraryLocation.ios.ts).
// Android gets them from the picked file once ACCESS_MEDIA_LOCATION is granted.
export async function readLibraryLocations(assetIds: (string | null | undefined)[]): Promise<(LatLng | null)[]> {
  return assetIds.map(() => null)
}
