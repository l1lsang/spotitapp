import { useEffect, useRef, useState } from "react";
import { useNearbyPlaces } from "../hooks/usePhotoRecordFlow";
import { emitMapRecordEvent, readPhotoRecordPrefill, setPhotoRecordPrefill, type PhotoRecordPrefill } from "../lib/photoRecordBridge";
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { RemoteImage } from '../components/RemoteImage';
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Dialog } from '../components/Dialog';
import { PinThemeEditor } from '../components/PinThemeEditor';
import { PhotoEditor } from "../components/PhotoEditor";
import {
  Camera,
  Check,
  ChevronDown,
  Crop,
  ImagePlus,
  MapPin,
  MapPinOff,
  Save,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react-native";
import {
  Button,
  Field,
  IconButton,
  Notice,
  p,
  QuietSurface,
  s,
  Screen,
  SearchBox,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { formatClockTime, getTodayDateKey } from "../lib/date";
import { isValidLocation } from "../lib/mapLocation";
import { searchNativePlaces, type NativePlace } from "../lib/placeSearch";
import { createPost, getPostById, updatePost } from "../services/postService";
import { subscribeMyGroupIds, subscribeGroup } from "../services/groupService";
import {
  hasLocationConsent,
  saveLocationConsent,
} from "../services/consentService";
import {
  DEFAULT_POST_PIN_COLOR,
  FOLLOWING_PIN_COLOR,
  FOLLOWING_PIN_COLOR_ERROR,
  parsePinColorCode,
  type PostFormInput,
} from "../types/post";
import type { PinGroup } from "../types/group";
import type { UploadPhoto } from "../services/storageService";
const PLACE_NAME_MAX_LENGTH = 50;
export default function PostFormScreen() {
  const params = useLocalSearchParams<{
    postId?: string;
    lat?: string;
    lng?: string;
    placeName?: string;
    address?: string;
    group?: string;
    photo?: string;
    origin?: string;
  }>();
  const { currentUser, profile } = useAuth();
  const { width } = useWindowDimensions();
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  // A photo record arrives from the map with its photos, position and capture date.
  const [photoPrefill] = useState<PhotoRecordPrefill | null>(() => params.photo === "1" && !params.postId ? readPhotoRecordPrefill() : null);
  const [form, setForm] = useState<PostFormInput>({
    title: "",
    content: "",
    placeName: photoPrefill?.place?.name.slice(0, PLACE_NAME_MAX_LENGTH) || params.placeName || "",
    address: photoPrefill?.place?.address || params.address || "",
    lat: photoPrefill?.location.lat ?? Number(params.lat),
    lng: photoPrefill?.location.lng ?? Number(params.lng),
    dateKey: photoPrefill?.takenAt?.dateKey || getTodayDateKey(),
    visibility: "followers",
    groupId: params.group || "",
    pinColor: DEFAULT_POST_PIN_COLOR,
    pinThemeId: "",
  });
  const [photos, setPhotos] = useState<UploadPhoto[]>(() => photoPrefill?.files || []);
  const [existing, setExisting] = useState<string[]>([]);
  const [groups, setGroups] = useState<Record<string, PinGroup>>({});
  const [loading, setLoading] = useState(Boolean(params.postId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editingExisting, setEditingExisting] = useState<string | null>(null);
  const saveLock = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<NativePlace[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);
  const nearby = useNearbyPlaces(photoPrefill ? photoPrefill.location : null);
  const nearestPlace = nearby.places[0];
  // The bridge only carries the photos to this screen; a later visit starts clean.
  useEffect(() => () => { if (photoPrefill) setPhotoRecordPrefill(null); }, [photoPrefill]);
  // The nearest place fills empty fields once; anything the user typed stays.
  useEffect(() => {
    if (!nearestPlace) return;
    setForm((previous) => previous.placeName || previous.address ? previous : {
      ...previous,
      placeName: nearestPlace.name.slice(0, PLACE_NAME_MAX_LENGTH),
      address: nearestPlace.address,
    });
  }, [nearestPlace]);
  useEffect(() => {
    let active = true;
    if (!params.postId || !currentUser) return;
    getPostById(params.postId, currentUser.uid)
      .then((post) => {
        if (!active) return;
        if (!post || post.uid !== currentUser.uid)
          throw new Error("수정할 수 있는 기록이 아닙니다.");
        setForm({
          title: post.title,
          content: post.content,
          placeName: post.placeName,
          address: post.address,
          lat: post.lat,
          lng: post.lng,
          dateKey: post.dateKey,
          visibility: post.visibility,
          groupId: post.groupId || "",
          pinColor: post.pinColor,
          pinThemeId: post.pinThemeId || "",
        });
        setExisting(post.photoUrls);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [params.postId, currentUser]);
  useEffect(() => {
    if (!currentUser) return;
    let stops: (() => void)[] = [];
    const unsubscribe = subscribeMyGroupIds(
      currentUser.uid,
      (ids) => {
        stops.forEach((stop) => stop());
        setGroups({});
        stops = ids.map((id) =>
          subscribeGroup(
            id,
            (group) => {
              if (group) setGroups((old) => ({ ...old, [id]: group }));
            },
            (e) => setError(e.message),
          ),
        );
      },
      (e) => setError(e.message),
    );
    return () => {
      unsubscribe();
      stops.forEach((stop) => stop());
    };
  }, [currentUser]);
  function update<K extends keyof PostFormInput>(
    key: K,
    value: PostFormInput[K],
  ) {
    setForm((old) => ({ ...old, [key]: value }));
  }
  async function pickPhoto(camera = false) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted)
          throw new Error("사진 촬영을 위해 카메라 권한을 허용해 주세요.");
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            selectionLimit: 0,
            quality: 1,
          });
      if (!result.canceled)
        setPhotos((old) =>
          [
            ...old,
            ...result.assets.map((asset) => ({
              uri: asset.uri,
              width: asset.width,
              height: asset.height,
              mimeType: asset.mimeType,
              name: asset.fileName || undefined,
              size: asset.fileSize,
            })),
          ],
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 불러오지 못했습니다.");
    }
  }

  async function save() {
    if (!currentUser || saveLock.current) return;
    setError("");
    if (!form.title.trim() || !form.placeName.trim()) {
      setError("제목과 장소 이름을 입력해 주세요.");
      return;
    }
    if (!photoPrefill && !form.content.trim()) {
      setError("메모를 입력해 주세요.");
      return;
    }
    if (!isValidLocation(form)) {
      setError("장소 검색 또는 지도에서 위치를 선택해 주세요.");
      return;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(form.dateKey) ||
      Number.isNaN(Date.parse(form.dateKey)) ||
      new Date(`${form.dateKey}T12:00:00Z`).toISOString().slice(0, 10) !==
        form.dateKey
    ) {
      setError("올바른 날짜를 입력해 주세요.");
      return;
    }
    if (!form.pinThemeId && !parsePinColorCode(form.pinColor)) {
      setError("올바른 HEX 색상 코드를 입력해 주세요.");
      return;
    }
    if (!form.pinThemeId && parsePinColorCode(form.pinColor) === FOLLOWING_PIN_COLOR) {
      setError(FOLLOWING_PIN_COLOR_ERROR);
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      if (!(await hasLocationConsent(currentUser.uid))) {
        const consent = await new Promise<boolean>((resolve) =>
          Alert.alert(
            "위치기반서비스 이용 동의",
            "장소 좌표를 기록에 저장합니다. 위치기반서비스 이용약관을 확인하고 동의해 주세요.",
            [
              {
                text: "약관 보기",
                onPress: () => {
                  router.push("/policies/location");
                  resolve(false);
                },
              },
              { text: "취소", style: "cancel", onPress: () => resolve(false) },
              { text: "동의", onPress: () => resolve(true) },
            ],
          ),
        );
        if (!consent) return;
        await saveLocationConsent(currentUser.uid, true);
      }
      const input = {
        ...form,
        title: form.title.trim(),
        content: form.content.trim(),
        placeName: form.placeName.trim(),
        pinColor: parsePinColorCode(form.pinColor) || DEFAULT_POST_PIN_COLOR,
      };
      if (params.postId) {
        await updatePost(
          params.postId,
          input,
          existing,
          photos,
          currentUser.uid,
        );
        router.replace(`/posts/${params.postId}`);
      } else {
        const id = await createPost(input, photos, {
          uid: currentUser.uid,
          nickname: profile?.nickname || "사용자",
        });
        if (params.origin === "map" && router.canGoBack()) {
          // The map closes the photo flow, centers on the new pin and refreshes its records.
          emitMapRecordEvent({ kind: "created", location: { lat: input.lat, lng: input.lng }, groupId: input.groupId || "", photo: Boolean(photoPrefill) });
          router.back();
        } else router.replace(`/posts/${id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "기록을 저장하지 못했습니다.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  const groupHint = form.groupId
    ? groups[form.groupId]?.visibility === "private" || form.visibility === "group"
      ? "비공개 그룹의 핀은 그룹 멤버만 볼 수 있어요."
      : "공개 그룹의 핀은 모든 로그인 사용자에게 공개돼요."
    : "가입한 그룹을 선택하면 멤버들과 핀을 함께 모을 수 있어요.";
  const groupLocked = saving || (!!params.group && !params.postId);
  const formWidth = Math.min(width, 688) - 32;
  const columns = Math.max(1, Math.floor((formWidth + 10) / 140));
  const tile = (formWidth - (columns - 1) * 10) / columns;
  function runSearch() {
    if (!search.trim()) return;
    setSearching(true);
    setSearchError("");
    void searchNativePlaces(search)
      .then(setResults)
      .catch((e) => setSearchError(e.message))
      .finally(() => { setSearching(false); setSearched(true); });
  }
  const takenAt = photoPrefill?.takenAt;
  const placeFromSuggestion = nearby.places.some(place => place.name.slice(0, PLACE_NAME_MAX_LENGTH) === form.placeName);
  const photoUploader = (
    <View style={f.uploader}>
      <View style={s.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="사진 선택" disabled={saving} onPress={() => void pickPhoto()} style={({ pressed }) => [f.dropzone, { flex: 1 }, pressed && f.dropzonePressed]}><ImagePlus size={22} color={p.muted} /><Text style={f.dropzoneText}>사진 선택</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="카메라로 촬영" disabled={saving} onPress={() => void pickPhoto(true)} style={({ pressed }) => [f.dropzone, { width: 96 }, pressed && f.dropzonePressed]}><Camera size={22} color={p.muted} /><Text style={f.dropzoneText}>촬영</Text></Pressable>
      </View>
      <Text style={f.hint}>사진을 선택하면 자르기·회전 편집을 할 수 있어요.</Text>
      {(existing.length > 0 || photos.length > 0) && <View style={f.previews}>
        {existing.map(uri => <View key={uri} style={{ width: tile, height: tile }}>
          <Pressable accessibilityLabel="등록된 사진 편집" disabled={saving} onPress={() => setEditingExisting(uri)}><RemoteImage uri={uri} accessibilityLabel="등록된 장소 사진" style={[f.previewImage, { width: tile, height: tile }]} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="사진 제거" disabled={saving} onPress={() => setExisting(old => old.filter(item => item !== uri))} hitSlop={8} style={f.previewRemove}><X size={16} color={p.paper} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="등록된 사진 편집" disabled={saving} onPress={() => setEditingExisting(uri)} style={f.previewEdit}><Crop size={14} color={p.paper} /><Text style={f.previewEditText}>편집</Text></Pressable>
        </View>)}
        {photos.map((photo, index) => <View key={photo.uri} style={{ width: tile, height: tile }}>
          <Pressable accessibilityLabel="사진 편집" disabled={saving} onPress={() => setEditing(index)}><Image source={{ uri: photo.uri }} accessibilityLabel={photo.name || "선택한 사진"} style={[f.previewImage, { width: tile, height: tile }]} /></Pressable>
          {!!photoPrefill && (photoPrefill.source === "photo" && photo.uri === photoPrefill.files[0]?.uri
            ? <View pointerEvents="none" style={f.badge}><Star size={11} color={p.paper} /><Text style={f.badgeText}>대표</Text></View>
            : photoPrefill.filesWithoutLocation.some(item => item.uri === photo.uri) ? <View pointerEvents="none" style={f.badge}><MapPinOff size={11} color={p.paper} /><Text style={f.badgeText}>위치 없음</Text></View> : null)}
          <Pressable accessibilityRole="button" accessibilityLabel="선택한 사진 제거" disabled={saving} onPress={() => setPhotos(old => old.filter((_, item) => item !== index))} hitSlop={8} style={f.previewRemove}><X size={16} color={p.paper} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={(photo.name || "선택한 사진") + " 편집"} disabled={saving} onPress={() => setEditing(index)} style={f.previewEdit}><Crop size={14} color={p.paper} /><Text style={f.previewEditText}>편집</Text></Pressable>
        </View>)}
      </View>}
    </View>
  );
  if (loading)
    return (
      <Screen title="기록 불러오기" back>
        <ActivityIndicator color={p.primary} />
      </Screen>
    );
  // The web form is a dialog; here it fills the screen but keeps the dialog's quiet fields and actions.
  return (
    <Screen safeTop maxWidth={688}>
      <QuietSurface.Provider value>
      <View style={[s.between, { alignItems: "flex-start" }]}>
        <Text accessibilityRole="header" style={f.title}>{params.postId ? "장소 기록 수정" : photoPrefill ? "사진으로 기록하기" : "오늘의 장소를 남겨요"}</Text>
        <IconButton label="닫기" disabled={saving} onPress={() => router.back()}><X size={20} color={p.muted} /></IconButton>
      </View>
      {!!photoPrefill && <>
        {photoUploader}
        <View accessibilityLabel="기록 위치" style={f.locationSummary}>
          <MapPin size={18} color={p.primary} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text style={f.locationStrong}>{photoPrefill.source === "photo" ? "사진을 찍은 위치" : "지도에서 고른 위치"}</Text>
            <Text style={f.hint}>좌표 {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => { emitMapRecordEvent({ kind: "change-location" }); router.back(); }} style={f.textAction}><Text style={f.textActionText}>위치 변경</Text></Pressable>
        </View>
      </>}
      <View style={f.field}>
        <Text style={f.label}>핀을 모을 곳</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={"핀을 모을 곳, " + (form.groupId ? groups[form.groupId]?.name || "선택한 그룹" : "개인 기록")} accessibilityState={{ disabled: groupLocked }} disabled={groupLocked} onPress={() => setGroupPickerOpen(true)} style={[s.input, s.between, f.select, groupLocked && { opacity: 0.6 }]}>
          <Text numberOfLines={1} style={{ flex: 1, color: p.ink, fontSize: 16 }}>{form.groupId ? groups[form.groupId]?.name || "선택한 그룹" : "개인 기록"}</Text>
          <ChevronDown size={16} color={p.muted} />
        </Pressable>
        <Text style={f.hint}>{groupHint}</Text>
      </View>
      <Field label="제목" placeholder="예: 햇살 좋았던 점심 산책" value={form.title} onChangeText={text => update("title", text)} maxLength={60} editable={!saving} />
      <View style={f.field}>
        <View style={f.labelRow}>
          <Text style={f.label}>장소 이름</Text>
          {!!photoPrefill && placeFromSuggestion && <View style={f.chip}><Sparkles size={11} color={p.primary} /><Text style={f.chipText}>주변 장소 추천</Text></View>}
        </View>
        <Field accessibilityLabel="장소 이름" placeholder="예: 서울시청 앞 광장" value={form.placeName} onChangeText={text => update("placeName", text)} maxLength={PLACE_NAME_MAX_LENGTH} editable={!saving} />
        {!!photoPrefill && (nearby.loading || nearby.places.length > 0) && <View accessibilityLabel="사진 위치 주변 장소" style={f.suggestions}>
          {nearby.loading ? <Text style={f.hint}>주변 장소를 찾는 중…</Text> : nearby.places.slice(0, 5).map(place => {
            const name = place.name.slice(0, PLACE_NAME_MAX_LENGTH);
            const selected = form.placeName === name;
            return <Pressable key={place.id} accessibilityRole="button" accessibilityState={{ selected, disabled: saving }} disabled={saving}
              onPress={() => setForm(previous => ({ ...previous, placeName: name, address: place.address }))}
              style={[f.suggestion, selected && f.suggestionActive]}>
              <Text style={[f.suggestionText, selected && { color: p.primary, fontWeight: "600" }]}>{name}</Text>
            </Pressable>;
          })}
        </View>}
      </View>
      <Field label="주소 또는 위치 설명" placeholder="정확한 주소를 몰라도 괜찮아요" value={form.address} onChangeText={text => update("address", text)} editable={!saving} />
      {!isValidLocation(form) && <Button title="장소 검색" variant="secondary" tone="plain" icon={<Search size={17} color={p.ink} />} onPress={() => setSearchOpen(true)} />}
      <View style={[f.formRow, width > 620 && { flexDirection: "row" }]}>
        <View style={[f.field, { flex: width > 620 ? 1 : undefined }]}>
          <View style={f.labelRow}>
            <Text style={f.label}>날짜</Text>
            {!!takenAt && form.dateKey === takenAt.dateKey && <View style={f.chip}><Camera size={11} color={p.primary} /><Text style={f.chipText}>사진 촬영일</Text></View>}
          </View>
          <Field accessibilityLabel="날짜" value={form.dateKey} onChangeText={text => update("dateKey", text)} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation" editable={!saving} />
          {!!photoPrefill && <Text style={f.hint}>{takenAt ? `사진을 찍은 날로 자동 입력됐어요 (${formatClockTime(takenAt.time)}).` : "사진에 촬영 날짜가 없어 오늘 날짜를 넣었어요."}</Text>}
        </View>
        <View style={[f.field, { flex: width > 620 ? 1 : undefined }]}>
          <Text style={f.label}>공개 범위</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="공개 범위 선택" style={f.segmented}>
            {(["followers", "public", "private"] as const).map(value => {
              const selected = form.visibility === value;
              return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: selected, selected, disabled: !!form.groupId || saving }} disabled={!!form.groupId || saving} onPress={() => update("visibility", value)} style={[f.segment, selected && f.segmentActive, !!form.groupId && { opacity: 0.5 }]}>
                <Text numberOfLines={1} style={[f.segmentText, selected && { color: p.primary }]}>{value === "followers" ? "팔로워" : value === "public" ? "전체" : "비공개"}</Text>
              </Pressable>;
            })}
          </View>
          {!!photoPrefill && <Text style={f.hint}>사진 위치가 집 근처라면 공개 범위를 한 번 더 확인해 주세요.</Text>}
        </View>
      </View>
      <PinThemeEditor value={form} onChange={selection => setForm(previous => ({ ...previous, ...selection }))} />
      <View style={f.field}>
        <Text style={f.label}>메모{!!photoPrefill && <Text style={f.optional}> 선택</Text>}</Text>
        <Field accessibilityLabel="메모" placeholder={photoPrefill ? "어떤 순간이었나요? 메모 없이 사진만으로도 저장할 수 있어요." : "그 장소에서 남기고 싶은 장면과 마음을 적어주세요"} value={form.content} onChangeText={text => update("content", text)} multiline editable={!saving} style={{ minHeight: 130 }} />
      </View>
      {!photoPrefill && photoUploader}
      {!photoPrefill && isValidLocation(form) && <Text style={f.coordinate}>좌표 {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</Text>}
      <Notice error>{error}</Notice>
      <View style={f.actions}>
        <Button title="취소" variant="secondary" disabled={saving} onPress={() => router.back()} style={{ flex: 1 }} />
        <Button title={saving ? "저장 중" : photoPrefill ? "핀 찍고 기록 저장" : "저장하기"} icon={photoPrefill ? <MapPin size={17} color={p.paper} /> : <Save size={17} color={p.paper} />} loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
      </View>
      <Dialog visible={groupPickerOpen} title="핀을 모을 곳" onClose={() => setGroupPickerOpen(false)}>
        <View accessibilityRole="radiogroup">
          <Choice label="개인 기록" selected={!form.groupId} onPress={() => { setForm(old => ({ ...old, groupId: "", visibility: "followers" })); setGroupPickerOpen(false); }} />
          {Object.values(groups).map(group => <Choice key={group.id} label={group.name} detail={group.visibility === "private" ? "비공개 그룹" : "공개 그룹"} selected={form.groupId === group.id} onPress={() => { setForm(old => ({ ...old, groupId: group.id, visibility: group.visibility === "private" ? "group" : "public" })); setGroupPickerOpen(false); }} />)}
        </View>
        <Text style={f.hint}>가입한 그룹을 선택하면 멤버들과 핀을 함께 모을 수 있어요.</Text>
      </Dialog>
      <PhotoEditor
        photo={editingExisting ? {uri: editingExisting} : editing !== null ? photos[editing] || null : null}
        onClose={() => {setEditing(null);setEditingExisting(null);}}
        onSave={(photo) => {
          if(editingExisting){setExisting(old=>old.filter(uri=>uri!==editingExisting));setPhotos(old=>[...old,photo]);}
          else setPhotos((old) => old.map((item, index) => (index === editing ? photo : item)));
          setEditing(null);
          setEditingExisting(null);
        }}
      />
      <Modal
        visible={searchOpen}
        animationType="slide"
        onRequestClose={() => setSearchOpen(false)}
      >
        <Screen
          safeTop
          title="장소 검색"
          right={<IconButton label="장소 검색 닫기" onPress={() => setSearchOpen(false)}><X size={20} color={p.muted} /></IconButton>}
        >
          <SearchBox
            accessibilityLabel="장소 검색"
            placeholder="도로명 주소 또는 장소"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={runSearch}
          />
          <Button title="검색" loading={searching} disabled={!search.trim()} onPress={runSearch} />
          <Notice error>{searchError}</Notice>
          {!searching && searched && !results.length && !searchError && <Text style={f.hint}>검색 결과가 없습니다.</Text>}
          <View>
            {results.map((place) => (
              <Pressable
                key={place.id}
                accessibilityRole="button"
                onPress={() => {
                  setForm((old) => ({
                    ...old,
                    placeName: place.name,
                    address: place.address,
                    ...place.location,
                  }));
                  setSearchOpen(false);
                }}
                style={({ pressed }) => [f.result, pressed && { backgroundColor: p.surface }]}
              >
                <Text style={f.resultTitle}>{place.name}</Text>
                <Text numberOfLines={1} style={f.hint}>{place.address}</Text>
              </Pressable>
            ))}
          </View>
        </Screen>
      </Modal>
      </QuietSurface.Provider>
    </Screen>
  );
}

// A quiet checked row: the selection is carried by text color and a check, not a filled button.
function Choice({ label, detail, selected, onPress }: { label: string; detail?: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [f.choice, pressed && { backgroundColor: p.surface }]}>
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text numberOfLines={1} style={[f.choiceText, selected && { color: p.primary }]}>{label}</Text>
      {!!detail && <Text style={f.hint}>{detail}</Text>}
    </View>
    {selected && <Check size={18} color={p.primary} />}
  </Pressable>;
}

const f = StyleSheet.create({
  title: { flex: 1, color: p.ink, fontSize: 25, lineHeight: 34, fontWeight: "600", letterSpacing: -0.9, paddingTop: 4 },
  field: { gap: 7 }, label: { fontSize: 14, fontWeight: "500", color: p.ink },
  select: { borderColor: p.transparent, backgroundColor: p.surface },
  hint: { color: p.muted, fontSize: 12, lineHeight: 19 },
  formRow: { gap: 12 },
  segmented: { flexDirection: "row", gap: 4, padding: 4, minHeight: 48, borderRadius: 6, backgroundColor: p.surface },
  segment: { flex: 1, minWidth: 0, minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 4 },
  segmentActive: { backgroundColor: p.paper }, segmentText: { color: p.muted, fontSize: 14, fontWeight: "600" },
  uploader: { gap: 12 },
  dropzone: { minHeight: 78, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderStyle: "dashed", borderColor: p.line, borderRadius: 6, backgroundColor: p.surface },
  dropzonePressed: { borderColor: p.primary }, dropzoneText: { color: p.muted, fontSize: 14, fontWeight: "600" },
  previews: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  previewImage: { borderRadius: 6, backgroundColor: p.surface },
  previewRemove: { position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#161F1BB8" },
  previewEdit: { position: "absolute", bottom: 6, left: 6, minHeight: 32, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: "#161F1BB8" },
  previewEditText: { color: p.paper, fontSize: 12.5, fontWeight: "500" },
  coordinate: { color: p.muted, fontSize: 13.8 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  optional: { color: p.muted, fontSize: 12, fontWeight: "400" },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: p.primarySoft },
  chipText: { color: p.primary, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  locationSummary: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingLeft: 14, paddingRight: 12, borderRadius: 8, backgroundColor: p.primarySoft },
  locationStrong: { color: p.ink, fontSize: 14, fontWeight: "600" },
  textAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  textActionText: { color: p.primary, fontSize: 13, textDecorationLine: "underline" },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestion: { minHeight: 34, justifyContent: "center", paddingVertical: 4, paddingHorizontal: 12, borderWidth: 1, borderColor: p.line, borderRadius: 999, backgroundColor: p.paper },
  suggestionActive: { borderColor: p.primary, backgroundColor: p.primarySoft },
  suggestionText: { color: p.ink, fontSize: 13, fontWeight: "500" },
  badge: { position: "absolute", top: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, backgroundColor: "#161F1BB8" },
  badgeText: { color: p.paper, fontSize: 11, fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 8 },
  choice: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 6 },
  choiceText: { color: p.ink, fontSize: 15, fontWeight: "500" },
  result: { gap: 4, paddingVertical: 13, paddingHorizontal: 4, borderRadius: 6 },
  resultTitle: { color: p.ink, fontSize: 15, fontWeight: "600" },
});
