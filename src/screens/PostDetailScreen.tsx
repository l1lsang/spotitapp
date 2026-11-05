import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { RemoteImage } from '../components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Heart, MessageCircle, X } from 'lucide-react-native'
import { Button, Empty, Notice, Screen, p } from '../components/ui'
import NativeMap from '../components/NativeMap'
import { FormScrollView } from '../components/keyboard'
import { SharePinButton } from '../components/SharePinButton'
import { DirectionsButton } from '../components/DirectionsButton'
import { ReportButton } from '../components/ReportButton'
import { PostActionsMenu } from '../components/PostActionsMenu'
import { CommentThread } from '../components/CommentThread'
import { useAuth } from '../hooks/useAuth'
import { useBlockedUsers } from '../hooks/useBlockedUsers'
import { unblockUser } from '../services/blockService'
import { formatDateKey, formatTimestamp } from '../lib/date'
import { getExternalMapUrl, isValidLocation } from '../lib/mapLocation'
import { getPostById, deletePost } from '../services/postService'
import { subscribeToLikeStatus, subscribeToPostReactions, togglePostLike } from '../services/likeService'
import type { Post } from '../types/post'

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.'
const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || '' : value || ''
const webUrl = (process.env.EXPO_PUBLIC_WEB_URL || 'https://www.pinori.kr').replace(/\/$/, '')
const visibilityLabels = { private: '비공개', followers: '팔로워 공개', public: '전체 공개', group: '그룹 멤버 공개' }

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId?: string | string[]; commentId?: string | string[]; replyId?: string | string[]; '#': string }>()
  const postId = param(params.postId)
  const hash = param(params['#'])
  const commentId = param(params.commentId) || (hash.startsWith('comment-') ? hash.slice(8) : '')
  const replyId = param(params.replyId) || (hash.startsWith('reply-') ? hash.slice(6) : '')
  const { currentUser, profile, firebaseReady } = useAuth()
  const { width } = useWindowDimensions()
  const wide = width > 860
  const uid = currentUser?.uid
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [available, setAvailable] = useState(true)
  const [liked, setLiked] = useState(false)
  const [likeReady, setLikeReady] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [photoIndex, setPhotoIndex] = useState<number | null>(null)
  const [galleryWidth, setGalleryWidth] = useState(0)
  const [counts, setCounts] = useState({ likeCount: 0, commentCount: 0 })
  const [revision, setRevision] = useState(0)
  const request = useRef(0)
  const likePending = useRef(false)
  const scroll = useRef<ScrollView>(null)
  const content = useRef<View>(null)
  const commentInput = useRef<TextInput>(null)
  const commentsPosition = useRef(0)
  const owner = !!uid && uid === post?.uid
  const { ids: blockedIds } = useBlockedUsers()
  const blockedAuthor = !!post && !owner && blockedIds.has(post.uid)
  const load = useCallback(async () => {
    const id = ++request.current
    if (!firebaseReady || !postId) { setPost(null); setLoading(false); return }
    setLoading(true); setError(''); setAvailable(true)
    try {
      const next = await getPostById(postId, uid)
      if (id === request.current) { setPost(next); if (next) setCounts({ likeCount: next.likeCount || 0, commentCount: next.commentCount || 0 }) }
    } catch (e) { if (id === request.current) { setPost(null); setError(errorMessage(e)) } }
    finally { if (id === request.current) setLoading(false) }
  }, [firebaseReady, postId, uid])
  useFocusEffect(useCallback(() => { void load(); return () => { request.current += 1 } }, [load]))

  useEffect(() => {
    if (!post?.id || !uid || !firebaseReady) return
    setLikeReady(false); setLiked(false); setAvailable(true); setActionError('')
    const unsubscribers: (() => void)[] = []
    const fail = (e: Error) => { setAvailable(false); setActionError(errorMessage(e)) }
    try {
      unsubscribers.push(subscribeToPostReactions(post.id, next => {
        if (next) setCounts(next)
        else { setAvailable(false); setActionError('삭제된 기록입니다.') }
      }, fail))
      unsubscribers.push(subscribeToLikeStatus(post.id, uid, next => { setLiked(next); setLikeReady(true) }, fail))
    } catch (e) { setAvailable(false); setActionError(errorMessage(e)) }
    return () => { unsubscribers.forEach(stop => stop()) }
  }, [post?.id, uid, firebaseReady, revision])
  const jump = useCallback((target: View) => {
    if (!content.current) return
    target.measureLayout(content.current, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - 20), animated: true }), () => scroll.current?.scrollTo({ y: commentsPosition.current, animated: true }))
  }, [])
  async function toggleLike() {
    if (!currentUser || !profile) { router.push('/login'); return }
    if (!post || !available || !likeReady || likePending.current) return
    likePending.current = true; setLikeBusy(true); setActionError('')
    try { await togglePostLike(post.id, { uid: currentUser.uid, nickname: profile.nickname, photoURL: profile.photoURL }) }
    catch (e) { setActionError(errorMessage(e)) } finally { likePending.current = false; setLikeBusy(false) }
  }
  async function removePost() {
    if (!post || !uid || !owner || deleteBusy) return
    setDeleteBusy(true); setActionError('')
    try { await deletePost(post.id, uid); router.replace('/my') }
    catch (e) { setActionError(errorMessage(e) || '기록을 삭제하지 못했습니다. 다시 시도해 주세요.'); setDeleteBusy(false) }
  }
  async function share() {
    if (!post) return
    const url = `${webUrl}/posts/${encodeURIComponent(post.id)}`
    try { await Share.share({ title: post.title, message: Platform.OS === 'ios' ? `${post.placeName} 핀을 공유합니다.` : `${post.placeName} 핀을 공유합니다.\n${url}`, ...(Platform.OS === 'ios' ? { url } : {}) }) }
    catch (e) { if ((e as { name?: string }).name !== 'AbortError') setActionError(errorMessage(e)) }
  }
  function focusComments() {
    if (!uid) { router.push('/login'); return }
    scroll.current?.scrollTo({ y: commentsPosition.current, animated: true })
    commentInput.current?.focus()
  }
  if (loading && !post) return <Screen><View style={styles.loading}><ActivityIndicator color={p.primary} /><Text style={styles.status}>기록을 불러오는 중입니다.</Text></View></Screen>
  if (post && blockedAuthor) return <Screen title="장소 기록" back><Empty title="차단한 사용자의 기록입니다." description="차단을 해제하면 이 기록과 댓글을 다시 볼 수 있어요." /><Button title="차단 해제" variant="secondary" onPress={() => { if (uid) void unblockUser(uid, post.uid).catch(e => setActionError(errorMessage(e))) }} /><Button title="피드로 돌아가기" onPress={() => router.replace('/feed')} /></Screen>
  if (!post || error) return <Screen title="장소 기록" back><Empty title="기록을 찾을 수 없습니다." description={error || '비공개 기록이거나 삭제된 기록입니다.'} /><Button title="피드로 돌아가기" onPress={() => router.replace('/feed')} /><Button title="다시 시도" variant="secondary" onPress={() => void load()} /></Screen>
  const titleSize = Math.min(41.6, Math.max(28, width * 0.03))

  const tile = galleryWidth ? (galleryWidth - 8) / 2 : undefined
  const main = <View style={[styles.main, wide && styles.mainWide]}>
    <View style={styles.heading}>
      {!!post.groupId && <Pressable accessibilityRole="link" hitSlop={10} onPress={() => router.push('/groups/' + post.groupId)} style={styles.pill}><Text style={styles.pillText}>이 핀의 그룹 둘러보기 →</Text></Pressable>}
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.eyebrow}>{formatDateKey(post.dateKey)}</Text>
          <Text accessibilityRole="header" style={[styles.title, { fontSize: titleSize, lineHeight: titleSize * 1.3, letterSpacing: titleSize * -0.035 }]}>{post.title}</Text>
        </View>
        <PostActionsMenu key={post.id} post={post} isOwner={owner} canReport={!!uid && !owner} busy={deleteBusy}
          onEdit={() => router.push({ pathname: '/posts/edit', params: { postId: post.id } })} onShare={() => void share()}
          onDelete={() => Alert.alert('이 기록을 삭제할까요?', '', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void removePost() }])} />
      </View>
    </View>
    {post.photoUrls.length > 0 && <View style={styles.gallery} onLayout={event => setGalleryWidth(event.nativeEvent.layout.width)}>{post.photoUrls.map((url, index) => <View key={url + index} style={index === 0 ? styles.leadFigure : [styles.figure, { width: tile }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={post.title + ' 사진 ' + (index + 1) + ' 확대'} onPress={() => setPhotoIndex(index)}>
        {index === 0 ? <LeadPhoto uri={url} /> : <RemoteImage uri={url} style={styles.photo} contentFit="cover" />}
      </Pressable>
      {!owner && <View style={styles.photoCaption}><Text style={styles.caption}>사진 {index + 1}</Text>{uid ? <ReportButton compact label="사진 신고" target={{ kind: 'photo', sourceKind: 'pin', targetId: post.id, photoUrl: url, label: post.title + ' 사진 ' + (index + 1) }} /> : <Pressable accessibilityRole="link" style={styles.captionLink} onPress={() => router.push('/login')}><Text style={styles.caption}>로그인 후 사진 신고</Text></Pressable>}</View>}
    </View>)}</View>}
    {!!post.content && <Text selectable style={styles.body}>{post.content}</Text>}
    {!!actionError && <View style={styles.message}><Notice error>{actionError}</Notice></View>}
    {!available && <Button title="기록 다시 불러오기" variant="secondary" style={styles.message} onPress={() => { setRevision(value => value + 1); void load(); }} />}
    <View style={styles.reactions}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: liked, disabled: likeBusy || !available || (!!uid && !likeReady) }} accessibilityLabel={(liked ? '좋아요 취소' : '좋아요') + ' ' + counts.likeCount + '개'} disabled={likeBusy || !available || (!!uid && !likeReady)} style={({ pressed }) => [styles.reaction, (likeBusy || !available) && styles.disabled, pressed && { opacity: 0.6 }]} onPress={() => void toggleLike()}><Heart size={19} color={liked ? p.coral : p.muted} fill={liked ? p.coral : 'none'} /><Text style={[styles.reactionText, liked && { color: p.coral }]}>좋아요 {counts.likeCount}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!available} style={({ pressed }) => [styles.reaction, !available && styles.disabled, pressed && { opacity: 0.6 }]} onPress={focusComments}><MessageCircle size={19} color={p.muted} /><Text style={styles.reactionText}>댓글 {counts.commentCount}</Text></Pressable>
      <SharePinButton post={post} />
    </View>
    {available && <View style={styles.comments} onLayout={event => { commentsPosition.current = event.nativeEvent.layout.y; }}><CommentThread key={post.id + '-' + uid} post={post} commentId={commentId} replyId={replyId} onJump={jump} inputRef={commentInput} /></View>}
  </View>

  // The place and record panels sit beside the record on wide screens and after it on phones.
  const aside = <View style={[styles.aside, wide && styles.asideWide]}>
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>장소</Text>
      <Text style={styles.panelText}>{post.address || post.placeName}</Text>
      <Text style={styles.small}>좌표 {post.lat.toFixed(5)}, {post.lng.toFixed(5)}</Text>
      <Text accessibilityRole="link" style={styles.mapLink} onPress={() => void Linking.openURL(getExternalMapUrl(post)).catch(e => setActionError(errorMessage(e)))}>지도에서 위치 열기</Text>
      <DirectionsButton destination={post} placeName={post.placeName} />
    </View>
    {isValidLocation(post) && <View style={styles.map}><NativeMap key={post.id + '-' + post.lat + '-' + post.lng} center={{ lat: post.lat, lng: post.lng }} posts={[post]} bottomInset={0} onPick={() => {}} onSelect={() => {}} /></View>}
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>기록 정보</Text>
      <Text style={styles.panelText}>{visibilityLabels[post.visibility]} 기록</Text>
      <Text style={styles.small}><Text accessibilityRole="link" style={styles.author} onPress={() => router.push('/people/' + post.uid)}>{post.authorNickname}</Text> · 작성 {formatTimestamp(post.createdAt)}</Text>
    </View>
  </View>

  return <Screen scroll={false} avoidKeyboard={false}>
    <FormScrollView ref={scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={p.primary} />} contentContainerStyle={[styles.scrollContent, wide && styles.scrollWide]}>
      <View ref={content} collapsable={false} style={[styles.layout, wide && styles.layoutWide]}>{main}{aside}</View>
    </FormScrollView>
    {photoIndex !== null && <PhotoViewer post={post} startIndex={photoIndex} onClose={() => setPhotoIndex(null)} />}
  </Screen>
}

// The first photo keeps its own proportions (up to 640px tall); the rest form a square grid.
function LeadPhoto({ uri }: { uri: string }) {
  const [ratio, setRatio] = useState(4 / 3)
  return <RemoteImage uri={uri} contentFit="contain" onLoad={event => { const { width, height } = event.source; if (width && height) setRatio(width / height) }} style={[styles.leadPhoto, { aspectRatio: ratio }]} />
}

function PhotoViewer({ post, startIndex, onClose }: { post: Post; startIndex: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions()
  const [index, setIndex] = useState(startIndex)
  return <Modal visible animationType="fade" onRequestClose={onClose}><SafeAreaView style={styles.viewer}><View style={styles.viewerHeader}><Text style={styles.viewerCount}>{index + 1} / {post.photoUrls.length}</Text><Pressable accessibilityRole="button" accessibilityLabel="사진 닫기" style={styles.iconButton} onPress={onClose}><X size={26} color="#FFFFFF" /></Pressable></View><ScrollView horizontal pagingEnabled contentOffset={{ x: startIndex * width, y: 0 }} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => setIndex(Math.max(0, Math.min(post.photoUrls.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))))}>{post.photoUrls.map((url, photo) => <ScrollView key={`${url}-${photo}`} minimumZoomScale={1} maximumZoomScale={4} centerContent style={{ width }} contentContainerStyle={{ width, height: Math.max(200, height - 150), justifyContent: 'center' }}><RemoteImage uri={url} accessibilityLabel={`${post.title} 사진 ${photo + 1}`} contentFit="contain" style={{ width, height: Math.max(200, height - 160) }} /></ScrollView>)}</ScrollView></SafeAreaView></Modal>
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 60, alignItems: 'center', gap: 15 }, status: { color: p.muted, fontSize: 14, lineHeight: 25 },
  scrollContent: { width: '100%', maxWidth: 1168, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 32, paddingBottom: 112 }, scrollWide: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 72 },
  layout: { gap: 24 }, layoutWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 }, main: { minWidth: 0 }, mainWide: { flex: 1 },
  heading: { marginBottom: 22 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 }, titleCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: p.primary, fontSize: 13, fontWeight: '700', marginBottom: 8 }, title: { color: p.ink, fontWeight: '600' },
  pill: { alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 4, backgroundColor: p.primarySoft }, pillText: { color: p.primary, fontSize: 11.5, fontWeight: '600' },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, leadFigure: { width: '100%' }, figure: { width: '48%' },
  leadPhoto: { width: '100%', maxHeight: 640, borderRadius: 6, backgroundColor: p.surface }, photo: { width: '100%', aspectRatio: 1, borderRadius: 6, backgroundColor: p.surface },
  photoCaption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 4 }, caption: { color: p.muted, fontSize: 12 }, captionLink: { minHeight: 44, justifyContent: 'center' },
  body: { marginTop: 22, color: p.ink, fontSize: 16, lineHeight: 28.8 }, message: { marginTop: 12 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 8, columnGap: 20, marginTop: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: p.line },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingVertical: 4 }, reactionText: { color: p.muted, fontSize: 13.76 }, disabled: { opacity: 0.5 },
  comments: { marginTop: 12 },
  aside: { gap: 14 }, asideWide: { width: 340 },
  panel: { padding: 16, gap: 8, borderRadius: 6, borderWidth: 1, borderColor: p.line, backgroundColor: p.paper },
  panelTitle: { color: p.ink, fontSize: 16.8, fontWeight: '600', marginBottom: 2 }, panelText: { color: p.ink, fontSize: 16, lineHeight: 24.8 }, small: { color: p.muted, fontSize: 13, lineHeight: 20 },
  mapLink: { marginTop: 4, color: p.primary, fontSize: 14.4, textDecorationLine: 'underline' }, author: { color: p.primary, fontWeight: '600' },
  map: { height: 260, overflow: 'hidden', borderRadius: 6, borderWidth: 1, borderColor: p.line, backgroundColor: p.surface },
  iconButton: { padding: 9 }, viewer: { flex: 1, backgroundColor: p.viewer }, viewerHeader: { paddingHorizontal: 18, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, viewerCount: { color: '#FFFFFF', fontSize: 14 },
})
