import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { FeedPostCard } from '../components/FeedPostCard';
import { Button, IconButton, p } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useBlockedUsers, withoutBlocked } from '../hooks/useBlockedUsers';
import { readFeedPostsFrom } from '../lib/feedPosts';
import { getPostById, getVisiblePostPage } from '../services/postService';
import type { Post } from '../types/post';

export default function FeedDetailScreen() {
  const params = useLocalSearchParams<{ postId: string }>();
  const postId = (Array.isArray(params.postId) ? params.postId[0] : params.postId) || '';
  const { currentUser, accountReady, loading } = useAuth();
  const viewerUid = currentUser?.uid;
  if (viewerUid) return <FeedDetail key={`${viewerUid}:${postId}`} postId={postId} viewerUid={viewerUid} firebaseReady={accountReady} />;
  if (loading) return <View style={d.page}><ActivityIndicator color={p.primary} style={{ marginTop: 48 }} /></View>;
  // Guests can still open a public record on its own page.
  return <Redirect href={{ pathname: '/posts/[postId]', params: { postId } }} />;
}

function FeedDetail({ postId, viewerUid, firebaseReady }: { postId: string; viewerUid: string; firebaseReady: boolean }) {
  const { width } = useWindowDimensions();
  const wide = width > 860;
  const [posts, setPosts] = useState<Post[] | null>(() => readFeedPostsFrom(viewerUid, postId));
  const [error, setError] = useState('');
  const { ids: blockedIds } = useBlockedUsers();

  useEffect(() => {
    // Opened from the grid: the remembered list already starts at this record.
    if (posts || !firebaseReady) return;
    let active = true;
    void (async () => {
      try {
        const page = await getVisiblePostPage(viewerUid);
        const index = page.posts.findIndex(post => post.id === postId);
        if (index >= 0) { if (active) setPosts(page.posts.slice(index)); return; }
        const post = await getPostById(postId, viewerUid);
        if (!active) return;
        if (post) setPosts([post, ...page.posts]);
        else setError('기록을 찾을 수 없어요. 삭제되었거나 볼 수 없는 기록일 수 있어요.');
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : '기록을 불러오지 못했어요.');
      }
    })();
    return () => { active = false; };
  }, [posts, firebaseReady, postId, viewerUid]);

  return <SafeAreaView edges={wide ? ['left', 'right'] : ['top', 'left', 'right']} style={d.page}>
    <View style={[d.topbar, wide && d.topbarWide]}>
      <IconButton label="피드로 돌아가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/feed')}><ChevronLeft size={22} color={p.ink} /></IconButton>
      <Text accessibilityRole="header" style={d.title}>피드</Text>
    </View>
    {error ? <View style={d.state}><Text style={d.stateText}>{error}</Text><Button title="피드로 가기" variant="secondary" onPress={() => router.replace('/feed')} /></View>
      : !posts ? <Text accessibilityLiveRegion="polite" style={[d.stateText, { paddingVertical: 32 }]}>기록을 불러오는 중입니다.</Text>
      : <FlatList data={withoutBlocked(posts, blockedIds)} keyExtractor={item => item.id} renderItem={({ item }) => <FeedPostCard post={item} />} windowSize={5}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />} contentContainerStyle={d.list} />}
  </SafeAreaView>;
}

const d = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56, paddingLeft: 4, paddingRight: 16, borderBottomWidth: 1, borderBottomColor: p.line, backgroundColor: p.paper, width: '100%', maxWidth: 470, alignSelf: 'center' },
  topbarWide: { borderBottomWidth: 0, backgroundColor: p.transparent },
  title: { color: p.ink, fontSize: 17, fontWeight: '700' },
  list: { width: '100%', maxWidth: 470, alignSelf: 'center', paddingBottom: 112 },
  state: { alignItems: 'center', gap: 16, paddingVertical: 32, paddingHorizontal: 16 },
  stateText: { color: p.muted, textAlign: 'center', fontSize: 14, lineHeight: 24 },
});
