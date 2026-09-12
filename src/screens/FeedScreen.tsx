import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, View, Text } from "react-native";
import { router } from "expo-router";
import {
  Button,
  Chip,
  Empty,
  Field,
  Notice,
  p,
  Screen,
  s,
} from "../components/ui";
import { PostCard } from "../components/PostCard";
import { usePosts } from "../hooks/usePosts";
import { useAuth } from "../hooks/useAuth";
import { filterFeedPosts } from "../lib/feedSearch";
import { filterNearbyPosts } from "../services/postService";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
export default function FeedScreen({
  kind = "visible",
}: {
  kind?: "visible" | "mine" | "liked";
}) {
  const { currentUser } = useAuth();
  const { posts, loading, error, refresh, loadMore, loadingMore, hasMore } =
    usePosts(kind, undefined, 24);
  const [search, setSearch] = useState("");
  const [radius, setRadius] = useState(0);
  const [date, setDate] = useState("");
  const geo = useCurrentLocation();
  const filtered = useMemo(
    () =>
      filterFeedPosts(
        radius && geo.location
          ? filterNearbyPosts(posts, geo.location, radius)
          : posts,
        search,
      ).filter((post) => !date || post.dateKey === date),
    [posts, search, radius, geo.location, date],
  );
  return (
    <Screen
      title={
        kind === "mine" ? "내 기록" : kind === "liked" ? "좋아요한 핀" : "피드"
      }
      back={kind !== "visible"}
      scroll={false}
    >
      <FlatList
        data={filtered}
        onEndReached={() => {
          if (hasMore) void loadMore();
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={p.primary} />
          ) : hasMore ? (
            <Button
              title="기록 더 보기"
              variant="secondary"
              onPress={() => void loadMore()}
            />
          ) : null
        }
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.content}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        refreshing={loading}
        onRefresh={refresh}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={
          <View style={{ gap: 14, paddingBottom: 18 }}>
            <Text style={s.muted}>
              {kind === "visible"
                ? "내가 남긴 장소와 팔로우한 사람들의 오늘"
                : `소중한 장소 기록 ${posts.length}개`}
            </Text>
            <Field
              placeholder="장소, 기록, 사람 검색"
              value={search}
              onChangeText={setSearch}
            />
            {kind === "visible" ? (
              <View style={{ gap: 10 }}>
                <View style={{ ...s.row, flexWrap: "wrap" }}>
                  {[0, 1, 3, 5, 10].map((km) => (
                    <Chip
                      key={km}
                      label={km ? `${km}km` : "전체"}
                      selected={radius === km}
                      onPress={() => {
                        if (km && !geo.location) {
                          void geo.requestLocation().then((point) => {
                            if (point) setRadius(km);
                          });
                        } else setRadius(km);
                      }}
                    />
                  ))}
                </View>
                <Notice error>{geo.error}</Notice>
              </View>
            ) : (
              <Field
                placeholder="날짜로 찾기 (YYYY-MM-DD)"
                value={date}
                onChangeText={setDate}
              />
            )}
            {!!error && <Notice error>{error}</Notice>}
            {!currentUser && (
              <Button
                title="로그인하고 기록 둘러보기"
                onPress={() => router.push("/login")}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={p.primary} />
          ) : (
            <Empty
              title={search ? "검색 결과가 없어요" : "아직 모인 기록이 없어요"}
              description="지도에서 오늘의 장소를 핀으로 남겨보세요."
            />
          )
        }
      />
    </Screen>
  );
}
