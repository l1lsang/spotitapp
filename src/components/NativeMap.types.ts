import type { LatLng } from '../lib/mapLocation';
import type { Post } from '../types/post';
export interface NativeMapProps {
  center: LatLng;
  /** Bump to pan back to `center` even when its coordinates did not change. */
  centerRevision?: number;
  posts: Post[];
  onSelect: (posts: Post[]) => void;
  onPick: (point: LatLng) => void;
  onRegionChange?: (point: LatLng) => void;
  selected?: LatLng | null;
  /** Shows the selected location as this photo's thumbnail pin. */
  selectedPhotoUri?: string;
  selectedPostId?: string;
  currentLocation?: LatLng | null;
  bottomInset?: number;
}
