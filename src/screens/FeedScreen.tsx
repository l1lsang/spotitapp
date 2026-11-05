import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { router } from 'expo-router';
import { ArrowRight, Check, ChevronDown, LocateFixed, MapPin, RefreshCw, X } from 'lucide-react-native';
import { Button, IconButton, Notice, p, Screen, SearchBox } from '../components/ui';
import { Dialog } from '../components/Dialog';
import { PinAlbumTile } from '../components/PinAlbumGrid';
import { usePosts } from '../hooks/usePosts';
import { useAuth } from '../hooks/useAuth';
import { useFeedSearch } from '../hooks/useFeedSearch';
import { filterFeedPosts, mergeFeedSearchResults } from '../lib/feedSearch';
import { getFeedTone, rememberFeedPosts } from '../lib/feedPosts';
import { filterNearbyPosts } from '../services/postService';
import { SEOUL_CITY_HALL, useCurrentLocation } from '../hooks/useCurrentLocation';
import type { Post } from '../types/post';
const RADIUS_OPTIONS = [3, 10, 30];

// Feed: a square three-column grid that opens a vertical detail feed.
export default function FeedScreen() {
  const { currentUser } = useAuth();
  const { width } = useWindowDimensions();
  const { posts, loading, error, refresh, loadMore, loadingMore, hasMore } = usePosts('visible');
  const [search, setSearch] = useState('');
  const found = useFeedSearch(search);
  const [radius, setRadius] = useState(10);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const geo = useCurrentLocation();
  const roomy = width >= 736;
  const gap = roomy ? 6 : 3;
  const contentWidth = Math.min(width, 935);
  const tile = (contentWidth - gap * 2) / 3;
  const viewerUid = currentUser?.uid;
  useEffect(() => { void geo.requestLocation(false); }, [geo.requestLocation]);
  const searching = !!search.trim();
  // The server search reaches every pin, so loading earlier pages adds no match.
  const searchedAll = searching && !found.error;
  const filtered = useMemo(() => {
    const matches = searching ? mergeFeedSearchResults(filterFeedPosts(posts, search), found.posts) : posts;
    return filterNearbyPosts(matches, geo.location || SEOUL_CITY_HALL, radius);
  }, [posts, search, searching, found.posts, radius, geo.location]);
  const refreshFeed = () => { void refresh(); found.retry(); };
  const emptyText = found.searching ? '이전 기록까지 검색하고 있어요.'
    : searchedAll ? `내 주변 ${radius}km 안에는 검색어와 일치하는 기록이 없습니다.`
    : hasMore ? '불러온 최근 기록에는 일치하는 장소가 없습니다. 이전 기록도 확인해 보세요.'
    : searching ? '검색어와 일치하는 기록이 없습니다.' : '아직 볼 수 있는 기록이 없습니다.';
  // The detail feed continues from the tapped tile in this exact order.
  useEffect(() => { if (viewerUid) rememberFeedPosts(viewerUid, filtered); }, [viewerUid, filtered]);
  const waiting = geo.loading;
  const showGrid = !!currentUser && !waiting && !loading && (!error || posts.length > 0);
  const openPost = (post: Post) => router.push({ pathname: '/feed/[postId]', params: { postId: post.id } });
  return <Screen scroll={false}>
    <FlatList key={gap} numColumns={3} data={showGrid ? filtered : []} keyExtractor={item => item.id}
      columnWrapperStyle={{ gap }} ItemSeparatorComponent={() => <View style={{ height: gap }} />}
      contentContainerStyle={[f.content, { width: contentWidth, paddingTop: roomy ? 24 : 8 }]}
      refreshing={loading} onRefresh={refreshFeed}
      renderItem={({ item }) => <PinAlbumTile post={item} size={tile} onOpen={openPost} getTone={getFeedTone} showTitleWithoutPhoto
        getLabel={post => `${post.title} · ${post.placeName} 기록 보기`} />}
      ListHeaderComponent={<View>
        {!!currentUser && <View accessibilityLabel="피드 검색과 반경" style={f.toolbar}>
          <SearchBox accessibilityLabel="피드 검색" placeholder="제목, 장소, 내용, 작성자 검색" placeholderTextColor={p.light} value={search} onChangeText={setSearch} autoCorrect={false}
            style={f.search} right={search ? <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setSearch('')} style={f.clear}><View style={f.clearDot}><X size={14} color={p.paper} strokeWidth={3} /></View></Pressable> : undefined} />
          <View style={f.filters}>
            <Pressable accessibilityRole="button" accessibilityLabel={`피드 반경 내 주변 ${radius}km, 반경 선택`} onPress={() => setRadiusOpen(true)} style={({ pressed }) => [f.radius, pressed && { backgroundColor: p.surface }]}>
              <MapPin size={14} color={p.primary} /><Text style={f.radiusText}>내 주변 {radius}km</Text><ChevronDown size={14} color={p.muted} />
            </Pressable>
            <IconButton label={geo.loading ? '현재 위치 확인 중' : '현재 위치로 이동'} disabled={geo.loading} onPress={() => void geo.requestLocation()}><LocateFixed size={17} color={p.muted} /></IconButton>
            <IconButton label={loading ? '피드 새로고침 중' : '피드 새로고침'} disabled={loading} onPress={refreshFeed}><RefreshCw size={17} color={p.muted} /></IconButton>
            <Text accessibilityLiveRegion="polite" numberOfLines={1} style={f.count}>{waiting || loading ? '주변 기록을 확인하고 있어요.' : found.searching ? '이전 기록까지 검색하고 있어요.' : `${searching ? '검색 결과' : '기록'} ${filtered.length}개`}</Text>
          </View>
        </View>}
        {!!(error || geo.error) && <View style={f.message}><Notice error>{error || geo.error}</Notice></View>}
        {!!found.error && <View style={f.message}><Notice>{found.error}</Notice></View>}
        {!currentUser && <View style={f.welcome}>
          <MapPin size={32} color={p.muted} strokeWidth={1.3} />
          <Text accessibilityRole="header" style={f.welcomeTitle}>어떤 하루를 보내고 있나요?</Text>
          <Text style={f.welcomeText}>{'로그인하면 내 기록과 팔로우한 사람들의\n가까운 장소 이야기를 모아볼 수 있어요.'}</Text>
          <Button title="로그인하고 둘러보기" icon={<ArrowRight size={16} color={p.paper} />} onPress={() => router.push({ pathname: '/login', params: { from: '/feed' } })} style={{ marginTop: 12 }} />
        </View>}
        {waiting && !!currentUser && <Text style={f.empty}>현재 위치를 확인하는 중입니다.</Text>}
        {loading && !!currentUser && <Text style={f.empty}>기록을 불러오는 중입니다.</Text>}
      </View>}
      ListEmptyComponent={showGrid ? <View style={f.emptyBox}>
        <Text style={f.empty}>{emptyText}</Text>
        {searching && <Button title="검색 초기화" variant="secondary" onPress={() => setSearch('')} />}
      </View> : null}
      ListFooterComponent={hasMore && !loading && !!currentUser && !searchedAll ? <Button title={loadingMore ? '기록을 불러오는 중…' : '이전 기록 더 보기'} disabled={loadingMore} variant="secondary" onPress={() => void loadMore()} style={f.more} /> : null} />
    <Dialog visible={radiusOpen} title="피드 반경" onClose={() => setRadiusOpen(false)}>
      <View accessibilityRole="radiogroup">{RADIUS_OPTIONS.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: radius === value }} onPress={() => { setRadius(value); setRadiusOpen(false); }} style={({ pressed }) => [f.option, pressed && { backgroundColor: p.surface }]}>
        <Text style={[f.optionText, radius === value && { color: p.primary, fontWeight: '600' }]}>내 주변 {value}km</Text>{radius === value && <Check size={18} color={p.primary} />}
      </Pressable>)}</View>
    </Dialog>
  </Screen>;
}
const f = StyleSheet.create({
  content: { alignSelf: 'center', paddingBottom: 112 },
  toolbar: { gap: 12, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 12 },
  search: { minHeight: 44, borderRadius: 12, paddingRight: 2 },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  clearDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: p.light },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  radius: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 10, borderWidth: 1, borderColor: p.line, borderRadius: 999, backgroundColor: p.paper },
  radiusText: { color: p.ink, fontSize: 13, fontWeight: '600' },
  count: { flex: 1, textAlign: 'right', color: p.muted, fontSize: 12 },
  message: { paddingHorizontal: 16, paddingBottom: 12 },
  welcome: { alignItems: 'center', gap: 12, paddingVertical: 72, paddingHorizontal: 24 },
  welcomeTitle: { color: p.ink, fontSize: 20, lineHeight: 28, fontWeight: '600', textAlign: 'center' },
  welcomeText: { color: p.muted, fontSize: 14, lineHeight: 25, textAlign: 'center' },
  empty: { color: p.muted, textAlign: 'center', fontSize: 14, lineHeight: 25, paddingVertical: 24, paddingHorizontal: 16 },
  emptyBox: { gap: 15, alignItems: 'center', paddingHorizontal: 16 },
  more: { alignSelf: 'center', marginTop: 24 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 12, borderRadius: 4 },
  optionText: { color: p.ink, fontSize: 15 },
});
