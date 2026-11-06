import { isValidLocation, mapAppLabels, type LatLng, type MapApp } from './mapLocation'

export type TravelMode = 'transit' | 'walking' | 'driving'

const appleTravelFlags: Record<TravelMode, string> = { transit: 'r', walking: 'w', driving: 'd' }

export function getDirectionsUrl(origin: LatLng, destination: LatLng, mode: TravelMode = 'transit'): string {
  if (!isValidLocation(origin)) throw new Error('현재 위치를 확인할 수 없어 길찾기를 시작할 수 없습니다.')
  if (!isValidLocation(destination)) throw new Error('핀의 위치를 확인할 수 없어 길찾기를 시작할 수 없습니다.')
  if (!['transit', 'walking', 'driving'].includes(mode)) throw new Error('이동 수단을 확인해 주세요.')
  const query = new URLSearchParams({
    api: '1', origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`, travelmode: mode,
  })
  return `https://www.google.com/maps/dir/?${query}`
}

// Apple Maps starts from the device's own current location when saddr is omitted.
export function getAppleDirectionsUrl(destination: LatLng, mode: TravelMode = 'transit'): string {
  if (!isValidLocation(destination)) throw new Error('핀의 위치를 확인할 수 없어 길찾기를 시작할 수 없습니다.')
  if (!(mode in appleTravelFlags)) throw new Error('이동 수단을 확인해 주세요.')
  const query = new URLSearchParams({ daddr: `${destination.lat},${destination.lng}`, dirflg: appleTravelFlags[mode] })
  return `https://maps.apple.com/?${query}`
}

// Only a freshly requested location can be the origin; never use the map center.
export async function startMapDirections(destination: LatLng, mode: TravelMode, actions: {
  getCurrentLocation: () => Promise<LatLng | null>
  openUrl: (url: string) => Promise<void>
  isCancelled: () => boolean
}, app: MapApp = 'google'): Promise<boolean> {
  if (!isValidLocation(destination)) throw new Error('핀의 위치를 확인할 수 없어 길찾기를 시작할 수 없습니다.')
  let url: string
  if (app === 'apple') url = getAppleDirectionsUrl(destination, mode)
  else {
    const origin = await actions.getCurrentLocation()
    if (actions.isCancelled()) return false
    if (!isValidLocation(origin)) throw new Error('현재 위치를 확인할 수 없어 길찾기를 시작할 수 없습니다.')
    url = getDirectionsUrl(origin, destination, mode)
  }
  try { await actions.openUrl(url) }
  catch { throw new Error(`${mapAppLabels[app]}를 열지 못해 길찾기를 시작할 수 없습니다. 다시 시도해 주세요.`) }
  return true
}
