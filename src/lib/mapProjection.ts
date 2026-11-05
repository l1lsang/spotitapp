import type { LatLng } from './mapLocation';
/** Web Mercator in display pixels: zooming must split overlapping pins again. */
export function projectMapPoint(point: LatLng, center: LatLng, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const y = (lat: number) => {
    const sin = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180);
    return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  };
  const delta = ((point.lng - center.lng + 540) % 360) - 180;
  return { x: delta / 360 * scale, y: (y(point.lat) - y(center.lat)) * scale };
}
