import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Heart, MapPin, MessageCircle } from 'lucide-react-native';
import { Text } from './Typography';
import { RemoteImage } from './RemoteImage';
import { PostActionsMenu } from './PostActionsMenu';
import { p } from './ui';
import { useAuth } from '../hooks/useAuth';
import { formatFeedDate, getFeedTone } from '../lib/feedPosts';
import { openLocationInMaps } from '../lib/mapAppChoice';
import { subscribeToLikeStatus, subscribeToPostReactions, togglePostLike } from '../services/likeService';
import { getUserProfile } from '../services/userService';
import type { Post } from '../types/post';

const webUrl = (process.env.EXPO_PUBLIC_WEB_URL || 'https://www.pinori.kr').replace(/\/$/, '');
const tones = { 'tone-primary': [p.primary, p.primarySoft], 'tone-olive': [p.olive, p.oliveSoft], 'tone-coral': [p.coral, p.coralSoft] } as const;

// Pins keep only the author's name, so the photo comes from the (cached) profile.
function useAuthorPhoto(authorUid: string, ownPhoto: string | undefined, own: boolean): string {
  const [photo, setPhoto] = useState('');
  useEffect(() => {
    if (own) return;
    let active = true;
    getUserProfile(authorUid).then(user => { if (active) setPhoto(user?.photoURL || ''); }, () => { if (active) setPhoto(''); });
    return () => { active = false; };
  }, [authorUid, own]);
  return own ? ownPhoto || '' : photo;
}

export function FeedPostCard({ post }: { post: Post }) {
  const { currentUser, profile, accountReady: firebaseReady } = useAuth();
  const [counts, setCounts] = useState({ likeCount: post.likeCount, commentCount: post.commentCount });
  const [liked, setLiked] = useState(false);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [mediaWidth, setMediaWidth] = useState(0);
  const pending = useRef(false);
  const uid = currentUser?.uid;
  const authorPhoto = useAuthorPhoto(post.uid, profile?.photoURL, !!uid && uid === post.uid);
  const photos = post.photoUrls;
  const [toneColor, toneBackground] = tones[getFeedTone(post)];
  const openDetail = () => router.push({ pathname: '/posts/[postId]', params: { postId: post.id } });

  // The list keeps only nearby cards mounted, so each card subscribes while it exists.
  useEffect(() => {
    setReady(false); setLiked(false); setAvailable(true); setError('');
    if (!firebaseReady || !uid) return;
    const fail = () => { setAvailable(false); setError('반응을 불러오지 못했어요. 기록이 삭제되었거나 볼 수 없게 되었을 수 있어요.'); };
    const stopCounts = subscribeToPostReactions(post.id, next => {
      if (!next) { setAvailable(false); setError('삭제된 기록이에요.'); return; }
      setCounts(next);
    }, fail);
    const stopLike = subscribeToLikeStatus(post.id, uid, next => { setLiked(next); setReady(true); }, fail);
    return () => { stopCounts(); stopLike(); };
  }, [post.id, uid, firebaseReady]);

  async function share() {
    const url = `${webUrl}/posts/${encodeURIComponent(post.id)}`;
    try { await Share.share({ title: post.title, message: Platform.OS === 'ios' ? `${post.placeName} 핀을 공유합니다.` : `${post.placeName} 핀을 공유합니다.\n${url}`, ...(Platform.OS === 'ios' ? { url } : {}) }); }
    catch (e) { if ((e as { name?: string }).name !== 'AbortError') setError('공유하지 못했어요. 다시 시도해 주세요.'); }
  }

  async function toggleLike() {
    if (!currentUser || !profile) { router.push('/login'); return; }
    if (pending.current || !available || !ready) return;
    pending.current = true; setBusy(true); setError('');
    try { await togglePostLike(post.id, { uid: currentUser.uid, nickname: profile.nickname, photoURL: profile.photoURL }); }
    catch { setError('좋아요를 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { pending.current = false; setBusy(false); }
  }

  return <View accessibilityLabel={post.title} style={c.card}>
    <View style={c.author}>
      <Pressable accessibilityRole="link" accessibilityLabel={`${post.authorNickname} 프로필 보기`} onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: post.uid } })} style={c.avatar}>
        {authorPhoto ? <RemoteImage uri={authorPhoto} accessibilityLabel={`${post.authorNickname} 프로필 사진`} style={c.avatarImage} contentFit="cover" />
          : <Text style={c.avatarText}>{post.authorNickname.slice(0, 1) || '?'}</Text>}
      </Pressable>
      <View style={c.who}>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: post.uid } })} style={{ alignSelf: 'flex-start' }}><Text style={c.nickname}>{post.authorNickname}</Text></Pressable>
        <View style={c.place}><MapPin size={12} color={p.muted} /><Text numberOfLines={1} style={c.placeText}>{post.placeName}</Text></View>
      </View>
      <PostActionsMenu post={post} isOwner={uid === post.uid} canReport={!!uid && uid !== post.uid} busy={false} triggerStyle={{ marginRight: 0 }}
        onOpen={openDetail} onEdit={() => router.push({ pathname: '/posts/edit', params: { postId: post.id } })} onShare={() => void share()} />
    </View>

    {photos.length > 0 ? <View style={c.media} onLayout={event => setMediaWidth(event.nativeEvent.layout.width)}>
      {!!mediaWidth && <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} accessibilityLabel={photos.length > 1 ? `사진 ${photos.length}장, 옆으로 넘겨 보기` : undefined}
        onMomentumScrollEnd={event => setPhotoIndex(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, mediaWidth)))}
        onScroll={event => setPhotoIndex(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, mediaWidth)))} scrollEventThrottle={64}>
        {photos.map((url, index) => <RemoteImage key={url} uri={url} accessibilityLabel={`${post.title} 사진 ${index + 1}`} style={{ width: mediaWidth, height: mediaWidth }} contentFit="cover" />)}
      </ScrollView>}
      {photos.length > 1 && <Text style={c.counter}>{photoIndex + 1}/{photos.length}</Text>}
    </View> : <View style={[c.placeholder, { backgroundColor: toneBackground }]}>
      <MapPin size={28} color={toneColor} /><Text style={c.placeholderText}>{post.placeName}</Text>
    </View>}

    <View style={c.actions}>
      <IconAction label={liked ? '좋아요 취소' : '좋아요'} selected={liked} disabled={busy || !available || Boolean(currentUser && !ready)} onPress={() => void toggleLike()}>
        <Heart size={24} color={liked ? p.coral : p.ink} fill={liked ? p.coral : 'none'} />
      </IconAction>
      <IconAction label="댓글 보기" onPress={openDetail}><MessageCircle size={24} color={p.ink} /></IconAction>
      <IconAction label="지도에서 위치 열기" onPress={() => openLocationInMaps(post, post.placeName, setError)}><MapPin size={24} color={p.ink} /></IconAction>
      {photos.length > 1 && <View style={c.dots}>{photos.map((url, index) => <View key={url} style={[c.dot, index === photoIndex && { backgroundColor: p.primary }]} />)}</View>}
    </View>

    <View style={c.caption}>
      <Text style={c.likes}>좋아요 {counts.likeCount}개</Text>
      <Text accessibilityRole="header" style={c.title}>{post.title}</Text>
      {!!post.content && <Text style={c.content}>{post.content}</Text>}
      <Pressable accessibilityRole="link" onPress={openDetail} style={{ alignSelf: 'flex-start' }}><Text style={c.comments}>{counts.commentCount > 0 ? `댓글 ${counts.commentCount}개 모두 보기` : '댓글 남기기'}</Text></Pressable>
      <Text style={c.date}>{formatFeedDate(post.dateKey)}</Text>
      {!!error && <Text accessibilityRole="alert" style={c.error}>{error}</Text>}
    </View>
  </View>;
}

function IconAction({ label, onPress, children, disabled = false, selected }: React.PropsWithChildren<{ label: string; onPress: () => void; disabled?: boolean; selected?: boolean }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [c.icon, pressed && { backgroundColor: p.surface }, disabled && { opacity: 0.5 }]}>{children}</Pressable>;
}

const c = StyleSheet.create({
  card: { backgroundColor: p.paper },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 16, paddingRight: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primary, overflow: 'hidden' },
  avatarImage: { width: 36, height: 36, borderRadius: 18 },
  avatarText: { color: p.paper, fontSize: 15, fontWeight: '900' },
  who: { flex: 1, minWidth: 0 },
  nickname: { color: p.ink, fontSize: 14, fontWeight: '700' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  placeText: { flexShrink: 1, color: p.muted, fontSize: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  media: { aspectRatio: 1, backgroundColor: p.surface },
  counter: { position: 'absolute', top: 12, right: 12, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, overflow: 'hidden', color: p.paper, backgroundColor: '#161F1BBF', fontSize: 12, fontWeight: '500' },
  placeholder: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  placeholderText: { color: p.muted, fontSize: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingHorizontal: 8 },
  dots: { flexDirection: 'row', gap: 4, marginLeft: 'auto', paddingRight: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: p.line },
  caption: { gap: 4, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 16 },
  likes: { color: p.ink, fontSize: 13, fontWeight: '700' },
  title: { color: p.ink, fontSize: 15, fontWeight: '700', letterSpacing: -0.15 },
  content: { color: p.ink, fontSize: 14, lineHeight: 22 },
  comments: { color: p.muted, fontSize: 13 },
  date: { color: p.light, fontSize: 12 },
  error: { color: p.danger, fontSize: 13, lineHeight: 20 },
});
