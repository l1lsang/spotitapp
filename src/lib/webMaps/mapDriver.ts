import { getGoogleMaps, googleMapId, loadGoogleMapSdk } from './googleMap'
import type { MapPoint } from '../mapClusters'
import type { LatLng } from '../mapLocation'

export interface MapDriver {
  setCenter: (location: LatLng) => void
  getCenter: () => LatLng
  project: (location: LatLng) => MapPoint | null
  addMarker: (location: LatLng, content: HTMLElement, selected?: boolean) => () => void
  onIdle: (handler: () => void) => () => void
  preventMapClick: () => void
  resize: () => void
  destroy: () => void
}

export async function prepareMapSdk(): Promise<void> {
  await loadGoogleMapSdk()
  const google = getGoogleMaps()
  await Promise.all([google.importLibrary('maps'), google.importLibrary('marker')])
}

// Creation is synchronous after loading, so an unmounted view never creates a map.
export function createMapDriver(
  container: HTMLElement,
  center: LatLng,
  onClick: (location: LatLng) => void,
): MapDriver {
  const google = getGoogleMaps()
  const map = new google.Map(container, {
    center, zoom: 15, mapId: googleMapId, mapTypeControl: false, streetViewControl: false,
    disableDefaultUI: true,
    tilt: 0, heading: 0,
    gestureHandling: 'greedy',
  })
  const listener = map.addListener('click', (event) => {
    event?.stop?.() // Selecting a place creates our pin instead of a competing POI popup.
    if (event?.latLng) onClick({ lat: event.latLng.lat(), lng: event.latLng.lng() })
  })
  // The latest settled center survives container resizes such as a bottom sheet opening.
  let settledCenter = center
  const readCenter = (): LatLng => {
    const current = map.getCenter()
    return current ? { lat: current.lat(), lng: current.lng() } : settledCenter
  }
  const idleCenterListener = map.addListener('idle', () => { settledCenter = readCenter() })
  return {
    setCenter: (location) => {
      settledCenter = location
      map.setCenter(location)
    },
    getCenter: readCenter,
    project: (location) => {
      const projection = map.getProjection()
      const point = projection?.fromLatLngToPoint(new google.LatLng(location.lat, location.lng))
      const origin = map.getCenter()
      const originPoint = origin && projection?.fromLatLngToPoint(origin)
      if (!point || !originPoint) return null
      // Wrap around the date line so adjacent pins at ±180° still group.
      const dx = ((point.x - originPoint.x + 384) % 256) - 128
      const scale = 2 ** (map.getZoom() ?? 15)
      return { x: dx * scale, y: (point.y - originPoint.y) * scale }
    },
    addMarker: (location, content, selected) => {
      const marker = new google.marker.AdvancedMarkerElement({
        map, position: location, title: content.getAttribute('aria-label') || '', zIndex: selected ? 10 : 1,
      })
      marker.append(content)
      return () => { marker.map = null }
    },
    onIdle: (handler) => {
      const idleListener = map.addListener('idle', handler)
      return () => idleListener.remove()
    },
    preventMapClick: () => undefined,
    resize: () => map.setCenter(settledCenter),
    destroy: () => {
      listener.remove()
      idleCenterListener.remove()
      google.event.clearInstanceListeners(map)
      container.replaceChildren()
    },
  }
}
