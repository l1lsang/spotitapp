import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  Bell,
  LocateFixed,
  Plus,
  Search,
  Users,
  X,
  List,
  RefreshCw,
} from "lucide-react-native";
import NativeMap from "../components/NativeMap";
import {
  Button,
  Chip,
  Empty,
  Field,
  Notice,
  p,
  Row,
  s,
  Screen,
} from "../components/ui";
import { usePosts } from "../hooks/usePosts";
import { useAuth } from "../hooks/useAuth";
import {
  SEOUL_CITY_HALL,
  useCurrentLocation,
} from "../hooks/useCurrentLocation";
import { searchNativePlaces, type NativePlace } from "../lib/placeSearch";
import { subscribeGroup, subscribeMyGroupIds } from "../services/groupService";
import { subscribeGroupPosts } from "../services/postService";
import {
  createLivePlaceStatus,
  subscribePlaceStatusUpdates,
} from "../services/mapFeatureService";
import {
  LIVE_PLACE_STATUS_OPTIONS,
  type LivePlaceStatusKey,
  type LivePlaceStatusUpdate,
} from "../types/mapFeature";
import type { LatLng } from "../lib/mapLocation";
import type { Post } from "../types/post";
import type { PinGroup } from "../types/group";
export default function MapScreen() {
  const params = useLocalSearchParams<{
    group?: string;
    lat?: string;
    lng?: string;
  }>();
  const { currentUser, profile, firebaseReady } = useAuth();
  const { posts, loading, error, refresh, loadMore, loadingMore, hasMore } =
    usePosts();
  const geo = useCurrentLocation();
  const [center, setCenter] = useState<LatLng>(SEOUL_CITY_HALL);
  const [group, setGroup] = useState<PinGroup | null>(null);
  const [groupPosts, setGroupPosts] = useState<Post[]>([]);
  const [groupError, setGroupError] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [places, setPlaces] = useState<NativePlace[]>([]);
  const [place, setPlace] = useState<NativePlace | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<Post[] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statuses, setStatuses] = useState<LivePlaceStatusUpdate[]>([]);
  const [tags, setTags] = useState<LivePlaceStatusKey[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  useEffect(() => {
    if (params.lat && params.lng) {
      const point = { lat: Number(params.lat), lng: Number(params.lng) };
      if (
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        Math.abs(point.lat) <= 90 &&
        Math.abs(point.lng) <= 180
      )
        setCenter(point);
    }
  }, [params.lat, params.lng]);
  useEffect(() => {
    setGroup(null);
    setGroupPosts([]);
    setGroupError("");
    if (!params.group || !firebaseReady) return;
    return subscribeGroup(params.group, setGroup, (e) =>
      setGroupError(e.message),
    );
  }, [params.group, firebaseReady]);
  useEffect(() => {
    setMemberIds([]);
    if (!currentUser || !firebaseReady) return;
    return subscribeMyGroupIds(currentUser.uid, setMemberIds, (e) =>
      setGroupError(e.message),
    );
  }, [currentUser, firebaseReady]);
  useEffect(() => {
    setGroupPosts([]);
    if (
      !group ||
      !currentUser ||
      (group.visibility === "private" && !memberIds.includes(group.id))
    )
      return;
    return subscribeGroupPosts(
      group.id,
      setGroupPosts,
      (e) => setGroupError(e.message),
      group.visibility || "public",
    );
  }, [group, currentUser, memberIds]);
  useEffect(() => {
    setStatuses([]);
    if (!place || !currentUser || !firebaseReady) return;
    return subscribePlaceStatusUpdates(place.id, setStatuses, (e) =>
      setStatusError(e.message),
    );
  }, [place, currentUser, firebaseReady]);
  const shown = params.group ? groupPosts : posts;
  const pick = useCallback((point: LatLng) => {
    setPlace({
      id: `geo:${point.lat.toFixed(5)},${point.lng.toFixed(5)}:0`,
      name: "선택한 장소",
      address: "",
      location: point,
    });
  }, []);
  async function search() {
    setSearching(true);
    setSearchError("");
    try {
      const result = await searchNativePlaces(keyword);
      setPlaces(result);
      if (!result.length)
        setSearchError(
          "주소나 장소를 찾지 못했어요. 도로명 주소로 다시 검색해 주세요.",
        );
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "검색에 실패했습니다.");
    } finally {
      setSearching(false);
    }
  }
  function compose() {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    const point = place?.location || center;
    router.push({
      pathname: "/posts/new",
      params: {
        lat: String(point.lat),
        lng: String(point.lng),
        placeName: place?.name || "",
        address: place?.address || "",
        group: params.group || "",
      },
    });
  }
  async function saveStatus() {
    if (!place || !currentUser) return;
    setSaving(true);
    setStatusError("");
    try {
      await createLivePlaceStatus(
        {
          placeId: place.id,
          placeName: place.name,
          address: place.address,
          ...place.location,
          tags,
          note,
        },
        { uid: currentUser.uid, nickname: profile?.nickname || "사용자" },
      );
      setTags([]);
      setNote("");
      setStatusOpen(false);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <SafeAreaView style={s.page} edges={["top", "left", "right"]}>
      <View
        style={{ ...s.between, paddingHorizontal: 20, paddingVertical: 14 }}
      >
        <View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: p.primary }}>
            스팟잇
          </Text>
          <Text style={s.muted}>오늘, 이곳</Text>
        </View>
        <View style={s.row}>
          <Pressable
            accessibilityLabel="그룹"
            onPress={() => router.push("/groups")}
            style={{ padding: 10 }}
          >
            <Users color={p.ink} size={22} />
          </Pressable>
          <Pressable
            accessibilityLabel="알림"
            onPress={() => router.push("/notifications")}
            style={{ padding: 10 }}
          >
            <Bell color={p.ink} size={22} />
          </Pressable>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <NativeMap
          center={center}
          posts={shown}
          onSelect={setSelected}
          onPick={pick}
          onRegionChange={setCenter}
          selected={place?.location}
        />
        <View
          style={{ position: "absolute", top: 14, left: 18, right: 18, gap: 8 }}
        >
          <Pressable
            accessibilityRole="search"
            onPress={() => setSearchOpen(true)}
            style={{ ...s.card, ...s.row, padding: 15 }}
          >
            <Search size={20} color={p.primary} />
            <Text style={s.muted}>
              {place?.name || "장소나 주소를 검색해 보세요"}
            </Text>
          </Pressable>
          {!!params.group && (
            <View style={s.row}>
              <Chip label={group?.name || "그룹 지도"} selected />
              <Chip
                label="내 지도"
                onPress={() => router.setParams({ group: "" })}
              />
            </View>
          )}
          {!!(error || groupError || geo.error) && (
            <Notice error>{error || groupError || geo.error}</Notice>
          )}
          {!currentUser && (
            <Pressable
              onPress={() => router.push("/login")}
              style={{ ...s.card, padding: 12 }}
            >
              <Text style={{ color: p.primary }}>
                로그인하고 나만의 지도를 만들어 보세요 →
              </Text>
            </Pressable>
          )}
        </View>
        <View
          style={{
            position: "absolute",
            right: 18,
            bottom: place ? 134 : 24,
            gap: 10,
          }}
        >
          {[
            {
              icon: RefreshCw,
              label: "새로고침",
              action: () => void refresh(),
            },
            { icon: List, label: "핀 목록", action: () => setListOpen(true) },
            {
              icon: LocateFixed,
              label: "현재 위치",
              action: () =>
                void geo.requestLocation().then((point) => {
                  if (point) setCenter(point);
                }),
            },
          ].map((item) => (
            <Pressable
              key={item.label}
              accessibilityLabel={item.label}
              onPress={item.action}
              style={{
                width: 48,
                height: 48,
                borderRadius: 18,
                backgroundColor: p.paper,
                borderWidth: 1,
                borderColor: p.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <item.icon color={p.primary} size={21} />
            </Pressable>
          ))}
          <Pressable
            accessibilityLabel="핀 남기기"
            onPress={compose}
            style={{
              width: 54,
              height: 54,
              borderRadius: 20,
              backgroundColor: p.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Plus color={p.paper} size={26} />
          </Pressable>
        </View>
        {(loading || geo.loading) && (
          <ActivityIndicator
            color={p.primary}
            style={{ position: "absolute", bottom: 30, left: 20 }}
          />
        )}
        {place && (
          <View
            style={{
              position: "absolute",
              bottom: 14,
              left: 16,
              right: 16,
              ...s.card,
              padding: 14,
            }}
          >
            <View style={s.between}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: p.ink }}>
                  {place.name}
                </Text>
                <Text numberOfLines={1} style={s.muted}>
                  {place.address || "지도를 길게 눌러 선택한 위치"}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="장소 선택 닫기"
                onPress={() => setPlace(null)}
              >
                <X color={p.muted} />
              </Pressable>
            </View>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Button title="여기에 핀 남기기" onPress={compose} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="지금 이곳"
                  variant="secondary"
                  onPress={() =>
                    currentUser ? setStatusOpen(true) : router.push("/login")
                  }
                />
              </View>
            </View>
          </View>
        )}
      </View>
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
            autoFocus
            placeholder="장소 이름 또는 도로명 주소"
            value={keyword}
            onChangeText={setKeyword}
            onSubmitEditing={() => void search()}
            returnKeyType="search"
          />
          <Button
            title="검색"
            loading={searching}
            onPress={() => void search()}
          />
          <Notice error>{searchError}</Notice>
          {places.map((item) => (
            <Row
              key={item.id}
              title={item.name}
              subtitle={item.address}
              onPress={() => {
                setPlace(item);
                setCenter(item.location);
                setSearchOpen(false);
              }}
            />
          ))}
        </Screen>
      </Modal>
      <Modal
        visible={selected !== null || listOpen}
        animationType="slide"
        onRequestClose={() => {
          setSelected(null);
          setListOpen(false);
        }}
      >
        <Screen
          title={`장소 기록 ${(selected || shown).length}개`}
          right={
            <Button
              title="닫기"
              variant="secondary"
              onPress={() => {
                setSelected(null);
                setListOpen(false);
              }}
            />
          }
        >
          {(selected || shown).map((post) => (
            <Pressable
              key={post.id}
              onPress={() => {
                setSelected(null);
                setListOpen(false);
                router.push(`/posts/${post.id}`);
              }}
            >
              <Text style={{ fontWeight: "600", fontSize: 18, color: p.ink }}>
                {post.title}
              </Text>
              <Text style={s.muted}>
                {post.placeName} · {post.authorNickname}
              </Text>
              <View style={{ height: 14 }} />
            </Pressable>
          ))}
          {listOpen && !params.group && hasMore && (
            <Button
              title="핀 더 보기"
              loading={loadingMore}
              onPress={() => void loadMore()}
            />
          )}
          {!(selected || shown).length && (
            <Empty
              title="아직 핀이 없어요"
              description="오른쪽 + 버튼으로 오늘의 장소를 남겨보세요."
            />
          )}
        </Screen>
      </Modal>
      <Modal
        visible={statusOpen}
        animationType="slide"
        onRequestClose={() => setStatusOpen(false)}
      >
        <Screen
          title="지금 이곳"
          right={
            <Button
              title="닫기"
              variant="secondary"
              onPress={() => setStatusOpen(false)}
            />
          }
        >
          <Text style={s.title}>{place?.name}</Text>
          <View style={{ ...s.row, flexWrap: "wrap" }}>
            {LIVE_PLACE_STATUS_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                selected={tags.includes(option.id)}
                onPress={() =>
                  setTags((old) =>
                    old.includes(option.id)
                      ? old.filter((item) => item !== option.id)
                      : [...old, option.id],
                  )
                }
              />
            ))}
          </View>
          <Field
            label="한마디"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
          />
          <Notice error>{statusError}</Notice>
          <Button
            title="장소 상태 남기기"
            disabled={!tags.length}
            loading={saving}
            onPress={() => void saveStatus()}
          />
          {statuses.map((status) => (
            <View key={status.id} style={s.card}>
              <Text style={s.muted}>{status.authorNickname}</Text>
              <Text style={s.text}>
                {status.tags
                  .map(
                    (tag) =>
                      LIVE_PLACE_STATUS_OPTIONS.find((item) => item.id === tag)
                        ?.label,
                  )
                  .join(" · ")}
              </Text>
              <Text style={s.text}>{status.note}</Text>
            </View>
          ))}
        </Screen>
      </Modal>
    </SafeAreaView>
  );
}
