import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, MapPin, RefreshCw } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { Button, IconButton, Notice, Screen, p } from '../components/ui';
import { PinAlbumGrid } from '../components/PinAlbumGrid';
import { useAuth } from '../hooks/useAuth';
import { getUserPosts } from '../services/postService';
import type { Post } from '../types/post';

type RecordKind = 'public' | 'followers' | 'private' | 'group';
type RecordFilter = 'all' | RecordKind;

const FILTERS: { id: RecordFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'public', label: '전체 공개' },
  { id: 'followers', label: '팔로워' },
  { id: 'private', label: '나만 보기' },
  { id: 'group', label: '그룹' },
];

// Group pins count as group records whatever visibility the group gave them.
function getRecordKind(post: Pick<Post, 'groupId' | 'visibility'>): RecordKind {
  if (post.groupId || post.visibility === 'group') return 'group';
  return post.visibility;
}

// My records: the same square grid as the profile, plus visibility filters for managing them.
export default function MyPostsScreen() {
  const { currentUser, accountReady: firebaseReady } = useAuth();
  const { width } = useWindowDimensions();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [revision, setRevision] = useState(0);
  const uid = currentUser?.uid;

  // Edits and deletions happen on the record page, so the list reloads on return.
  useFocusEffect(useCallback(() => {
    if (!firebaseReady || !uid) return;
    let active = true;
    setLoading(true); setError('');
    getUserPosts(uid).then(next => { if (active) setPosts(next); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : '내 기록을 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uid, firebaseReady, revision]));

  const counts = posts.reduce<Record<RecordFilter, number>>((total, post) => {
    total[getRecordKind(post)] += 1;
    return total;
  }, { all: posts.length, public: 0, followers: 0, private: 0, group: 0 });
  const visiblePosts = filter === 'all' ? posts : posts.filter(post => getRecordKind(post) === filter);
  const edgeToEdge = width <= 640;

  return <Screen maxWidth={760} contentStyle={m.content} refreshing={loading} onRefresh={() => setRevision(value => value + 1)}>
    <View style={m.bar}>
      <IconButton label="뒤로 가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} style={{ marginLeft: -10 }}><ChevronLeft size={22} color={p.ink} /></IconButton>
      <Text accessibilityRole="header" style={m.title}>내 기록</Text>
      {!loading && !error && <Text style={m.count}>기록 {posts.length}개</Text>}
    </View>

    {posts.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="공개 범위로 보기" style={m.filterScroll} contentContainerStyle={m.filters}>
      {FILTERS.filter(({ id }) => id === 'all' || counts[id] > 0).map(({ id, label }) => {
        const selected = filter === id;
        return <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setFilter(id)} style={[m.filter, selected && m.filterActive]}>
          <Text style={[m.filterText, selected && { color: p.primary, fontWeight: '700' }]}>{label}</Text>
          <Text style={[m.filterCount, selected && { color: p.primary }]}>{counts[id]}</Text>
        </Pressable>;
      })}
    </ScrollView>}

    {!!error && <View style={m.state}><Notice error>{error}</Notice><Button title="다시 시도" variant="secondary" icon={<RefreshCw size={17} color={p.ink} />} onPress={() => setRevision(value => value + 1)} /></View>}
    {loading && !posts.length && <Text accessibilityLiveRegion="polite" style={[m.stateText, m.state]}>내 기록을 불러오는 중이에요.</Text>}
    {!loading && !error && posts.length === 0 && <View style={m.state}>
      <MapPin size={28} color={p.primary} />
      <Text style={m.stateText}>아직 남긴 기록이 없어요.</Text>
      <Button title="지도에서 첫 기록 남기기" onPress={() => router.push('/map')} />
    </View>}

    {visiblePosts.length > 0 && <>
      <View style={edgeToEdge && { marginHorizontal: -16 }}><PinAlbumGrid posts={visiblePosts} showVisibility showTitleWithoutPhoto /></View>
      <Text style={m.hint}>기록을 누르면 내용을 보고 수정하거나 삭제할 수 있어요.</Text>
    </>}
    {!loading && posts.length > 0 && visiblePosts.length === 0 && <Text style={[m.stateText, m.state]}>이 공개 범위로 남긴 기록이 없어요.</Text>}
  </Screen>;
}

const m = StyleSheet.create({
  content: { paddingTop: 8, gap: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 52 },
  title: { flex: 1, color: p.ink, fontSize: 18, fontWeight: '700' },
  count: { color: p.muted, fontSize: 13 },
  filterScroll: { marginTop: 8, marginBottom: 12, marginHorizontal: -16, flexGrow: 0 },
  filters: { gap: 8, paddingVertical: 2, paddingHorizontal: 16 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: p.line, borderRadius: 999, backgroundColor: p.paper },
  filterActive: { borderColor: p.primary, backgroundColor: p.primarySoft },
  filterText: { color: p.ink, fontSize: 13, fontWeight: '500' },
  filterCount: { color: p.light, fontSize: 13, fontWeight: '600' },
  hint: { marginTop: 16, color: p.muted, fontSize: 12, textAlign: 'center' },
  state: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 16 },
  stateText: { color: p.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
});
