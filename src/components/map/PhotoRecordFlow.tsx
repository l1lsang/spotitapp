import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  CalendarDays, Check, ChevronLeft, ImageIcon, ImagePlus, LocateFixed, MapPin, MapPinOff, Move, Search, ShieldCheck, Sparkles, Undo2, X,
} from 'lucide-react-native';
import { Text, TextInput } from '../Typography';
import { Button, IconButton, Notice, elevation, p } from '../ui';
import { formatClockTime, formatDateKey, formatDateKeyWithWeekday } from '../../lib/date';
import type { LatLng, PlaceSearchResult } from '../../lib/mapLocation';
import type { PhotoTakenAt } from '../../lib/photoMetadata';
import { searchNativePlaces } from '../../lib/placeSearch';
import { ensureMediaLocationAccess, wasMediaLocationDenied } from '../../lib/mediaLocationPermission';
import { PHOTO_RECORD_MAX_FILES, useNearbyPlaces, type PhotoRecordFlowState } from '../../hooks/usePhotoRecordFlow';
import { MinimizedSheetRow, SheetGrip } from './SheetGrip';

const TIP_STORAGE_KEY = 'spotit:photo-record-tip-seen';

function formatTakenAt(takenAt: PhotoTakenAt): string {
  return `${formatDateKeyWithWeekday(takenAt.dateKey)} ${formatClockTime(takenAt.time)}`;
}

// The FAB takes the bottom-right corner; its first-use tip sits to the left, pointing at it.
export function PhotoRecordLauncher({ right, bottom, disabled = false, hideTip = false, error = '', onSelect, onError }: {
  right: number; bottom: number; disabled?: boolean; hideTip?: boolean; error?: string;
  onSelect: (assets: ImagePicker.ImagePickerAsset[]) => void; onError: (message: string) => void;
}) {
  const [tipSeen, setTipSeen] = useState(true);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(TIP_STORAGE_KEY).then(value => { if (active) setTipSeen(value === '1'); }, () => { if (active) setTipSeen(false); });
    return () => { active = false; };
  }, []);

  async function openPicker() {
    if (picking) return;
    if (!tipSeen) {
      setTipSeen(true);
      // The tip simply shows again next time when storage is unavailable.
      AsyncStorage.setItem(TIP_STORAGE_KEY, '1').catch(() => undefined);
    }
    setPicking(true);
    try {
      // A refusal still lets the user pick; they place the pin by hand instead.
      await ensureMediaLocationAccess();
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: PHOTO_RECORD_MAX_FILES, quality: 1, exif: true });
      if (!result.canceled && result.assets.length) onSelect(result.assets);
    } catch { onError('사진을 불러오지 못했습니다. 다시 시도해 주세요.'); }
    finally { setPicking(false); }
  }

  return <View pointerEvents="box-none" style={[r.launcher, { right, bottom }]}>
    {error ? <View accessibilityRole="alert" style={[r.tip, r.tipError]}><Text style={[r.tipText, { color: p.danger }]}>{error}</Text><View style={[r.tipArrow, { borderLeftColor: p.errorSoft }]} /></View>
      : !tipSeen && !hideTip && <View style={r.tip}><Sparkles size={14} color={p.paper} /><Text style={r.tipText}>사진만 올리면 위치·날짜가 자동으로 채워져요</Text><View style={r.tipArrow} /></View>}
    <Pressable accessibilityRole="button" accessibilityLabel="사진으로 기록" accessibilityState={{ disabled: disabled || picking, busy: picking }} disabled={disabled || picking} onPress={() => void openPicker()}
      style={({ pressed }) => [r.fab, (pressed || picking) && { backgroundColor: p.primaryHover }, disabled && { opacity: 0.6 }]}>
      {picking ? <ActivityIndicator size="small" color={p.paper} /> : <ImagePlus size={19} color={p.paper} />}
      <Text style={r.fabText}>사진으로 기록</Text>
    </Pressable>
  </View>;
}

export function PhotoRecordTopBar({ title, step, backLabel, onBack, top, left }: { title: string; step: string; backLabel: string; onBack: () => void; top: number; left: number }) {
  return <View pointerEvents="box-none" style={[r.topbar, { top, left, right: left }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={({ pressed }) => [r.topbarBack, elevation.menu, pressed && { backgroundColor: p.primarySoft }]}><ChevronLeft size={22} color={p.ink} /></Pressable>
    <View style={[r.topbarTitle, elevation.menu]}><Text numberOfLines={1} style={r.topbarStrong}>{title}</Text><Text style={r.topbarStep}>{step}</Text></View>
  </View>;
}

// The fixed pin marks the map center; the map moves underneath it.
export function PhotoCenterPin({ bottom }: { bottom: number }) {
  // A zero-height row on the center line: the pin's tail tip sits exactly on it.
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom }]}>
    <View style={r.centerLine}>
      <View style={r.centerShadow} />
      <View style={r.centerPin}>
        <View style={r.centerTip}><Move size={14} color={p.paper} /><Text style={r.centerTipText}>지도를 움직여 핀 위치를 맞춰주세요</Text></View>
        <Svg width={40} height={50} viewBox="0 0 40 50">
          <Path d="M20 0C9 0 0 8.7 0 19.5 0 33.5 20 50 20 50s20-16.5 20-30.5C40 8.7 31 0 20 0z" fill={p.primary} />
          <Circle cx={20} cy={19.5} r={7} fill={p.paper} />
        </Svg>
      </View>
    </View>
  </View>;
}

export function PhotoRecordSheet({ flow, sheet, notice, locating, getSearchCenter, onLayout, onConfirm, onAdjust, onReturnToPhotoLocation, onPlaceHere, onUseCurrentLocation, onSelectPlace }: {
  flow: PhotoRecordFlowState; sheet: boolean; notice?: string; locating: boolean; getSearchCenter: () => LatLng;
  onLayout?: (event: LayoutChangeEvent) => void; onConfirm: () => void; onAdjust: () => void; onReturnToPhotoLocation: () => void;
  onPlaceHere: () => void; onUseCurrentLocation: () => void; onSelectPlace: (place: PlaceSearchResult) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [minimized, setMinimized] = useState(false);
  const small = sheet && minimized;
  const smallTitle = flow.step === 'reading' ? '사진 정보를 읽고 있어요' : flow.step === 'confirm' ? '사진 위치에 핀을 남길까요?' : '핀 위치를 맞춰주세요';
  const smallDetail = flow.step === 'locate' ? '지도를 움직여 핀을 맞춘 뒤 펼쳐서 확인해 주세요' : `사진 ${flow.items.length}장`;
  return <View accessibilityLabel="사진으로 기록" onLayout={onLayout}
    style={[r.sheet, sheet ? r.sheetPhone : [r.sheetWide, elevation.dialog, { width: Math.min(420, width - 36) }]]}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[r.sheetContent, sheet && { paddingTop: 10, paddingHorizontal: 20, paddingBottom: Math.max(28, insets.bottom) }]}>
      {sheet && <SheetGrip minimized={minimized} onChange={setMinimized} label="사진 기록" />}
      {small && <MinimizedSheetRow title={smallTitle} detail={smallDetail} onExpand={() => setMinimized(false)}
        leading={<Image source={{ uri: flow.items[0].photo.uri }} style={r.smallThumb} />} />}
      {!small && !!notice && <Notice error>{notice}</Notice>}
      {!small && flow.step === 'reading' && <ReadingContent flow={flow} />}
      {!small && flow.step === 'confirm' && <ConfirmContent flow={flow} onAdjust={onAdjust} onConfirm={onConfirm} />}
      {!small && flow.step === 'locate' && <LocateContent key={flow.locateReason} flow={flow} getSearchCenter={getSearchCenter} locating={locating}
        onPlaceHere={onPlaceHere} onUseCurrentLocation={onUseCurrentLocation} onReturnToPhotoLocation={onReturnToPhotoLocation} onSelectPlace={onSelectPlace} />}
    </ScrollView>
  </View>;
}

function ReadingContent({ flow }: { flow: PhotoRecordFlowState }) {
  const done = flow.items.filter(item => item.metadata).length;
  return <>
    <View style={r.heading}>
      <Text accessibilityRole="header" style={r.title}>사진 정보를 읽고 있어요</Text>
      <Text style={r.description}>사진 속 위치와 촬영 날짜를 찾는 중이에요.</Text>
    </View>
    <View style={r.progress}>
      <View accessibilityRole="progressbar" accessibilityLabel="사진 정보 읽기" accessibilityValue={{ min: 0, max: flow.items.length, now: done }} style={r.progressTrack}>
        <View style={[r.progressFill, { width: `${(done / flow.items.length) * 100}%` }]} />
      </View>
      <Text style={r.progressText}>{done} / {flow.items.length}</Text>
    </View>
    <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>{flow.items.map(item => <View key={item.id} style={r.readRow}>
      <Image source={{ uri: item.photo.uri }} style={r.readThumb} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={r.readName}>{item.photo.name || '선택한 사진'}</Text>
        {item.metadata ? <View style={r.readMeta}>
          <View style={r.readMetaItem}>{item.metadata.location ? <MapPin size={12} color={p.primary} /> : <MapPinOff size={12} color={p.primary} />}<Text style={r.small}>{item.metadata.location ? '위치 있음' : '위치 없음'}</Text></View>
          <View style={r.readMetaItem}><CalendarDays size={12} color={p.primary} /><Text style={r.small}>{item.metadata.takenAt ? `${formatDateKey(item.metadata.takenAt.dateKey).slice(5)} ${formatClockTime(item.metadata.takenAt.time)}` : '날짜 없음'}</Text></View>
        </View> : <Text style={[r.small, { color: p.light, marginTop: 2 }]}>위치 · 날짜 읽는 중…</Text>}
      </View>
      {item.metadata ? <View accessibilityLabel="읽기 완료" style={r.readDone}><Check size={15} color={p.primary} /></View> : <ActivityIndicator accessibilityLabel="읽는 중" size="small" color={p.light} />}
    </View>)}</View>
    <View style={r.privacy}><ShieldCheck size={16} color={p.primary} style={{ marginTop: 1 }} /><Text style={r.privacyText}>사진 속 위치 정보는 핀을 찍는 데만 쓰여요. 사진을 올릴 때 원본의 위치 정보는 지워져요.</Text></View>
  </>;
}

function ConfirmContent({ flow, onAdjust, onConfirm }: { flow: PhotoRecordFlowState; onAdjust: () => void; onConfirm: () => void }) {
  const summary = flow.summary;
  const location = summary?.location ?? null;
  const nearby = useNearbyPlaces(location);
  const nearest = nearby.places[0];
  const count = flow.items.length;
  const photoNote = summary?.distantPhotoCount
    ? `${summary.distantPhotoCount}장은 다른 장소에서 찍은 사진이에요. 대표 사진 위치로 기록돼요.`
    : summary?.missingLocationCount
      ? `${summary.missingLocationCount}장은 위치 정보가 없어 대표 사진의 위치를 사용해요.`
      : count > 1 ? '모든 사진이 같은 장소에서 찍혔어요.' : '이 사진의 위치로 기록돼요.';
  return <>
    <View style={r.heading}>
      <View style={r.chip}><Sparkles size={12} color={p.primary} /><Text style={r.chipText}>사진에서 찾았어요</Text></View>
      <Text accessibilityRole="header" style={r.title}>이 장소에 핀을 찍을까요?</Text>
    </View>
    <View style={r.detected}>
      <View style={r.detectedRow}>
        <View style={r.detectedIcon}><MapPin size={18} color={p.primary} /></View>
        <View accessibilityLiveRegion="polite" style={r.detectedText}>
          <Text style={r.detectedStrong}>{nearby.loading ? '주변 장소를 찾는 중…' : nearest?.name || '사진을 찍은 위치'}</Text>
          <Text style={r.small}>{nearest?.address || (location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : '')}</Text>
        </View>
      </View>
      <View style={[r.detectedRow, r.detectedDivider]}>
        <View style={r.detectedIcon}><CalendarDays size={18} color={p.primary} /></View>
        <View style={r.detectedText}>
          <Text style={r.detectedStrong}>{summary?.takenAt ? formatTakenAt(summary.takenAt) : '촬영 날짜 정보 없음'}</Text>
          <Text style={r.small}>{summary?.takenAt ? count > 1 ? '사진 촬영일 · 이 장소에서 가장 먼저 찍은 시간' : '사진 촬영일' : '오늘 날짜로 기록돼요. 기록 작성에서 바꿀 수 있어요.'}</Text>
        </View>
      </View>
      <View style={[r.detectedRow, r.detectedDivider]}>
        <View style={r.detectedIcon}><ImageIcon size={18} color={p.primary} /></View>
        <View style={r.detectedText}><Text style={r.detectedStrong}>사진 {count}장</Text><Text style={r.small}>{photoNote}</Text></View>
        <View style={r.thumbStack}>{flow.items.slice(0, 3).map((item, index) => <Image key={item.id} source={{ uri: item.photo.uri }} style={[r.stackThumb, index > 0 && { marginLeft: -14 }]} />)}</View>
      </View>
    </View>
    <View style={r.actions}>
      <Button title="위치 조정" variant="secondary" icon={<Move size={17} color={p.ink} />} onPress={onAdjust} style={[r.action, { flex: 1 }]} />
      <Button title="이 위치로 기록하기" icon={<Check size={17} color={p.paper} />} onPress={onConfirm} style={[r.action, { flex: 1.6 }]} />
    </View>
  </>;
}

function LocateContent({ flow, getSearchCenter, locating, onPlaceHere, onUseCurrentLocation, onReturnToPhotoLocation, onSelectPlace }: {
  flow: PhotoRecordFlowState; getSearchCenter: () => LatLng; locating: boolean; onPlaceHere: () => void;
  onUseCurrentLocation: () => void; onReturnToPhotoLocation: () => void; onSelectPlace: (place: PlaceSearchResult) => void;
}) {
  const missing = flow.locateReason === 'missing';
  const takenAt = flow.summary?.takenAt;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [message, setMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const requestRef = useRef(0);

  function resetResults() { requestRef.current += 1; setResults([]); setMessage(''); setSearching(false); }

  async function search() {
    const requestId = ++requestRef.current;
    if (!query.trim()) { resetResults(); return; }
    setSearching(true); setMessage('');
    try {
      const places = await searchNativePlaces(query, getSearchCenter());
      if (requestId !== requestRef.current) return;
      setResults(places.slice(0, 5)); setMessage(places.length ? '' : '검색 결과가 없습니다.');
    } catch (searchError) {
      if (requestId !== requestRef.current) return;
      setResults([]); setMessage(searchError instanceof Error ? searchError.message : '장소 검색에 실패했습니다.');
    } finally { if (requestId === requestRef.current) setSearching(false); }
  }

  return <>
    {missing ? <View style={r.missingHeading}>
      <Image source={{ uri: flow.items[0].photo.uri }} style={r.missingThumb} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={[r.chip, { backgroundColor: p.coralSoft }]}><MapPinOff size={12} color={p.coral} /><Text style={[r.chipText, { color: p.coral }]}>위치 정보 없음</Text></View>
        <Text accessibilityRole="header" style={r.title}>{flow.items.length > 1 ? '사진에 위치 정보가 없어요' : '이 사진엔 위치 정보가 없어요'}</Text>
      </View>
    </View> : <Text accessibilityRole="header" style={r.title}>핀 위치를 맞춰주세요</Text>}
    <Text style={r.description}>{missing
      ? wasMediaLocationDenied()
        ? '사진 위치 정보 접근을 허용하지 않아 촬영 위치를 읽지 못했어요. 설정에서 허용하거나, 장소를 검색하거나 지도를 움직여 핀을 찍어주세요.'
        : '메신저로 받은 사진이나 캡처 이미지는 위치 정보가 지워져 있을 수 있어요. 장소를 검색하거나 지도를 움직여 핀을 찍어주세요.'
      : '지도를 움직여 핀을 정확한 위치에 맞추거나 장소를 검색해 주세요.'}</Text>
    {missing && wasMediaLocationDenied() ? <Pressable accessibilityRole="link" onPress={() => void Linking.openSettings().catch(() => undefined)} style={({ pressed }) => [{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
      <Text style={{ color: p.primary, fontSize: 14, fontWeight: '600' }}>앱 설정 열기</Text>
    </Pressable> : null}
    <View style={r.search}>
      <Search size={18} color={p.muted} />
      <TextInput value={query} onChangeText={value => { resetResults(); setQuery(value); }} onSubmitEditing={() => void search()} returnKeyType="search"
        placeholder="장소 이름이나 주소로 검색" placeholderTextColor={p.light} accessibilityLabel="장소 이름이나 주소로 검색" style={r.searchInput} />
      {!!query && <IconButton label="검색어 지우기" onPress={() => { resetResults(); setQuery(''); }}><X size={16} color={p.muted} /></IconButton>}
    </View>
    {(searching || !!message || results.length > 0) && <View accessibilityLiveRegion="polite" style={r.results}>
      {searching ? <Text style={r.resultsState}>검색 중…</Text>
        : message ? <Text style={r.resultsState}>{message}</Text>
        : results.map((place, index) => <Pressable key={place.id} accessibilityRole="button" onPress={() => { resetResults(); setQuery(place.name); onSelectPlace(place); }}
          style={({ pressed }) => [r.result, index > 0 && r.resultDivider, pressed && { backgroundColor: p.primarySoft }]}>
          <Text style={r.resultName}>{place.name}</Text><Text numberOfLines={1} style={r.small}>{place.address}</Text>
        </Pressable>)}
    </View>}
    {missing && <View style={r.dateNote}>
      <CalendarDays size={18} color={p.primary} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={r.dateNoteStrong}>{takenAt ? '날짜는 사진 촬영일로 입력돼요' : '사진에 촬영 날짜가 없어요'}</Text>
        <Text style={[r.small, { color: p.ink }]}>{takenAt ? formatTakenAt(takenAt) : '오늘 날짜로 입력되고, 기록 작성에서 바꿀 수 있어요.'}</Text>
      </View>
    </View>}
    <View style={r.actions}>
      {missing
        ? <Button title={locating ? '확인 중…' : '현재 위치'} variant="secondary" icon={<LocateFixed size={17} color={p.ink} />} disabled={locating} onPress={onUseCurrentLocation} style={[r.action, { flex: 1 }]} />
        : <Button title="사진 위치로" variant="secondary" icon={<Undo2 size={17} color={p.ink} />} onPress={onReturnToPhotoLocation} style={[r.action, { flex: 1 }]} />}
      <Button title="여기에 핀 찍기" icon={<MapPin size={17} color={p.paper} />} onPress={onPlaceHere} style={[r.action, { flex: 1.6 }]} />
    </View>
  </>;
}

const r = StyleSheet.create({
  launcher: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 12 },
  fab: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingLeft: 18, paddingRight: 22, borderRadius: 999, backgroundColor: p.primary, boxShadow: '0 6px 18px #161F1B42' },
  fabText: { color: p.paper, fontSize: 16, fontWeight: '700' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 172, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: p.ink, boxShadow: '0 4px 12px #161F1B2E' },
  tipError: { maxWidth: 220, backgroundColor: p.errorSoft },
  tipText: { flexShrink: 1, color: p.paper, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  tipArrow: { position: 'absolute', right: -6, top: '50%', marginTop: -6, width: 0, height: 0, borderTopWidth: 6, borderBottomWidth: 6, borderLeftWidth: 6, borderTopColor: p.transparent, borderBottomColor: p.transparent, borderLeftColor: p.ink },
  topbar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  topbarBack: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: p.paper },
  topbarTitle: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: p.paper },
  topbarStrong: { flexShrink: 1, color: p.ink, fontSize: 14, fontWeight: '700' }, topbarStep: { color: p.muted, fontSize: 12, fontWeight: '500' },
  centerLine: { position: 'absolute', top: '50%', left: 0, right: 0, height: 0, alignItems: 'center' },
  centerPin: { position: 'absolute', bottom: 0, alignItems: 'center', gap: 8 },
  centerTip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: p.ink, boxShadow: '0 4px 12px #161F1B2E' },
  centerTipText: { color: p.paper, fontSize: 12, fontWeight: '500' },
  centerShadow: { position: 'absolute', top: -3, width: 16, height: 6, borderRadius: 8, backgroundColor: '#161F1B40' },
  sheet: { position: 'absolute', backgroundColor: p.paper, overflow: 'hidden' },
  sheetPhone: { left: 0, right: 0, bottom: 0, maxHeight: '72%', borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: '0 -6px 24px #161F1B29' },
  sheetWide: { left: 18, bottom: 24, maxHeight: '85%', borderRadius: 12 },
  sheetContent: { padding: 24, gap: 16 },
  smallThumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: p.surface },
  heading: { gap: 6 },
  title: { color: p.ink, fontSize: 20, lineHeight: 27, fontWeight: '700', letterSpacing: -0.5 },
  description: { color: p.muted, fontSize: 14, lineHeight: 22 },
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: p.primarySoft },
  chipText: { color: p.primary, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressTrack: { flex: 1, height: 6, overflow: 'hidden', borderRadius: 3, backgroundColor: p.surface },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: p.primary },
  progressText: { color: p.muted, fontSize: 12, fontWeight: '500' },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  readThumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: p.surface },
  readName: { color: p.ink, fontSize: 14, fontWeight: '600' },
  readMeta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 4, marginTop: 2 },
  readMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readDone: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primarySoft },
  small: { color: p.muted, fontSize: 12, lineHeight: 18 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 8, backgroundColor: p.surface },
  privacyText: { flex: 1, color: p.muted, fontSize: 12, lineHeight: 19 },
  detected: { borderWidth: 1, borderColor: p.line, borderRadius: 10 },
  detectedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  detectedDivider: { borderTopWidth: 1, borderTopColor: p.line },
  detectedIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primarySoft },
  detectedText: { flex: 1, minWidth: 0, gap: 2 },
  detectedStrong: { color: p.ink, fontSize: 15, fontWeight: '700' },
  thumbStack: { flexDirection: 'row', flexShrink: 0 },
  stackThumb: { width: 32, height: 32, borderWidth: 2, borderColor: p.paper, borderRadius: 6, backgroundColor: p.surface },
  actions: { flexDirection: 'row', gap: 8 },
  action: { minHeight: 48, paddingHorizontal: 12 },
  missingHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  missingThumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: p.surface },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 14, paddingRight: 4, borderRadius: 6, backgroundColor: p.surface },
  searchInput: { flex: 1, minWidth: 0, color: p.ink, fontSize: 16, paddingVertical: 10 },
  results: { maxHeight: 220, overflow: 'hidden', borderWidth: 1, borderColor: p.line, borderRadius: 8 },
  resultsState: { paddingVertical: 12, paddingHorizontal: 14, color: p.muted, fontSize: 14 },
  result: { gap: 2, paddingVertical: 12, paddingHorizontal: 14 }, resultDivider: { borderTopWidth: 1, borderTopColor: p.line },
  resultName: { color: p.ink, fontSize: 14, fontWeight: '600' },
  dateNote: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, backgroundColor: p.primarySoft },
  dateNoteStrong: { color: p.primary, fontSize: 13, fontWeight: '700' },
});
