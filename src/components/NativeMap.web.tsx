import { MapView } from './webMaps/MapView';
import { useAuth } from '../hooks/useAuth';
import type { NativeMapProps } from './NativeMap.types';
import './webMaps/map.css';
export default function NativeMap(props: NativeMapProps) {
  const { currentUser, profile } = useAuth();
  return <MapView center={props.center} centerRevision={props.centerRevision} posts={props.posts} currentLocation={props.currentLocation} selectedLocation={props.selected} selectedPhotoUrl={props.selectedPhotoUri} selectedPostId={props.selectedPostId} onMapClick={props.onPick} onMarkerClick={post => props.onSelect([post])} onClusterClick={props.onSelect} onCenterIdle={props.onRegionChange} currentUserUid={currentUser?.uid} pinThemes={profile?.pinThemes} />;
}
