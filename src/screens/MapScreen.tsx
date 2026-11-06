import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { ImagePickerAsset } from 'expo-image-picker';
import { CalendarDays, Compass, ExternalLink, LocateFixed, MapPin, Plus, Search, Share2, UserRound, X } from 'lucide-react-native';
import NativeMap from '../components/NativeMap';
import { PostInteractions } from '../components/PostInteractions';
import { FormScrollView, KeyboardPane, useKeyboardVisible } from '../components/keyboard';
import { DirectionsButton } from '../components/DirectionsButton';
import { MapPlacePanel } from '../components/MapPlacePanel';
import { useHideBottomNav } from '../components/AppChrome';
import { MapControlButton, MapPinLegend } from '../components/map/MapControls';
import { MapPlaceSearch, MapSelectedPlaceField } from '../components/map/MapPlaceSearch';
import { MapScopeChip, MapScopeSheet } from '../components/map/MapScopeSheet';
import { PhotoCenterPin, PhotoRecordLauncher, PhotoRecordSheet, PhotoRecordTopBar } from '../components/map/PhotoRecordFlow';
import { Button, IconButton, Notice, elevation, p, s } from '../components/ui';
import { JoinGroupButton } from './GroupScreens';
import { usePosts } from '../hooks/usePosts';
import { useGroups } from '../hooks/useGroups';
import { useAuth } from '../hooks/useAuth';
import { useBlockedUsers, withoutBlocked } from '../hooks/useBlockedUsers';
import { usePhotoRecordFlow } from '../hooks/usePhotoRecordFlow';
import { SEOUL_CITY_HALL, useCurrentLocation } from '../hooks/useCurrentLocation';
import type { NativePlace } from '../lib/placeSearch';
import { isValidLocation, type LatLng } from '../lib/mapLocation';
import { openLocationInMaps } from '../lib/mapAppChoice';
import { getMapScopeGroups } from '../lib/mapHelpers';
import { readPhotoRecordPrefill, setPhotoRecordPrefill, subscribeMapRecordEvents, type MapRecordEvent, type PhotoRecordPrefill } from '../lib/photoRecordBridge';
import { formatDateKey } from '../lib/date';
import { subscribeGroupPosts } from '../services/postService';
import { getPostMarkerColor, type Post } from '../types/post';
const EMPTY_POSTS: Post[] = [];

export default function MapScreen() {
  const params = useLocalSearchParams<{ group?: string; lat?: string; lng?: string }>();
  const { currentUser } = useAuth();
  const groupId = params.group || '';
  // Each scope starts fresh: selections, sheets and the photo flow belong to one map.
  return <ScopedMap key={`${currentUser?.uid || 'guest'}:${groupId}`} groupId={groupId} lat={params.lat} lng={params.lng} />;
}

function ScopedMap({ groupId, lat, lng }: { groupId: string; lat?: string; lng?: string }) {
  const { currentUser, profile, profileError, accountReady: firebaseReady, refreshProfile } = useAuth();
  const { posts, error, refresh } = usePosts();
  const catalog = useGroups();
  const geo = useCurrentLocation();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { width } = useWindowDimensions();
  const [center, setCenter] = useState<LatLng>(SEOUL_CITY_HALL);
  const [centerRevision, setCenterRevision] = useState(0);
  const mapCenterRef = useRef<LatLng>(SEOUL_CITY_HALL);
  const [groupPosts, setGroupPosts] = useState<Post[]>([]);
  const [groupError, setGroupError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState<LatLng | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<NativePlace | null>(null);
  const [cluster, setCluster] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchCenter, setSearchCenter] = useState<LatLng>(SEOUL_CITY_HALL);
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const [photoSheetHeight, setPhotoSheetHeight] = useState(0);
  const [placeSheetHeight, setPlaceSheetHeight] = useState(0);
  const [screenHeight, setScreenHeight] = useState(0);
  const group = catalog.groups.find(item => item.id === groupId);
  const joined = !!groupId && catalog.joinedIds.includes(groupId);
  const canCreatePin = !groupId || Boolean(group && joined && !catalog.loading && !catalog.error);
  const wide = width > 860;
  const edge = wide ? 24 : 16;
  const top = wide ? 18 : 12;
  const bottom = wide ? 24 : keyboardVisible ? 12 : Math.max(6, insets.bottom) + 72;
  const panelWidth = Math.min(420, width - 48);
  const loginFrom = groupId ? '/map?group=' + encodeURIComponent(groupId) : '/map';

  const focusMap = useCallback((location: LatLng) => {
    setCenter(location);
    setCenterRevision(value => value + 1);
  }, []);
  const photoRecord = usePhotoRecordFlow(focusMap);
  const photoFlow = photoRecord.flow;

  useEffect(() => {
    if (currentUser && profile?.onboardingComplete === false) router.replace('/signup');
  }, [currentUser?.uid, profile?.onboardingComplete]);
  useEffect(() => {
    if (groupId || lat || lng || !firebaseReady) return;
    let active = true;
    void geo.requestLocation(false).then(next => { if (active && next) focusMap(next); });
    return () => { active = false; };
  }, [groupId, lat, lng, firebaseReady, geo.requestLocation, focusMap]);
  useEffect(() => {
    if (!lat || !lng) return;
    const next = { lat: Number(lat), lng: Number(lng) };
    if (isValidLocation(next)) focusMap(next);
  }, [lat, lng, focusMap]);
  useEffect(() => {
    setGroupPosts([]); setGroupError('');
    if (!groupId || !currentUser || !firebaseReady || !group || (group.visibility === 'private' && !joined)) return;
    let positioned = false;
    return subscribeGroupPosts(groupId, next => {
      setGroupPosts(next);
      // Keep the group map centered on its pins when the device location arrives.
      if (!positioned && next.length) { positioned = true; focusMap({ lat: next[0].lat, lng: next[0].lng }); }
    }, () => setGroupError('그룹 핀을 불러오지 못했습니다.'), group.visibility);
  }, [groupId, currentUser?.uid, firebaseReady, group?.id, group?.visibility, joined, revision, focusMap]);
  const { ids: blockedIds } = useBlockedUsers();
  const visibleGroupPosts = useMemo(() => withoutBlocked(groupPosts, blockedIds), [groupPosts, blockedIds]);
  const shown = firebaseReady ? (groupId ? visibleGroupPosts : posts) : EMPTY_POSTS;
  // Drop a preview immediately if membership or visibility removes its record.
  useEffect(() => {
    setSelectedPost(previous => previous ? shown.find(post => post.id === previous.id) || null : null);
    setCluster(previous => previous.map(item => shown.find(post => post.id === item.id)).filter((item): item is Post => !!item));
  }, [shown]);

  const photoPinLocation = photoFlow?.step === 'confirm' ? photoFlow.summary?.location ?? null : null;
  const placeSheetOpen = !!selectedPlace && !photoFlow && !searchOpen;
  const recordPromptOpen = !!selectedLocation && !selectedPlace && !!currentUser && canCreatePin && !photoFlow;
  const pinListOpen = cluster.length > 1 && !selectedPost;
  // Floating controls step aside while a panel or flow owns the bottom of the map.
  const controlsVisible = !photoFlow && !selectedPlace && !recordPromptOpen && !pinListOpen && !selectedPost;
  const showLauncher = controlsVisible && !!currentUser && firebaseReady && canCreatePin;
  const myPinColors = [...new Set(shown.filter(post => post.uid === currentUser?.uid).map(post => getPostMarkerColor(post, currentUser?.uid, profile?.pinThemes)))];
  // On phones the map shrinks above a bottom sheet so its pin stays in the visible center.
  const mapBottom = wide ? 0 : photoFlow ? photoSheetHeight : placeSheetOpen ? placeSheetHeight : 0;
  useHideBottomNav('map-sheet', !wide && (!!photoFlow || placeSheetOpen));

  const closePhotoRecord = useCallback(() => {
    photoRecord.close();
    setPhotoRecordPrefill(null);
  }, [photoRecord.close]);

  // The record form reports back here: a saved record or a request to move the photo pin.
  const recordEvents = useRef<(event: MapRecordEvent) => void>(() => undefined);
  recordEvents.current = event => {
    if (event.kind === 'change-location') {
      const prefill = readPhotoRecordPrefill();
      if (!prefill) return;
      photoRecord.locate(prefill.source === 'photo' ? 'adjust' : 'missing');
      focusMap(prefill.location);
      setPhotoRecordPrefill(null);
      return;
    }
    if (event.photo) { closePhotoRecord(); focusMap(event.location); }
    if (!selectedPlace) setSelectedLocation(null);
    if (event.groupId && event.groupId !== groupId) router.setParams({ group: event.groupId });
    else void refresh();
  };
  useEffect(() => subscribeMapRecordEvents(event => recordEvents.current(event)), []);

  function clearSelection() {
    setSelectedLocation(null); setSelectedPlace(null); setSelectedPost(null); setCluster([]);
  }
  function pick(location: LatLng) {
    if (photoFlow) { if (photoFlow.step === 'locate') focusMap(location); return; }
    setSelectedLocation(location); setSelectedPlace(null); setSelectedPost(null); setCluster([]);
  }
  function selectPosts(items: Post[]) {
    if (photoFlow) return;
    setSelectedLocation(null); setSelectedPlace(null);
    if (items.length > 1) { setCluster(items); setSelectedPost(null); return; }
    setCluster([]);
    if (items[0]) selectPost(items[0]);
  }
  function selectPost(post: Post) {
    setSelectedPost(post); setSelectedLocation(null); setSelectedPlace(null);
    focusMap({ lat: post.lat, lng: post.lng });
  }
  async function moveToCurrentLocation() {
    const next = await geo.requestLocation();
    if (!next) return;
    clearSelection();
    focusMap(next);
  }
  function openSearch() {
    setSearchCenter(mapCenterRef.current);
    setSearchOpen(true);
  }
  function choosePlace(place: NativePlace, query: string) {
    setCluster([]); setSelectedPost(null);
    focusMap(place.location);
    setSelectedLocation(place.location);
    setSelectedPlace(place);
    setPlaceQuery(query);
    setSearchOpen(false);
  }
  function clearSelectedPlace() {
    setSelectedPlace(null); setSelectedLocation(null); setPlaceQuery('');
  }
  function selectScope(nextGroupId: string) {
    setGroupSheetOpen(false);
    if (nextGroupId !== groupId) router.setParams({ group: nextGroupId });
  }
  function compose() {
    if (!selectedLocation || !currentUser || !canCreatePin) return;
    router.push({ pathname: '/posts/new', params: { lat: String(selectedLocation.lat), lng: String(selectedLocation.lng), placeName: selectedPlace?.name || '', address: selectedPlace?.address || '', group: groupId, origin: 'map' } });
  }
  function startPhotoRecord(assets: ImagePickerAsset[]) {
    clearSelection();
    setGroupSheetOpen(false);
    void photoRecord.start(assets);
  }
  function openPhotoForm(location: LatLng, source: PhotoRecordPrefill['source']) {
    const prefill = photoRecord.buildPrefill(location, source);
    if (!prefill) return;
    setPhotoRecordPrefill(prefill);
    router.push({ pathname: '/posts/new', params: { photo: '1', origin: 'map', group: groupId, lat: String(location.lat), lng: String(location.lng) } });
  }
  function photoBack() {
    if (photoFlow?.step === 'locate' && photoFlow.locateReason === 'adjust') photoRecord.returnToPhotoLocation();
    else closePhotoRecord();
  }

  const statusTop = !wide && selectedPlace && !photoFlow ? top + 48 + 8 : top;
  const statusLeft = wide && selectedPlace && !photoFlow ? edge + panelWidth + 12 : edge;
  const statusMessage = geo.error || groupError || error;
  return <KeyboardPane style={s.page} onLayout={event => setScreenHeight(event.nativeEvent.layout.height)}>
    <View style={[StyleSheet.absoluteFill, { bottom: mapBottom }]}>
      <NativeMap center={center} centerRevision={centerRevision} posts={shown} onSelect={selectPosts} onPick={pick}
        onRegionChange={location => { mapCenterRef.current = location; }} selected={photoFlow ? photoPinLocation : selectedLocation}
        selectedPhotoUri={photoPinLocation ? photoFlow?.items[0]?.photo.uri : undefined} selectedPostId={selectedPost?.id}
        currentLocation={geo.location || undefined} bottomInset={photoFlow || mapBottom ? 0 : bottom} />
    </View>

    {!photoFlow && <View pointerEvents="box-none" style={[m.status, { top: statusTop, left: statusLeft, right: edge + 52 + 12 }]}>
      {!!groupId && (!!group || catalog.loading) && <MapScopeChip group={group} loading={catalog.loading} onExit={() => router.setParams({ group: '' })} />}
      {!!currentUser && !!group && !joined && !catalog.loading && !catalog.error && <JoinGroupButton group={group} joined={false} compact />}
      {!!currentUser && controlsVisible && <MapPinLegend mineColors={myPinColors} othersLabel={groupId ? '그룹 멤버' : '팔로잉'} />}
      {!!catalog.error && !!currentUser && <Text accessibilityRole="alert" style={[m.message, m.messageError]}>{catalog.error}  <Text accessibilityRole="button" onPress={catalog.retry} style={m.link}>다시 시도</Text>{!!groupId && <Text accessibilityRole="link" onPress={() => router.setParams({ group: '' })} style={m.link}>  내 지도로</Text>}</Text>}
      {!!groupId && !!currentUser && !catalog.loading && !catalog.error && !group && <Text accessibilityRole="alert" style={m.message}>그룹을 찾을 수 없습니다.  <Text accessibilityRole="link" onPress={() => router.push('/groups')} style={m.link}>그룹 둘러보기</Text><Text accessibilityRole="link" onPress={() => router.setParams({ group: '' })} style={m.link}>  내 지도로</Text></Text>}
      {!!statusMessage && <Text accessibilityRole="alert" style={[m.message, m.messageError]}>{statusMessage}{!!groupError && <Text accessibilityRole="button" onPress={() => setRevision(value => value + 1)} style={m.link}>  다시 시도</Text>}</Text>}
      {!!profileError && <View style={{ gap: 8, alignSelf: 'stretch' }}><Notice error>{profileError}</Notice><Button title="다시 시도" variant="secondary" onPress={() => void refreshProfile().catch(() => undefined)} /></View>}
    </View>}

    {!!selectedPlace && !photoFlow && <MapSelectedPlaceField name={selectedPlace.name} onBack={openSearch} onClear={clearSelectedPlace}
      style={[m.selectedField, { top, left: edge }, wide ? { width: panelWidth } : { right: edge }]} />}
    {placeSheetOpen && !!selectedPlace && <MapPlacePanel key={selectedPlace.id} place={selectedPlace} groupId={groupId} canCreatePin={canCreatePin} loginFrom={loginFrom}
      sheet={!wide} onCreatePin={compose} onClose={() => { setSelectedLocation(null); setSelectedPlace(null); }}
      onLayout={event => { if (!wide) setPlaceSheetHeight(Math.ceil(event.nativeEvent.layout.height)); }}
      style={wide ? { top: top + 48 + 12, left: edge, width: panelWidth, maxHeight: Math.max(240, screenHeight - top - 60 - bottom) } : undefined} />}

    {!keyboardVisible && recordPromptOpen && <View accessibilityLabel="선택한 위치에 기록하기" style={[m.floating, m.record, elevation.menu, { bottom, left: edge }, wide ? { width: 430 } : { right: edge }]}>
      <View style={{ alignItems: 'flex-end' }}><IconButton label="선택한 위치 닫기" onPress={() => setSelectedLocation(null)}><X size={20} color={p.muted} /></IconButton></View>
      <Button title={groupId ? '이곳에 그룹 핀 남기기' : '이곳에 핀 남기기'} icon={<Plus size={18} color={p.paper} />} onPress={compose} />
    </View>}

    {(!!selectedPost || pinListOpen) && !photoFlow && <View style={[m.preview, elevation.menu, { bottom, maxHeight: keyboardVisible ? '72%' : width <= 620 ? '40%' : '60%' }, wide && { left: undefined, right: 18, width: 360 }]}>
      <FormScrollView keyboardSpaceAlreadyReserved contentContainerStyle={{ padding: 18, gap: 8 }}>
        <View style={m.close}><SubtleButton label={selectedPost ? '닫기' : '핀 목록 닫기'} onPress={() => { setSelectedPost(null); setCluster([]); }}><X size={18} color={p.muted} /></SubtleButton></View>
        {selectedPost ? <PinPreview post={selectedPost} onBack={cluster.length > 1 ? () => setSelectedPost(null) : undefined} /> : <>
          <Text accessibilityRole="header" style={m.previewTitle}>이 위치의 핀 {cluster.length}개</Text><Text style={m.small}>핀을 선택하면 정확한 위치를 볼 수 있어요.</Text>
          <View style={{ marginTop: 4 }}>{cluster.map((post, index) => <Pressable key={post.id} accessibilityRole="button" onPress={() => selectPost(post)} style={({ pressed }) => [m.listItem, index > 0 && m.listDivider, pressed && { backgroundColor: p.surface }]}>
            <Text style={m.listTitle}>{post.title}</Text><View style={[s.row, { gap: 4 }]}><MapPin size={14} color={p.ink} /><Text style={{ color: p.ink, fontSize: 14 }}>{post.placeName}</Text></View><Text style={m.small}>{post.address || post.lat.toFixed(5) + ', ' + post.lng.toFixed(5)}</Text><Text style={m.small}>{post.authorNickname} · {formatDateKey(post.dateKey)}</Text>
          </Pressable>)}</View>
        </>}
      </FormScrollView>
    </View>}

    {!!photoFlow && <>
      <PhotoRecordTopBar top={top} left={wide ? 18 : 12}
        title={photoFlow.step === 'reading' ? '사진 정보 읽기' : photoFlow.step === 'confirm' ? '핀 위치 확인' : photoFlow.locateReason === 'adjust' ? '핀 위치 조정' : '위치 직접 지정'}
        step="1 / 2" backLabel={photoFlow.step === 'locate' && photoFlow.locateReason === 'adjust' ? '사진 위치 확인으로 돌아가기' : '사진으로 기록 닫기'} onBack={photoBack} />
      {photoFlow.step === 'locate' && <PhotoCenterPin bottom={mapBottom} />}
      <PhotoRecordSheet flow={photoFlow} sheet={!wide} notice={photoRecord.error} locating={geo.loading} getSearchCenter={() => mapCenterRef.current}
        onLayout={event => { if (!wide) setPhotoSheetHeight(Math.ceil(event.nativeEvent.layout.height)); }}
        onConfirm={() => { if (photoFlow.summary?.location) openPhotoForm(photoFlow.summary.location, 'photo'); }}
        onAdjust={() => photoRecord.locate('adjust')} onReturnToPhotoLocation={photoRecord.returnToPhotoLocation}
        onPlaceHere={() => openPhotoForm(mapCenterRef.current, 'manual')}
        onUseCurrentLocation={() => { void geo.requestLocation().then(next => { if (next) focusMap(next); }); }}
        onSelectPlace={photoRecord.selectSearchedPlace} />
    </>}

    {controlsVisible && !keyboardVisible && <>
      <MapControlButton icon={Search} label="검색" accessibilityLabel="장소 검색" expanded={searchOpen} onPress={openSearch} style={[m.absolute, { top, right: edge }]} />
      <View style={[m.rail, { right: edge, bottom: showLauncher ? bottom + 56 + 12 : bottom }]} accessibilityLabel="지도 도구">
        {!!currentUser && <MapControlButton icon={Compass} label="그룹" accessibilityLabel="지도에 표시할 그룹 선택" expanded={groupSheetOpen} onPress={() => setGroupSheetOpen(true)} />}
        <MapControlButton icon={LocateFixed} label="내 위치" accessibilityLabel={geo.loading ? '현재 위치 확인 중' : '현재 위치로 이동'} busy={geo.loading} disabled={geo.loading} onPress={() => void moveToCurrentLocation()} />
      </View>
    </>}
    {showLauncher && !keyboardVisible && <PhotoRecordLauncher right={edge} bottom={bottom} error={photoRecord.error} hideTip={groupSheetOpen}
      onSelect={startPhotoRecord} onError={photoRecord.setError} />}

    {!!currentUser && <MapScopeSheet visible={groupSheetOpen && controlsVisible} groups={getMapScopeGroups(catalog.groups, catalog.joinedIds, groupId)} currentGroupId={groupId}
      loading={catalog.loading} error={catalog.error} right={edge} bottom={showLauncher ? bottom + 56 + 12 : bottom}
      onRetry={catalog.retry} onSelect={selectScope} onClose={() => setGroupSheetOpen(false)} />}
    <MapPlaceSearch visible={searchOpen} initialQuery={placeQuery} center={searchCenter} onClose={() => setSearchOpen(false)} onSelect={choosePlace} />
  </KeyboardPane>;
}
function SubtleButton({ label, onPress, children }: React.PropsWithChildren<{ label: string; onPress: () => void }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [m.subtle, pressed && { backgroundColor: p.surface }]}>{children}</Pressable>;
}
function PinPreview({ post, onBack }: { post: Post; onBack?: () => void }) {
  const [message, setMessage] = useState('');
  async function share() {
    try { await Share.share({ title: post.title, message: post.placeName + ' 핀을 공유합니다.\n' + (process.env.EXPO_PUBLIC_WEB_URL || 'https://www.pinori.kr').replace(/\/$/, '') + '/posts/' + post.id }); }
    catch { setMessage('공유하지 못했습니다. 다시 시도해 주세요.'); }
  }
  return <>
    {!!onBack && <Pressable accessibilityRole="button" onPress={onBack} style={{ alignSelf: 'flex-start', paddingBottom: 4 }}><Text style={{ color: p.primary, fontSize: 14 }}>← 핀 목록</Text></Pressable>}
    <Text accessibilityRole="header" style={m.previewTitle}>{post.title}</Text>
    <View style={[s.row, { gap: 7 }]}><MapPin size={15} color={p.muted} /><Text style={{ flex: 1, color: p.muted, fontSize: 15 }}>{post.placeName}</Text></View>
    <Text style={m.small}>{post.address || '주소가 등록되지 않은 위치입니다.'}</Text><Text style={m.small}>{post.lat.toFixed(5)}, {post.lng.toFixed(5)}</Text>
    <Pressable accessibilityRole="link" onPress={() => openLocationInMaps(post, post.placeName, setMessage)} style={[s.row, { gap: 6, alignSelf: 'flex-start', minHeight: 32 }]}><ExternalLink size={14} color={p.primary} /><Text style={m.mapLink}>지도에서 위치 열기</Text></Pressable>
    <View style={[s.row, { flexWrap: 'wrap', gap: 7, marginBottom: 6 }]}><View style={[s.row, { gap: 5 }]}><CalendarDays size={14} color={p.light} /><Text style={m.meta}>{formatDateKey(post.dateKey)}</Text></View><View style={[s.row, { gap: 5 }]}><UserRound size={14} color={p.light} /><Text style={m.meta}>{post.authorNickname}</Text></View></View>
    {!!message && <Text accessibilityLiveRegion="polite" style={m.small}>{message}</Text>}
    <DirectionsButton key={post.id} destination={post} placeName={post.placeName} />
    <PostInteractions key={post.id} post={post} />
    <View style={[s.row, { flexWrap: 'wrap' }]}><Button title="상세보기" onPress={() => router.push({ pathname: '/posts/[postId]', params: { postId: post.id } })} /><SubtleButton label="핀 공유" onPress={() => void share()}><Share2 size={19} color={p.muted} /></SubtleButton></View>
  </>;
}
const m = StyleSheet.create({
  absolute: { position: 'absolute' },
  status: { position: 'absolute', gap: 8, alignItems: 'flex-start' },
  message: { maxWidth: '100%', paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: p.line, borderRadius: 10, overflow: 'hidden', backgroundColor: p.paper, color: p.muted, fontSize: 13.6, lineHeight: 21, boxShadow: '0 4px 20px #19211D14' },
  messageError: { borderColor: '#9E232040', backgroundColor: p.errorSoft, color: p.danger },
  link: { color: p.primary, textDecorationLine: 'underline' },
  selectedField: { position: 'absolute' },
  rail: { position: 'absolute', gap: 8 },
  small: { fontSize: 13.8, lineHeight: 21, color: p.muted }, meta: { fontSize: 13.9, color: p.light },
  floating: { position: 'absolute', maxWidth: 430, padding: 14, gap: 14, backgroundColor: p.paper, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  record: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  preview: { position: 'absolute', left: 12, right: 12, maxWidth: 430, borderRadius: 6, backgroundColor: p.paper, overflow: 'hidden' },
  previewTitle: { paddingRight: 44, color: p.ink, fontSize: 19, lineHeight: 26, fontWeight: '600', letterSpacing: -0.5 }, close: { position: 'absolute', top: 10, right: 10, zIndex: 1 },
  subtle: { width: 44, height: 44, borderRadius: 6, borderWidth: 1, borderColor: p.line, backgroundColor: p.paper, alignItems: 'center', justifyContent: 'center' },
  mapLink: { color: p.primary, fontSize: 14.4, textDecorationLine: 'underline' },
  listItem: { paddingVertical: 14, paddingHorizontal: 4, gap: 6 }, listDivider: { borderTopWidth: 1, borderTopColor: p.line },
  listTitle: { color: p.ink, fontSize: 16, fontWeight: '600' },
});
