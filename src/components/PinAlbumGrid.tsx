import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Globe2, Images, Lock, MapPin, UsersRound } from 'lucide-react-native';
import { Text } from './Typography';
import { RemoteImage } from './RemoteImage';
import { p } from './ui';
import type { FeedTone } from '../lib/feedPosts';
import type { Post } from '../types/post';

const tones: Record<FeedTone, { color: string; background: string }> = {
  'tone-primary': { color: p.primary, background: p.primarySoft },
  'tone-olive': { color: p.olive, background: p.oliveSoft },
  'tone-coral': { color: p.coral, background: p.coralSoft },
};
const visibilityLabel = (post: Post) => post.visibility === 'private' ? '나만 보기' : post.visibility === 'group' ? '그룹 멤버 공개' : post.visibility === 'followers' ? '팔로워 공개' : '전체 공개';
// Icons sit straight on the photo; a soft shadow keeps them legible on light images.
const iconShadow = { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' } as const;

export interface PinTileOptions {
  showVisibility?: boolean;
  // The feed opens its own detail view and gives photo-less tiles a stable soft colour.
  onOpen?: (post: Post) => void;
  getLabel?: (post: Post) => string;
  getTone?: (post: Post) => FeedTone;
  showTitleWithoutPhoto?: boolean;
  showPhotoCount?: boolean;
}

// Square tiles without captions: the title is in each tile's label and on the pin.
export function PinAlbumTile({ post, size, showVisibility = false, onOpen, getLabel, getTone, showTitleWithoutPhoto = false, showPhotoCount = true }: PinTileOptions & { post: Post; size: number }) {
  const photo = post.photoThumbnailUrls?.[0] || post.photoUrls[0];
  const tone = tones[getTone?.(post) || 'tone-primary'];
  const Visibility = post.visibility === 'private' || post.visibility === 'group' ? Lock : post.visibility === 'followers' ? UsersRound : Globe2;
  const overlay = photo ? p.paper : tone.color;
  return <Pressable accessibilityRole="link" accessibilityLabel={getLabel ? getLabel(post) : `${post.title} · ${post.placeName} 핀 보기`}
    onPress={() => onOpen ? onOpen(post) : router.push({ pathname: '/posts/[postId]', params: { postId: post.id } })}
    style={({ pressed }) => [t.tile, { width: size, height: size, backgroundColor: p.surface }, pressed && { opacity: 0.88 }]}>
    {photo ? <RemoteImage uri={photo} style={StyleSheet.absoluteFill} contentFit="cover" />
      : <View style={[StyleSheet.absoluteFill, t.placeholder, { backgroundColor: tone.background }, size < 120 && { padding: 8 }]}>
        <MapPin size={showTitleWithoutPhoto ? 20 : 28} color={tone.color} />
        {showTitleWithoutPhoto && <Text numberOfLines={2} style={t.placeholderTitle}>{post.title}</Text>}
        <Text numberOfLines={showTitleWithoutPhoto ? 1 : 2} style={t.placeholderPlace}>{post.placeName}</Text>
      </View>}
    {showPhotoCount && post.photoUrls.length > 1 && <View accessibilityLabel={`사진 ${post.photoUrls.length}장`} style={[t.badge, { right: 6 }, iconShadow]}><Images size={18} color={p.paper} /></View>}
    {showVisibility && <View accessibilityLabel={visibilityLabel(post)} style={[t.badge, { left: 6 }, photo && iconShadow]}><Visibility size={14} color={overlay} /></View>}
  </Pressable>;
}

// Three square columns, 3px apart; the parent decides whether the grid runs edge to edge.
export function PinAlbumGrid({ posts, gap = 3, ...options }: PinTileOptions & { posts: Post[]; gap?: number }) {
  const [width, setWidth] = useState(0);
  const size = width ? (width - gap * 2) / 3 : 0;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[t.grid, { gap }]}>
    {!!size && posts.map(post => <PinAlbumTile key={post.id} post={post} size={size} {...options} />)}
  </View>;
}

const t = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 4, padding: 12 },
  placeholderTitle: { color: p.ink, fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  placeholderPlace: { color: p.muted, fontSize: 11, lineHeight: 15, textAlign: 'center' },
  badge: { position: 'absolute', top: 6 },
});
