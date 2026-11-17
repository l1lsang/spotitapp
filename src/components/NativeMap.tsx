import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import Constants from 'expo-constants';
import MapView, { Marker, PROVIDER_GOOGLE, type MapMarkerProps, type Region } from 'react-native-maps';
import { clusterPosts } from '../lib/mapClusters';
import { projectMapPoint } from '../lib/mapProjection';
import { getPostCoverThumbnail, getPostMarkerColor, type Post } from '../types/post';
import { useAuth } from '../hooks/useAuth';
import { PostPhotoPin, PostPin } from './PostPin';
import { Button, p } from './ui';
import type { NativeMapProps } from './NativeMap.types';
export type { NativeMapProps } from './NativeMap.types';
export function MapUnavailable({ message, retry }: { message: string; retry?: () => void }) {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 18 }]}>
    <Text style={{ color: p.ink, fontWeight: '700', fontSize: 18 }}>지도를 표시할 수 없습니다.</Text>
    <Text style={{ color: p.muted, textAlign: 'center', fontSize: 16, lineHeight: 23 }}>{message}</Text>
    {!!retry && <Button title="다시 시도" variant="secondary" onPress={retry} />}
  </View>;
}
// Google anchors the marker at its bottom center: the tail tip is the photo's position.
function PhotoPin({ uri }: { uri: string }) {
  return <View collapsable={false} style={{ width: 52, height: 60, alignItems: 'center', boxShadow: '0 4px 10px #161F1B47' }}>
    <Image source={{ uri }} style={{ width: 52, height: 52, borderWidth: 3, borderColor: p.paper, borderRadius: 12, backgroundColor: p.surface }} />
    <View style={{ width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 8, borderLeftColor: p.transparent, borderRightColor: p.transparent, borderTopColor: p.paper }} />
  </View>;
}
// Google Maps draws a custom marker from a snapshot of its view. A marker that stops
// tracking before its view has rendered is drawn as the default red pin, so each
// marker tracks briefly after it mounts or its look changes, then stops for speed.
function SnapshotMarker({ settleMs = 700, version = '', ...props }: MapMarkerProps & { settleMs?: number; version?: string }) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => { setTracking(true); const timer = setTimeout(() => setTracking(false), settleMs); return () => clearTimeout(timer); }, [version, settleMs]);
  return <Marker {...props} tracksViewChanges={tracking} />;
}
function PhotoMarker({ location, uri }: { location: { lat: number; lng: number }; uri: string }) {
  // The thumbnail downloads first, so this one keeps tracking longer.
  return <SnapshotMarker version={uri} settleMs={1500} coordinate={{ latitude: location.lat, longitude: location.lng }} anchor={{ x: 0.5, y: 1 }} accessibilityLabel="사진을 찍은 위치"><PhotoPin uri={uri} /></SnapshotMarker>;
}
// Photo pins wait until their thumbnail is in the image cache, so the marker snapshot
// is taken with the photo drawn instead of an empty square. Until then they show the default pin.
function usePrefetchedPhotos(posts: Post[]): ReadonlySet<string> {
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set());
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    for (const post of posts) {
      const uri = getPostCoverThumbnail(post);
      if (!uri || requested.current.has(uri)) continue;
      requested.current.add(uri);
      Image.prefetch(uri)
        .then(ok => { if (ok && mounted.current) setReady(previous => new Set(previous).add(uri)); })
        .catch(() => { requested.current.delete(uri); });
    }
  }, [posts]);
  return ready;
}
// One record with a ready photo is a square photo pin; anything else is the default pin or a cluster.
function PostMarker({ posts, photo, color, active, position, focusRevision, onPress }: { posts: Post[]; photo: string; color: string; active: boolean; position: { lat: number; lng: number }; focusRevision: number; onPress: () => void }) {
  // The map shows a snapshot of the pin, retaken only when tracking stops. Android drops
  // the photo while the map screen is hidden and the snapshot taken on return is blank,
  // so every (re)load and every return to the screen starts a new round of snapshots.
  const [loads, setLoads] = useState(0);
  const coordinate = { latitude: position.lat, longitude: position.lng };
  const press = (event: { stopPropagation: () => void }) => { event.stopPropagation(); onPress(); };
  if (photo) return <SnapshotMarker version={`${color}:${active}:${loads}:${focusRevision}`} settleMs={loads ? 1200 : 6000} coordinate={coordinate} anchor={{ x: 0.5, y: 1 }} zIndex={active ? 10 : 1} onPress={press}>
    <PostPhotoPin uri={photo} color={color} selected={active} onLoad={() => setLoads(count => count + 1)} />
  </SnapshotMarker>;
  return <SnapshotMarker version={`${color}:${posts.length}:${active}`} coordinate={coordinate} anchor={{ x: 0.5, y: posts.length > 1 ? 0.5 : 0.86 }} zIndex={active ? 10 : 1} onPress={press}>
    <PostPin color={color} count={posts.length} selected={active} />
  </SnapshotMarker>;
}
export default function NativeMap({ center, centerRevision = 0, posts, onSelect, onPick, onRegionChange, selected, selectedPhotoUri, selectedPostId, currentLocation, bottomInset = 110 }: NativeMapProps) {
  const { currentUser, profile } = useAuth();
  const [size, setSize] = useState({ width: 390, height: 700 });
  const [region, setRegion] = useState<Region>({ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.015, longitudeDelta: 0.015 });
  // The region state follows panning, so a revision re-centers on an unchanged target too.
  useEffect(() => {
    setRegion(previous => Math.abs(previous.latitude - center.lat) < 0.000001 && Math.abs(previous.longitude - center.lng) < 0.000001 ? previous : { ...previous, latitude: center.lat, longitude: center.lng });
  }, [center.lat, center.lng, centerRevision]);
  const zoom = Math.log2(360 * size.width / (256 * Math.max(region.longitudeDelta, 0.000001)));
  const readyPhotos = usePrefetchedPhotos(posts);
  // Coming back to a screen with this map redraws the photo pins (see PostMarker).
  const [focusRevision, setFocusRevision] = useState(0);
  useFocusEffect(useCallback(() => { setFocusRevision(value => value + 1); }, []));
  const groups = useMemo(() => clusterPosts(posts, point => projectMapPoint(point, { lat: region.latitude, lng: region.longitude }, zoom)), [posts, region.latitude, region.longitude, zoom]);
  const configured = Constants.appOwnership === 'expo' || Constants.expoConfig?.extra?.nativeMaps?.[Platform.OS === 'ios' ? 'iosConfigured' : 'androidConfigured'];
  if (!configured) return <MapUnavailable message="Google 지도를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요." />;
  // The app is light-only for now; Google would otherwise follow the system's dark mode.
  return <MapView provider={PROVIDER_GOOGLE} userInterfaceStyle="light" style={StyleSheet.absoluteFill} region={region} mapPadding={{ top: 0, right: 0, left: 0, bottom: bottomInset }}
    onLayout={event => setSize(event.nativeEvent.layout)} showsMyLocationButton={false} showsCompass={false} toolbarEnabled={false} rotateEnabled={false} pitchEnabled={false}
    onPress={event => { if (event.nativeEvent.action !== 'marker-press') onPick({ lat: event.nativeEvent.coordinate.latitude, lng: event.nativeEvent.coordinate.longitude }); }}
    onLongPress={event => onPick({ lat: event.nativeEvent.coordinate.latitude, lng: event.nativeEvent.coordinate.longitude })}
    onRegionChangeComplete={value => { setRegion(value); onRegionChange?.({ lat: value.latitude, lng: value.longitude }); }}>
    {groups.map(group => {
      const color = getPostMarkerColor(group.posts[0], currentUser?.uid, profile?.pinThemes);
      const active = group.posts.some(post => post.id === selectedPostId);
      const position = group.posts.find(post => post.id === selectedPostId) || group.location;
      const cover = group.posts.length === 1 ? getPostCoverThumbnail(group.posts[0]) : '';
      const photo = cover && readyPhotos.has(cover) ? cover : '';
      // A stable key keeps the native marker when only its color or selection changes;
      // remounting it flashed Android's default pin while the old one was torn down.
      // Switching between photo pin, pin and cluster needs a new marker, though: iOS Google
      // Maps keeps the old child view, so a cluster's "+N" stayed drawn over the photo.
      const kind = photo ? 'photo' : group.posts.length > 1 ? 'cluster' : 'pin';
      const id = group.posts.reduce((first, post) => post.id < first ? post.id : first, group.posts[0].id);
      return <PostMarker key={`${id}:${kind}`} posts={group.posts} photo={photo} color={color} active={active} position={position} focusRevision={focusRevision} onPress={() => onSelect(group.posts)} />;
    })}
    {selected && selectedPhotoUri && <PhotoMarker location={selected} uri={selectedPhotoUri} />}
    {selected && !selectedPhotoUri && <SnapshotMarker coordinate={{ latitude: selected.lat, longitude: selected.lng }} anchor={{ x: 0.5, y: 0.5 }}><View collapsable={false} style={{ width: 32, height: 32, borderRadius: 99, backgroundColor: '#356f6840', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 22, height: 22, borderWidth: 4, borderColor: p.paper, borderRadius: 99, backgroundColor: p.primary }} /></View></SnapshotMarker>}
    {currentLocation && <SnapshotMarker coordinate={{ latitude: currentLocation.lat, longitude: currentLocation.lng }} anchor={{ x: 0.5, y: 0.5 }}><View collapsable={false} style={{ width: 36, height: 36, borderRadius: 99, backgroundColor: '#2684ff2e', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 22, height: 22, borderWidth: 3, borderColor: '#fff', borderRadius: 99, backgroundColor: '#2684ff' }} /></View></SnapshotMarker>}
  </MapView>;
}
