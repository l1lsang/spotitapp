import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, MapPin, Search, X } from 'lucide-react-native';
import { Text, TextInput } from '../Typography';
import { KeyboardPane } from '../keyboard';
import { p } from '../ui';
import { controlShadow } from './MapControls';
import type { LatLng, PlaceSearchResult } from '../../lib/mapLocation';
import { formatDistance, splitQueryMatch } from '../../lib/mapHelpers';
import { getDistanceMeters } from '../../lib/photoMetadata';
import { searchNativePlaces } from '../../lib/placeSearch';

const SEARCH_DELAY_MS = 300;

export function MapPlaceSearch({ visible, initialQuery, center, onClose, onSelect }: {
  visible: boolean; initialQuery: string; center: LatLng;
  onClose: () => void; onSelect: (place: PlaceSearchResult, query: string) => void;
}) {
  return <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
    {visible && <SearchPanel initialQuery={initialQuery} center={center} onClose={onClose} onSelect={onSelect} />}
  </Modal>;
}

function SearchPanel({ initialQuery, center, onClose, onSelect }: { initialQuery: string; center: LatLng; onClose: () => void; onSelect: (place: PlaceSearchResult, query: string) => void }) {
  const inputRef = useRef<TextInput>(null);
  const requestRef = useRef(0);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'done' | 'error'>(() => initialQuery.trim() ? 'searching' : 'idle');
  const [message, setMessage] = useState('');
  const { lat, lng } = center;

  const runSearch = useCallback(async (text: string) => {
    const requestId = ++requestRef.current;
    setStatus('searching'); setMessage('');
    try {
      const places = await searchNativePlaces(text, { lat, lng });
      if (requestId !== requestRef.current) return;
      setResults(places); setStatus('done');
    } catch (searchError) {
      if (requestId !== requestRef.current) return;
      setResults([]); setStatus('error');
      setMessage(searchError instanceof Error ? searchError.message : '장소 검색에 실패했습니다.');
    }
  }, [lat, lng]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { requestRef.current += 1; setResults([]); setStatus('idle'); setMessage(''); return; }
    const timer = setTimeout(() => void runSearch(trimmed), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  return <SafeAreaView style={ps.page} edges={['top', 'left', 'right']}>
    <KeyboardPane>
      <View style={ps.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="지도로 돌아가기" onPress={onClose} style={({ pressed }) => [ps.back, pressed && { backgroundColor: p.surface }]}><ChevronLeft size={22} color={p.ink} /></Pressable>
        <View style={ps.input}>
          <Search size={18} color={p.muted} />
          <TextInput ref={inputRef} autoFocus value={query} onChangeText={setQuery} onSubmitEditing={() => { if (query.trim()) void runSearch(query.trim()); }}
            placeholder="장소 이름이나 주소로 검색" placeholderTextColor={p.light} accessibilityLabel="장소 검색어" returnKeyType="search" autoCorrect={false} style={ps.inputText} />
          {!!query && <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => { setQuery(''); inputRef.current?.focus(); }} style={ps.clear}><View style={ps.clearDot}><X size={12} color={p.paper} strokeWidth={3} /></View></Pressable>}
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={ps.body} accessibilityLiveRegion="polite">
        {status === 'idle' && <Text style={ps.status}>장소 이름이나 주소로 찾아보세요.</Text>}
        {status === 'searching' && !results.length && <Text style={ps.status}>검색 중…</Text>}
        {status === 'error' && <Text accessibilityRole="alert" style={[ps.status, { color: p.danger }]}>{message}</Text>}
        {status === 'done' && !results.length && <Text style={ps.status}>검색 결과가 없어요.</Text>}
        {results.length > 0 && <>
          <Text style={ps.status}>검색 결과 {results.length}</Text>
          {results.map(place => {
            const { before, match, after } = splitQueryMatch(place.name, query);
            return <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`${place.name}, ${place.address}`} onPress={() => onSelect(place, query.trim())} style={({ pressed }) => [ps.result, pressed && { backgroundColor: p.primarySoft }]}>
              <View style={ps.resultIcon}><MapPin size={20} color={p.primary} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text numberOfLines={1} style={ps.resultName}>{before}{!!match && <Text style={{ color: p.primary }}>{match}</Text>}{after}</Text>
                {!!place.address && <Text numberOfLines={1} style={ps.resultAddress}>{place.address}</Text>}
              </View>
              <Text style={ps.distance}>{formatDistance(getDistanceMeters(center, place.location))}</Text>
            </Pressable>;
          })}
        </>}
        <Text style={ps.hint}>찾는 곳이 없다면 지도를 눌러 원하는 위치에 바로 핀을 남길 수 있어요.</Text>
      </ScrollView>
    </KeyboardPane>
  </SafeAreaView>;
}

// Selected search result: the query stays visible above the map.
export function MapSelectedPlaceField({ name, onBack, onClear, style }: { name: string; onBack: () => void; onClear: () => void; style?: object }) {
  return <View accessibilityLabel="선택한 장소" style={[ps.field, controlShadow, style]}>
    <Pressable accessibilityRole="button" accessibilityLabel="검색으로 돌아가기" onPress={onBack} style={({ pressed }) => [ps.fieldButton, pressed && { backgroundColor: p.surface }]}><ChevronLeft size={20} color={p.ink} /></Pressable>
    <Text numberOfLines={1} style={ps.fieldName}>{name}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="선택한 장소 지우기" onPress={onClear} style={({ pressed }) => [ps.fieldButton, pressed && { backgroundColor: p.surface }]}><X size={18} color={p.muted} /></Pressable>
  </View>;
}

const ps = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 12, paddingBottom: 12, paddingLeft: 8, paddingRight: 16, borderBottomWidth: 1, borderBottomColor: p.line, backgroundColor: p.paper, width: '100%', maxWidth: 640, alignSelf: 'center' },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingLeft: 14, paddingRight: 6, borderRadius: 12, backgroundColor: p.surface },
  inputText: { flex: 1, minWidth: 0, color: p.ink, fontSize: 16, paddingVertical: 10 },
  clear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  clearDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: p.light },
  body: { paddingTop: 8, paddingBottom: 24, width: '100%', maxWidth: 640, alignSelf: 'center' },
  status: { paddingVertical: 8, paddingHorizontal: 20, color: p.muted, fontSize: 13, fontWeight: '500' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 20 },
  resultIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: p.surface },
  resultName: { color: p.ink, fontSize: 15, fontWeight: '700' },
  resultAddress: { color: p.muted, fontSize: 12 },
  distance: { flexShrink: 0, color: p.light, fontSize: 12 },
  hint: { paddingVertical: 16, paddingHorizontal: 20, color: p.muted, fontSize: 12, lineHeight: 19 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 48, paddingHorizontal: 2, borderWidth: 1, borderColor: p.line, borderRadius: 14, backgroundColor: p.paper },
  fieldButton: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  fieldName: { flex: 1, minWidth: 0, color: p.ink, fontSize: 15, fontWeight: '500' },
});
