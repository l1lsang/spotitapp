import { useMemo, useRef } from "react";
import { Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Constants from "expo-constants";
import MapView, { Marker, type Region } from "react-native-maps";
import { clusterPosts } from "../lib/mapClusters";
import { getPostMarkerColor, type Post } from "../types/post";
import { useAuth } from "../hooks/useAuth";
import type { LatLng } from "../lib/mapLocation";
import { Empty, p } from "./ui";
export interface NativeMapProps {
  center: LatLng;
  posts: Post[];
  onSelect: (posts: Post[]) => void;
  onPick: (point: LatLng) => void;
  onRegionChange?: (point: LatLng) => void;
  selected?: LatLng | null;
}
export default function NativeMap({
  center,
  posts,
  onSelect,
  onPick,
  onRegionChange,
  selected,
}: NativeMapProps) {
  const ref = useRef<MapView>(null);
  const { currentUser, profile } = useAuth();
  const { width, height } = useWindowDimensions();
  const region = useRef<Region>({
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: 0.035,
    longitudeDelta: 0.035,
  });
  const groups = useMemo(
    () =>
      clusterPosts(posts, (point) => ({
        x: ((point.lng - center.lng) / region.current.longitudeDelta) * width,
        y: ((point.lat - center.lat) / region.current.latitudeDelta) * height,
      })),
    [posts, center, width, height],
  );
  // Google Maps crashes before rendering if its required manifest key is absent.
  // Expo Go supplies its own key; custom builds receive this flag at build time.
  if (
    Platform.OS === "android" &&
    Constants.appOwnership !== "expo" &&
    !Constants.expoConfig?.extra?.nativeMaps?.androidConfigured
  ) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: p.surface, justifyContent: "center", padding: 30 }]}>
        <Empty title="지도를 불러올 수 없습니다" description="장소 기록은 핀 목록에서 계속 확인할 수 있어요." />
      </View>
    );
  }
  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      region={{
        ...region.current,
        latitude: center.lat,
        longitude: center.lng,
      }}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onLongPress={(event) =>
        onPick({
          lat: event.nativeEvent.coordinate.latitude,
          lng: event.nativeEvent.coordinate.longitude,
        })
      }
      onRegionChangeComplete={(r) => {
        region.current = r;
        onRegionChange?.({ lat: r.latitude, lng: r.longitude });
      }}
    >
      {groups.map((group) => (
        <Marker
          key={group.posts.map((post) => post.id).join("-")}
          coordinate={{
            latitude: group.location.lat,
            longitude: group.location.lng,
          }}
          onPress={() => onSelect(group.posts)}
          tracksViewChanges={false}
        >
          <View
            style={{
              backgroundColor:
                group.posts.length > 1
                  ? p.primary
                  : getPostMarkerColor(group.posts[0], currentUser?.uid, profile?.pinThemes),
              borderRadius: 25,
              borderWidth: 3,
              borderColor: p.paper,
              minWidth: 38,
              height: 38,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 8,
            }}
          >
            <Text style={{ fontWeight: "700", color: p.paper }}>
              {group.posts.length > 1 ? `+${group.posts.length}` : "●"}
            </Text>
          </View>
        </Marker>
      ))}
      {selected && (
        <Marker
          coordinate={{ latitude: selected.lat, longitude: selected.lng }}
          pinColor={p.primary}
          title="선택한 장소"
        />
      )}
    </MapView>
  );
}
