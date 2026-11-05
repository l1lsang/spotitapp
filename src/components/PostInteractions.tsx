import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { router } from 'expo-router';
import { Heart, MessageCircle } from 'lucide-react-native';
import { useAuth } from '../hooks/useAuth';
import { subscribeToLikeStatus, subscribeToPostReactions, togglePostLike } from '../services/likeService';
import type { Post } from '../types/post';
import { SharePinButton } from './SharePinButton';
import { CommentThread } from './CommentThread';
import { Notice, p } from './ui';

// Text-only reactions; a rule above them except inside record cards (bordered={false}).
export function PostInteractions({ post, bordered = true }: { post: Post; bordered?: boolean }) {
  const { currentUser, profile, accountReady: firebaseReady } = useAuth();
  const [counts, setCounts] = useState({ likeCount: post.likeCount || 0, commentCount: post.commentCount || 0 });
  const [liked, setLiked] = useState(false);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    setReady(false); setLiked(false); setAvailable(true); setOpen(false); setError('');
    if (!currentUser || !firebaseReady) return;
    const fail = () => { setAvailable(false); setError('반응을 불러오지 못했습니다. 기록이 삭제되었거나 접근 권한이 변경되었을 수 있습니다.'); };
    const stopCounts = subscribeToPostReactions(post.id, next => {
      if (next) setCounts(next);
      else { setAvailable(false); setError('삭제된 기록입니다.'); }
    }, fail);
    const stopLike = subscribeToLikeStatus(post.id, currentUser.uid, value => { setLiked(value); setReady(true); }, fail);
    return () => { stopCounts(); stopLike(); };
  }, [post.id, currentUser?.uid, firebaseReady, revision]);
  async function like() {
    if (!currentUser || !profile) { router.push('/login'); return; }
    if (pending.current || !ready || !available) return;
    pending.current = true; setBusy(true); setError('');
    try { await togglePostLike(post.id, { uid: currentUser.uid, nickname: profile.nickname, photoURL: profile.photoURL }); }
    catch { setError('좋아요를 저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { pending.current = false; setBusy(false); }
  }
  const likeDisabled = busy || !available || Boolean(currentUser && !ready);
  return <View style={i.root}>
    <View accessibilityLabel={`${post.title} 반응`} style={[i.actions, bordered && i.bordered]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${liked ? '좋아요 취소' : '좋아요'} ${counts.likeCount}개`} accessibilityState={{ selected: liked, busy, disabled: likeDisabled }} disabled={likeDisabled} style={({ pressed }) => [i.button, (busy || !available) && i.disabled, pressed && i.pressed]} onPress={() => void like()}>
        <Heart size={19} color={liked ? p.coral : p.muted} fill={liked ? p.coral : 'none'} /><Text style={[i.label, liked && { color: p.coral }]}>좋아요 {counts.likeCount}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open, disabled: !available }} disabled={!available} style={({ pressed }) => [i.button, !available && i.disabled, pressed && i.pressed]} onPress={() => currentUser ? setOpen(value => !value) : router.push('/login')}>
        <MessageCircle size={19} color={p.muted} /><Text style={i.label}>댓글 {counts.commentCount}</Text>
      </Pressable>
      <SharePinButton post={post} />
    </View>
    {!!error && <View style={i.error}><Notice error>{error}</Notice>{!available && <Pressable accessibilityRole="button" onPress={() => setRevision(value => value + 1)} style={i.retry}><Text style={i.retryText}>다시 시도</Text></Pressable>}</View>}
    {open && available && <View style={i.comments}><CommentThread post={post} /></View>}
  </View>;
}
const i = StyleSheet.create({
  root: { minWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 8, columnGap: 20, paddingVertical: 8 },
  bordered: { borderTopWidth: 1, borderTopColor: p.line },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, paddingVertical: 4 },
  label: { color: p.muted, fontSize: 13.76 }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.6 },
  error: { gap: 4, marginBottom: 10 }, retry: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }, retryText: { color: p.muted, fontSize: 13, fontWeight: '600' },
  comments: { marginTop: 12 },
});
