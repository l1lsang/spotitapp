import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { PhotoEditor } from "../components/PhotoEditor";
import {
  Camera,
  Images,
} from "lucide-react-native";
import {
  Button,
  Chip,
  Field,
  Notice,
  p,
  Row,
  s,
  Screen,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { getTodayDateKey } from "../lib/date";
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
  PIN_COLOR_PALETTE,
  parsePinColorCode,
  type PostFormInput,
} from "../types/post";
import type { PinGroup } from "../types/group";
import type { UploadPhoto } from "../services/storageService";
export default function PostFormScreen() {
  const params = useLocalSearchParams<{
    postId?: string;
    lat?: string;
    lng?: string;
    placeName?: string;
    address?: string;
    group?: string;
  }>();
  const { currentUser, profile } = useAuth();
  const [form, setForm] = useState<PostFormInput>({
    title: "",
    content: "",
    placeName: params.placeName || "",
    address: params.address || "",
    lat: Number(params.lat),
    lng: Number(params.lng),
    dateKey: getTodayDateKey(),
    visibility: "followers",
    groupId: params.group || "",
    pinColor: DEFAULT_POST_PIN_COLOR,
    pinThemeId: "",
  });
  const [photos, setPhotos] = useState<UploadPhoto[]>([]);
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
    if (!parsePinColorCode(form.pinColor)) {
      setError("올바른 HEX 색상 코드를 입력해 주세요.");
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
        pinColor: parsePinColorCode(form.pinColor)!,
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
        router.replace(`/posts/${id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "기록을 저장하지 못했습니다.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  if (loading)
    return (
      <Screen title="기록 불러오기" back>
        <ActivityIndicator color={p.primary} />
      </Screen>
    );
  return (
    <Screen title={params.postId ? "기록 수정" : "오늘의 장소를 남겨요"} back>
      <Text style={s.muted}>
        사진과 글로 남긴 오늘이, 나만의 지도가 됩니다.
      </Text>
      <Field
        label="제목"
        placeholder="오늘의 순간을 한 줄로"
        value={form.title}
        onChangeText={(text) => update("title", text)}
        maxLength={100}
      />
      <Field
        label="기록"
        placeholder="이곳에서의 이야기를 남겨보세요."
        value={form.content}
        onChangeText={(text) => update("content", text)}
        multiline
        maxLength={5000}
      />
      <View style={s.between}>
        <Text style={{ fontWeight: "600", color: p.ink }}>
          사진 {photos.length + existing.length}장
        </Text>
        <View style={s.row}>
          <Pressable
            accessibilityLabel="카메라로 촬영"
            onPress={() => void pickPhoto(true)}
            style={{ padding: 10 }}
          >
            <Camera size={22} color={p.primary} />
          </Pressable>
          <Pressable
            accessibilityLabel="앨범에서 선택"
            onPress={() => void pickPhoto()}
            style={{ padding: 10 }}
          >
            <Images size={22} color={p.primary} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
      >
        {existing.map((uri) => (
          <View key={uri}>
            <Pressable accessibilityLabel="등록된 사진 편집" onPress={() => setEditingExisting(uri)}>
              <Image source={{ uri }} style={{ width: 120, height: 140, borderRadius: 14 }} />
            </Pressable>
            <Button
              title="삭제"
              variant="secondary"
              onPress={() =>
                setExisting((old) => old.filter((item) => item !== uri))
              }
            />
          </View>
        ))}
        {photos.map((photo, index) => (
          <View key={photo.uri}>
            <Pressable
              accessibilityLabel="사진 편집"
              onPress={() => setEditing(index)}
            >
              <Image
                source={{ uri: photo.uri }}
                style={{ width: 120, height: 140, borderRadius: 14 }}
              />
            </Pressable>
            <Button
              title="삭제"
              variant="secondary"
              onPress={() =>
                setPhotos((old) => old.filter((_, i) => i !== index))
              }
            />
          </View>
        ))}
      </ScrollView>
      <Field
        label="장소 이름"
        value={form.placeName}
        onChangeText={(text) => update("placeName", text)}
        placeholder="어디에서 남긴 기록인가요?"
      />
      <Field
        label="주소"
        value={form.address}
        onChangeText={(text) => update("address", text)}
      />
      <Button
        title="장소 검색"
        variant="secondary"
        onPress={() => setSearchOpen(true)}
      />
      {isValidLocation(form) && (
        <Text style={s.muted}>
          선택한 위치 {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
        </Text>
      )}
      <Field
        label="기록 날짜"
        value={form.dateKey}
        onChangeText={(text) => update("dateKey", text)}
        placeholder="YYYY-MM-DD"
        maxLength={10}
      />
      <Text style={{ fontWeight: "600", color: p.ink }}>핀을 모을 곳</Text>
      <View style={{ ...s.row, flexWrap: "wrap" }}>
        <Chip
          label="개인 기록"
          selected={!form.groupId}
          onPress={() =>
            setForm((old) => ({ ...old, groupId: "", visibility: "followers" }))
          }
        />
        {Object.values(groups).map((group) => (
          <Chip
            key={group.id}
            label={group.name}
            selected={form.groupId === group.id}
            onPress={() =>
              setForm((old) => ({
                ...old,
                groupId: group.id,
                visibility: group.visibility === "private" ? "group" : "public",
              }))
            }
          />
        ))}
      </View>
      {!form.groupId && (
        <>
          <Text style={{ fontWeight: "600", color: p.ink }}>공개 범위</Text>
          <View style={s.row}>
            <Chip
              label="팔로워 공개"
              selected={form.visibility === "followers"}
              onPress={() => update("visibility", "followers")}
            />
            <Chip
              label="나만 보기"
              selected={form.visibility === "private"}
              onPress={() => update("visibility", "private")}
            />
          </View>
        </>
      )}
      <Text style={{ fontWeight: "600", color: p.ink }}>핀 색상 · 테마</Text>
      <View style={{ ...s.row, flexWrap: "wrap" }}>
        {PIN_COLOR_PALETTE.map((color) => (
          <Pressable
            key={color.color}
            accessibilityLabel={color.name}
            accessibilityState={{ selected: form.pinColor === color.color }}
            onPress={() =>
              setForm((old) => ({
                ...old,
                pinColor: color.color,
                pinThemeId: "",
              }))
            }
            style={{
              width: 39,
              height: 39,
              borderRadius: 20,
              backgroundColor: color.color,
              borderWidth: form.pinColor === color.color ? 4 : 1,
              borderColor: form.pinColor === color.color ? p.ink : p.line,
            }}
          />
        ))}
      </View>
      <Field
        label="직접 색상 입력"
        value={form.pinColor}
        onChangeText={(value) =>
          setForm((old) => ({ ...old, pinColor: value, pinThemeId: "" }))
        }
        autoCapitalize="none"
        maxLength={7}
      />
      <View style={{ ...s.row, flexWrap: "wrap" }}>
        {profile?.pinThemes?.map((theme) => (
          <Chip
            key={theme.id}
            label={theme.name}
            selected={form.pinThemeId === theme.id}
            onPress={() =>
              setForm((old) => ({
                ...old,
                pinThemeId: theme.id,
                pinColor: theme.color,
              }))
            }
          />
        ))}
      </View>
      <Notice error>{error}</Notice>
      <Button title="기록 저장" loading={saving} onPress={() => void save()} />
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
          title="장소 검색"
          right={
            <Button
              title="닫기"
              variant="secondary"
              onPress={() => setSearchOpen(false)}
            />
          }
        >
          <Field
            placeholder="도로명 주소 또는 장소"
            value={search}
            onChangeText={setSearch}
          />
          <Button
            title="검색"
            loading={searching}
            onPress={() => {
              setSearching(true);
              setSearchError("");
              void searchNativePlaces(search)
                .then(setResults)
                .catch((e) => setSearchError(e.message))
                .finally(() => setSearching(false));
            }}
          />
          <Notice error>{searchError}</Notice>
          {results.map((place) => (
            <Row
              key={place.id}
              title={place.name}
              subtitle={place.address}
              onPress={() => {
                setForm((old) => ({
                  ...old,
                  placeName: place.name,
                  address: place.address,
                  ...place.location,
                }));
                setSearchOpen(false);
              }}
            />
          ))}
        </Screen>
      </Modal>
    </Screen>
  );
}
