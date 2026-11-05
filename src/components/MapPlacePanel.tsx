import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Text, TextInput } from './Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Check, MapPin, MessageCircle, SendHorizontal, X } from 'lucide-react-native';
import { FormScrollView } from './keyboard';
import { Dialog } from './Dialog';
import { MinimizedSheetRow, SheetGrip } from './map/SheetGrip';
import { Button, IconButton, Notice, elevation, p } from './ui';
import { useAuth } from '../hooks/useAuth';
import { formatRelativeTime } from '../lib/date';
import type { NativePlace } from '../lib/placeSearch';
import { createLivePlaceStatus, subscribePlaceStatusUpdates } from '../services/mapFeatureService';
import { LIVE_PLACE_STATUS_OPTIONS, type LivePlaceStatusKey, type LivePlaceStatusUpdate } from '../types/mapFeature';

const statusLabels = new Map<string, string>(LIVE_PLACE_STATUS_OPTIONS.map(option => [option.id, option.label]));

// One selected place connects pins, recent reviews and the review form. The parent keys it by place ID.
// A bottom sheet on phones and a floating panel on wider screens.
export function MapPlacePanel({ place, groupId, canCreatePin, loginFrom, sheet, onCreatePin, onClose, onLayout, style }: {
  place: NativePlace; groupId: string; canCreatePin: boolean; loginFrom: string; sheet: boolean;
  onCreatePin: () => void; onClose: () => void; onLayout?: (event: LayoutChangeEvent) => void; style?: StyleProp<ViewStyle>;
}) {
  const { currentUser, profile, accountReady: firebaseReady } = useAuth();
  const insets = useSafeAreaInsets();
  const viewerUid = currentUser?.uid;
  const [updates, setUpdates] = useState<LivePlaceStatusUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [writing, setWriting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const small = sheet && minimized;
  const [tags, setTags] = useState<LivePlaceStatusKey[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const pending = useRef(false);
  const counts = useMemo(() => LIVE_PLACE_STATUS_OPTIONS.map(option => ({ ...option, count: updates.filter(update => update.tags.includes(option.id)).length })).filter(option => option.count > 0), [updates]);

  useEffect(() => {
    if (!firebaseReady || !viewerUid) { setUpdates([]); setLoading(false); return; }
    let active = true;
    setLoading(true); setLoadError('');
    const unsubscribe = subscribePlaceStatusUpdates(place.id, next => { if (active) { setUpdates(next); setLoading(false); } }, () => {
      if (active) { setLoadError('리뷰를 불러오지 못했습니다. 다시 시도해 주세요.'); setLoading(false); }
    });
    return () => { active = false; unsubscribe(); };
  }, [place.id, viewerUid, firebaseReady, revision]);

  async function submitReview() {
    if (pending.current || !currentUser || !profile || !firebaseReady) return;
    if (!tags.length) { setSubmitError('장소 상태를 하나 이상 선택해 주세요.'); return; }
    pending.current = true; setSubmitting(true); setSubmitError(''); setMessage('');
    try {
      await createLivePlaceStatus({ placeId: place.id, placeName: place.name, address: place.address, lat: place.location.lat, lng: place.location.lng, tags, note },
        { uid: currentUser.uid, nickname: profile.nickname });
      setTags([]); setNote(''); setWriting(false); setMessage('리뷰를 남겼습니다.');
    } catch { setSubmitError('리뷰를 올리지 못했습니다. 내용을 확인하고 다시 시도해 주세요.'); }
    finally { pending.current = false; setSubmitting(false); }
  }

  return <View accessibilityLabel={place.name + ' 장소 패널'} onLayout={onLayout} style={[pp.panel, sheet ? pp.sheet : [pp.floating, elevation.dialog], style]}>
    <FormScrollView keyboardSpaceAlreadyReserved keyboardShouldPersistTaps="handled" contentContainerStyle={[pp.content, sheet && { paddingTop: 10, paddingHorizontal: 20, paddingBottom: Math.max(24, insets.bottom) }]}>
      {sheet && <SheetGrip minimized={minimized} onChange={setMinimized} label="장소 패널" />}
      {small ? <MinimizedSheetRow title={place.name} detail={place.address || '주소 정보 없음'} leading={<MapPin size={18} color={p.primary} />} onExpand={() => setMinimized(false)}
        trailing={<IconButton label="선택한 장소 닫기" disabled={submitting} onPress={onClose}><X size={20} color={p.muted} /></IconButton>} />
      : <View style={pp.header}>
        <View style={{ flex: 1, minWidth: 0 }}><Text accessibilityRole="header" style={pp.title}>{place.name}</Text><Text style={pp.address}>{place.address || '주소 정보 없음'}</Text></View>
        <IconButton label="선택한 장소 닫기" disabled={submitting} onPress={onClose}><X size={20} color={p.muted} /></IconButton>
      </View>}
      {small ? null : currentUser ? <>
        <View accessibilityLabel="이 장소에서 할 일" style={pp.actions}>
          <Button title={groupId ? '그룹 핀 남기기' : '핀 남기기'} icon={<MapPin size={17} color={p.paper} />} disabled={!canCreatePin || !firebaseReady} onPress={onCreatePin} style={pp.action} />
          <Button title="리뷰 남기기" variant="secondary" icon={<MessageCircle size={17} color={p.ink} />} disabled={!firebaseReady || !profile || submitting} onPress={() => { setWriting(true); setMessage(''); setSubmitError(''); }} style={pp.action} />
        </View>
        {!canCreatePin && <Text style={pp.help}>그룹 정보를 확인하고 가입한 뒤 핀을 남길 수 있어요.</Text>}
        {!firebaseReady && <Text accessibilityLiveRegion="polite" style={pp.help}>연결을 확인한 뒤 핀과 리뷰를 남길 수 있어요.</Text>}
        {/* The composer is a dialog: a bottom sheet pinned with position absolute does not
            follow the keyboard, so its text field would sit behind the keyboard. */}
        <Dialog visible={writing} title="리뷰 남기기" busy={submitting} onClose={() => setWriting(false)}>
          <Text style={pp.address}>{place.name}</Text>
          <Text style={pp.legend}>지금 이곳은 어떤가요?</Text>
          <View style={pp.options}>{LIVE_PLACE_STATUS_OPTIONS.map(option => {
            const checked = tags.includes(option.id);
            return <Pressable key={option.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: submitting }} disabled={submitting}
              onPress={() => setTags(previous => previous.includes(option.id) ? previous.filter(tag => tag !== option.id) : [...previous, option.id])} style={pp.option}>
              {({ pressed }) => <><View style={[pp.checkbox, checked && pp.checked]}>{checked && <Check size={12} strokeWidth={3} color={p.paper} />}</View><Text style={[pp.optionText, pressed && { color: p.primary }, submitting && { color: p.muted }]}>{option.label}</Text></>}
            </Pressable>;
          })}</View>
          <View style={{ gap: 6 }}>
            <Text style={pp.label}>한줄 리뷰 <Text style={pp.optional}>선택</Text></Text>
            <TextInput accessibilityLabel="한줄 리뷰" value={note} editable={!submitting} onChangeText={setNote} placeholder="예: 2층 창가에 자리가 있어요" placeholderTextColor={p.light} multiline maxLength={300} textAlignVertical="top" style={pp.textarea} />
          </View>
          {!!submitError && <Notice error>{submitError}</Notice>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="취소" variant="secondary" disabled={submitting} onPress={() => setWriting(false)} style={{ flex: 1 }} />
            <Button title={submitting ? '올리는 중…' : '리뷰 올리기'} icon={<SendHorizontal size={17} color={p.paper} />} disabled={submitting || !tags.length} onPress={() => void submitReview()} style={{ flex: 2 }} />
          </View>
        </Dialog>
        {!!message && <Text accessibilityLiveRegion="polite" style={pp.success}>{message}</Text>}
        <View style={pp.section}>
          <View style={pp.sectionHeading}>
            <Text accessibilityRole="header" style={pp.sectionTitle}>실시간 리뷰</Text>
            {!loading && !loadError && updates.length > 0 && <Text style={pp.count}>{updates.length}</Text>}
          </View>
          {loading ? <Text style={pp.state}>리뷰를 불러오는 중…</Text>
            : loadError ? <Notice error>{loadError} <Text accessibilityRole="button" onPress={() => setRevision(value => value + 1)} style={pp.retry}>다시 시도</Text></Notice>
            : !firebaseReady ? <Text style={pp.state}>연결을 확인해 주세요.</Text>
            : updates.length ? <>
              <View accessibilityLabel="장소 상태 요약" style={pp.summary}>{counts.map(option => <View key={option.id} style={pp.summaryItem}><Text style={pp.summaryText}>{option.label}</Text><Text style={pp.summaryCount}>{option.count}</Text></View>)}</View>
              <View>{updates.slice(0, 6).map((update, index) => <View key={update.id} style={[pp.feedItem, index > 0 && pp.feedDivider]}>
                <View style={pp.feedHeader}><Text style={pp.author}>{update.authorNickname}</Text><Text style={pp.time}>{formatRelativeTime(update.createdAt)}</Text></View>
                <Text style={pp.labels}>{update.tags.map(tag => statusLabels.get(tag) || tag).join(' · ')}</Text>
                {!!update.note && <Text style={pp.note}>{update.note}</Text>}
              </View>)}</View>
            </> : <Text style={pp.state}>아직 리뷰가 없어요. 이곳의 첫 리뷰를 남겨보세요.</Text>}
        </View>
        <Text style={pp.help}>리뷰는 그룹과 관계없이 모든 사용자에게 공개돼요.</Text>
      </> : <View style={pp.login}>
        <Text style={pp.loginText}>로그인하고 이 장소에 핀과 리뷰를 남겨보세요.</Text>
        <Button title="로그인" onPress={() => router.push({ pathname: '/login', params: { from: loginFrom } })} style={{ alignSelf: 'flex-start' }} />
      </View>}
    </FormScrollView>
  </View>;
}

const pp = StyleSheet.create({
  panel: { position: 'absolute', backgroundColor: p.paper, overflow: 'hidden' },
  floating: { borderRadius: 12 },
  sheet: { left: 0, right: 0, bottom: 0, maxHeight: '62%', borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: '0 -6px 24px #161F1B29' },
  content: { padding: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { color: p.ink, fontSize: 20, lineHeight: 27, fontWeight: '700', letterSpacing: -0.5 },
  address: { marginTop: 2, color: p.muted, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 48, paddingHorizontal: 12 },
  help: { color: p.muted, fontSize: 12, lineHeight: 19 },
  form: { gap: 12 },
  legend: { color: p.ink, fontSize: 14, fontWeight: '500' },
  options: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 },
  option: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: p.light, alignItems: 'center', justifyContent: 'center' },
  checked: { borderColor: p.primary, backgroundColor: p.primary },
  optionText: { flexShrink: 1, color: p.ink, fontSize: 14 },
  label: { color: p.ink, fontSize: 14, fontWeight: '500' }, optional: { color: p.muted, fontSize: 12, fontWeight: '400' },
  textarea: { minHeight: 72, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: p.transparent, backgroundColor: p.surface, color: p.ink, fontSize: 15, lineHeight: 22 },
  success: { color: p.primary, fontSize: 14 },
  section: { gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { color: p.ink, fontSize: 16, fontWeight: '700' },
  count: { paddingHorizontal: 7, borderRadius: 999, overflow: 'hidden', color: p.primary, backgroundColor: p.primarySoft, fontSize: 12, lineHeight: 19, fontWeight: '700' },
  retry: { color: p.muted, fontSize: 13, fontWeight: '600' },
  state: { color: p.muted, fontSize: 14, lineHeight: 22 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: p.surface },
  summaryText: { color: p.ink, fontSize: 12, fontWeight: '500' }, summaryCount: { color: p.primary, fontSize: 12, fontWeight: '700' },
  feedItem: { paddingVertical: 12, gap: 2 }, feedDivider: { borderTopWidth: 1, borderTopColor: p.line },
  feedHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  author: { color: p.ink, fontSize: 14, fontWeight: '700' }, time: { color: p.light, fontSize: 12 },
  labels: { color: p.primary, fontSize: 13, fontWeight: '500' },
  note: { color: p.ink, fontSize: 13, lineHeight: 21 },
  login: { gap: 12 }, loginText: { color: p.ink, fontSize: 14, lineHeight: 22 },
});
