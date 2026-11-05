import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { RemoteImage } from './RemoteImage';
import { router } from 'expo-router';
import { CalendarDays, Globe2, Lock, MapPin, UsersRound } from 'lucide-react-native';
import { p } from './ui';
import { PostInteractions } from './PostInteractions';
import { formatDateKey } from '../lib/date';
import type { Post } from '../types/post';
// Cards live in record grids: the photo leads, no outline or rule — spacing separates records.
export function PostCard({ post, showVisibility = false, actions }: { post: Post; showVisibility?: boolean; actions?: React.ReactNode }) {
  const excerpt = post.content.length > 84 ? post.content.slice(0, 84) + '...' : post.content;
  const Visibility = post.visibility === 'private' ? Lock : post.visibility === 'public' ? Globe2 : UsersRound;
  const privateRecord = post.visibility === 'private';
  return <View style={c.card}>
    <Pressable accessibilityRole="link" accessibilityLabel={post.title + ' 상세보기'} onPress={() => router.push(`/posts/${post.id}`)}>
      {post.photoUrls[0] ? <RemoteImage uri={post.photoThumbnailUrls?.[0] || post.photoUrls[0]} accessibilityLabel={post.title} style={c.thumbnail} /> :
        <View style={[c.thumbnail, c.placeholder]}><MapPin size={28} color={p.coral} /></View>}
      <View style={c.body}>
        <View style={c.titleRow}>
          <Text style={c.title}>{post.title}</Text>
          {showVisibility && <View style={[c.pill, privateRecord && { backgroundColor: p.coralSoft }]}>
            <Visibility size={13} color={privateRecord ? p.ink : p.primary} /><Text style={[c.pillText, privateRecord && { color: p.ink }]}>{privateRecord ? '나만 보기' : post.visibility === 'public' ? '전체 공개' : post.visibility === 'group' ? '그룹 멤버' : '팔로워'}</Text>
          </View>}
        </View>
        <View style={c.place}><MapPin size={15} color={p.muted} /><Text style={c.placeText}>{post.placeName}</Text></View>
        {!!excerpt && <Text style={c.excerpt}>{excerpt}</Text>}
        <View style={c.meta}>
          <View style={c.metaItem}><CalendarDays size={14} color={p.light} /><Text style={c.metaText}>{formatDateKey(post.dateKey)}</Text></View>
          <Pressable accessibilityRole="link" onPress={() => router.push(`/people/${post.uid}`)} style={c.metaItem}><UsersRound size={14} color={p.light} /><Text style={c.metaText}>{post.authorNickname}</Text></Pressable>
        </View>
      </View>
    </Pressable>
    <PostInteractions post={post} bordered={false} />
    {!!post.groupId && <Pressable accessibilityRole="link" onPress={() => router.push(`/groups/${post.groupId}`)} style={c.groupLink}><UsersRound size={14} color={p.olive} /><Text style={c.groupText}>그룹 핀 모아보기</Text></Pressable>}
    {!!actions && <View style={c.actions}>{actions}</View>}
  </View>;
}
const c = StyleSheet.create({
  card: { minWidth: 0 },
  thumbnail: { width: '100%', aspectRatio: 4 / 3, borderRadius: 6, backgroundColor: p.surface },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: p.coralSoft },
  body: { paddingTop: 16, paddingBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, color: p.ink, fontSize: 18, lineHeight: 24.3, fontWeight: '600', letterSpacing: -0.45 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, minHeight: 24, paddingHorizontal: 9, borderRadius: 4, backgroundColor: p.primarySoft },
  pillText: { color: p.primary, fontSize: 11.5, fontWeight: '600' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 7, marginVertical: 9 }, placeText: { flex: 1, color: p.muted, fontSize: 12, fontWeight: '500' },
  excerpt: { minHeight: 48, marginBottom: 14, color: p.muted, fontSize: 14, lineHeight: 24.5 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 }, metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 24 }, metaText: { color: p.light, fontSize: 13.9 },
  groupLink: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 16, minHeight: 32 }, groupText: { color: p.olive, fontSize: 13.1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 16 },
});
