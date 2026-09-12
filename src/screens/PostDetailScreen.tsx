import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router'
import { Heart, MapPin, MessageCircle, Pencil, Share2, Trash2, X } from 'lucide-react-native'
import { Avatar, Button, Empty, Notice, Screen, p } from '../components/ui'
import NativeMap from '../components/NativeMap'
import { ReportButton } from '../components/ReportButton'
import { CommentThread } from '../components/CommentThread'
import { useAuth } from '../hooks/useAuth'
import { formatDateKey, formatTimestamp } from '../lib/date'
import { getExternalMapUrl, isValidLocation } from '../lib/mapLocation'
import { getPostById, deletePost } from '../services/postService'
import { subscribeToLikeStatus, subscribeToPostReactions, togglePostLike } from '../services/likeService'
import type { Post } from '../types/post'

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.'
const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || '' : value || ''
const webUrl = (process.env.EXPO_PUBLIC_WEB_URL || 'https://spotitmap.kr').replace(/\/$/, '')
const visibilityLabels = { private: '나만 보기', followers: '팔로워 공개', public: '전체 공개', group: '그룹 멤버 공개' }

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId?: string | string[]; commentId?: string | string[]; replyId?: string | string[]; '#': string }>()
  const postId = param(params.postId)
  const hash = param(params['#'])
  const commentId = param(params.commentId) || (hash.startsWith('comment-') ? hash.slice(8) : '')
  const replyId = param(params.replyId) || (hash.startsWith('reply-') ? hash.slice(6) : '')
  const { currentUser, profile, firebaseReady } = useAuth()
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
  const [counts, setCounts] = useState({ likeCount: 0, commentCount: 0 })
  const [revision, setRevision] = useState(0)
  const request = useRef(0)
  const likePending = useRef(false)
  const scroll = useRef<ScrollView>(null)
  const content = useRef<View>(null)
  const commentInput = useRef<TextInput>(null)
  const commentsPosition = useRef(0)
  const { width } = useWindowDimensions()
  const owner = !!uid && uid === post?.uid
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
    if (!post || !uid || deleteBusy) return
    setDeleteBusy(true); setActionError('')
    try { await deletePost(post.id, uid); router.replace('/my') }
    catch (e) { setActionError(errorMessage(e)); setDeleteBusy(false) }
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
  if (loading && !post) return <Screen title="장소 기록" back><View style={styles.loading}><ActivityIndicator color={p.primary} /><Text style={styles.muted}>기록을 불러오는 중입니다.</Text></View></Screen>
  if (!post || error) return <Screen title="장소 기록" back><Empty title="기록을 찾을 수 없습니다" description={error || '비공개 기록이거나 삭제된 기록입니다.'} /><Button title="다시 시도" variant="secondary" onPress={() => void load()} /><Button title="피드로 돌아가기" onPress={() => router.replace('/feed')} /></Screen>
  return <Screen title="장소 기록" back scroll={false} right={<Pressable accessibilityRole="button" accessibilityLabel="핀 공유" style={styles.iconButton} onPress={() => void share()}><Share2 size={21} color={p.primary} /></Pressable>}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={p.primary} />} contentContainerStyle={styles.scrollContent}>
      <View ref={content} collapsable={false} style={styles.content}>
        <View style={styles.heading}>
          {post.groupId ? <Pressable accessibilityRole="button" onPress={() => router.push(`/groups/${post.groupId}` as Href)} style={styles.group}><Text style={styles.link}>이 핀의 그룹 둘러보기 →</Text></Pressable> : null}
          <View style={styles.row}><View style={[styles.pinDot, { backgroundColor: post.pinColor || p.coral }]} /><Text style={styles.date}>{formatDateKey(post.dateKey)}</Text><Text style={styles.small}>· {visibilityLabels[post.visibility]}</Text></View>
          <Text style={styles.title}>{post.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${post.authorNickname} 프로필`} style={styles.row} onPress={() => router.push(`/people/${encodeURIComponent(post.uid)}` as Href)}><Avatar name={post.authorNickname} size={32} /><Text style={styles.author}>{post.authorNickname}</Text><Text style={styles.small}>님의 장소 기록</Text></Pressable>
        </View>
        {post.photoUrls.length ? <View style={styles.gallery}><ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>{post.photoUrls.map((url, index) => <View key={`${url}-${index}`} style={{ width: Math.max(240, width - 40), gap: 8 }}><Pressable accessibilityRole="button" accessibilityLabel={`${post.title} 사진 ${index + 1} 확대`} onPress={() => setPhotoIndex(index)}><Image source={{ uri: url }} style={styles.photo} resizeMode="cover" /></Pressable><View style={styles.photoCaption}><Text style={styles.small}>사진 {index + 1} / {post.photoUrls.length}</Text>{!owner && uid ? <ReportButton compact label="사진 신고" target={{ kind: 'photo', sourceKind: 'pin', targetId: post.id, photoUrl: url, label: `${post.title} 사진 ${index + 1}` }} /> : null}</View></View>)}</ScrollView></View> : null}
        {post.content ? <Text selectable style={styles.body}>{post.content}</Text> : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: liked, disabled: likeBusy || !available || (!!uid && !likeReady) }} accessibilityLabel={`${liked ? '좋아요 취소' : '좋아요'} ${counts.likeCount}개`} disabled={likeBusy || !available || (!!uid && !likeReady)} style={[styles.action, liked && styles.liked]} onPress={() => void toggleLike()}>{likeBusy ? <ActivityIndicator size="small" color={p.coral} /> : <Heart size={19} color={liked ? p.coral : p.muted} fill={liked ? p.coral : 'transparent'} />}<Text style={styles.actionText}>좋아요 {counts.likeCount}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={!available} style={styles.action} onPress={focusComments}><MessageCircle size={19} color={p.primary} /><Text style={styles.actionText}>댓글 {counts.commentCount}</Text></Pressable>
          {owner ? <><Pressable accessibilityRole="button" accessibilityLabel="핀 수정" disabled={deleteBusy} style={styles.action} onPress={() => router.push({ pathname: '/posts/edit', params: { postId: post.id } } as Href)}><Pencil size={17} color={p.primary} /><Text style={styles.actionText}>수정</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="핀 삭제" disabled={deleteBusy} style={styles.action} onPress={() => Alert.alert('기록 삭제', '이 기록과 연결된 내용을 삭제할까요?', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void removePost() }])}>{deleteBusy ? <ActivityIndicator color={p.coral} /> : <Trash2 size={17} color={p.coral} />}<Text style={[styles.actionText, { color: p.coral }]}>삭제</Text></Pressable></> : uid ? <><ReportButton target={{ kind: 'pin', targetId: post.id, label: post.title }} label="핀 신고" /><ReportButton target={{ kind: 'user', targetId: post.uid, label: post.authorNickname }} label="작성자 신고" /></> : null}
        </View>
        {actionError ? <Notice error>{actionError}</Notice> : null}{!available ? <Button title="기록 다시 불러오기" variant="secondary" onPress={() => { setRevision(value => value + 1); void load() }} /> : null}
        <View style={styles.card}><View style={styles.row}><MapPin size={21} color={p.primary} /><Text style={styles.sectionTitle}>{post.placeName}</Text></View><Text style={styles.muted}>{post.address || post.placeName}</Text>
          {isValidLocation(post) ? <><View style={styles.map}><NativeMap key={`${post.id}-${post.lat}-${post.lng}`} center={{ lat: post.lat, lng: post.lng }} posts={[post]} onPick={() => {}} onSelect={() => router.push({ pathname: '/map', params: { lat: String(post.lat), lng: String(post.lng), postId: post.id } } as Href)} /></View><Text style={styles.small}>좌표 {post.lat.toFixed(5)}, {post.lng.toFixed(5)}</Text><Button title="지도에서 위치 열기" variant="secondary" onPress={() => void Linking.openURL(getExternalMapUrl(post, post.placeName)).catch(e => setActionError(errorMessage(e)))} /></> : null}
        </View>
        <View style={styles.card}><Text style={styles.sectionTitle}>기록 정보</Text><Text style={styles.muted}>{visibilityLabels[post.visibility]} 기록</Text><Text style={styles.small}>작성 {formatTimestamp(post.createdAt)}</Text></View>
        {available ? <View onLayout={event => { commentsPosition.current = event.nativeEvent.layout.y }}><CommentThread key={`${post.id}-${uid}`} post={post} commentId={commentId} replyId={replyId} onJump={jump} inputRef={commentInput} /></View> : null}
      </View>
    </ScrollView>
    {photoIndex !== null ? <PhotoViewer post={post} startIndex={photoIndex} onClose={() => setPhotoIndex(null)} /> : null}
  </Screen>
}

function PhotoViewer({ post, startIndex, onClose }: { post: Post; startIndex: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions()
  const [index, setIndex] = useState(startIndex)
  return <Modal visible animationType="fade" onRequestClose={onClose}><SafeAreaView style={styles.viewer}><View style={styles.viewerHeader}><Text style={styles.viewerCount}>{index + 1} / {post.photoUrls.length}</Text><Pressable accessibilityRole="button" accessibilityLabel="사진 닫기" style={styles.iconButton} onPress={onClose}><X size={26} color="#FFFFFF" /></Pressable></View><ScrollView horizontal pagingEnabled contentOffset={{ x: startIndex * width, y: 0 }} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => setIndex(Math.max(0, Math.min(post.photoUrls.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))))}>{post.photoUrls.map((url, photo) => <ScrollView key={`${url}-${photo}`} minimumZoomScale={1} maximumZoomScale={4} centerContent style={{ width }} contentContainerStyle={{ width, height: Math.max(200, height - 150), justifyContent: 'center' }}><Image source={{ uri: url }} accessibilityLabel={`${post.title} 사진 ${photo + 1}`} resizeMode="contain" style={{ width, height: Math.max(200, height - 160) }} /></ScrollView>)}</ScrollView></SafeAreaView></Modal>
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 60, alignItems: 'center', gap: 15 }, scrollContent: { padding: 20, paddingBottom: 50 }, content: { gap: 23 }, heading: { gap: 15 }, title: { fontSize: 31, lineHeight: 40, letterSpacing: -0.8, color: p.ink, fontWeight: '800' }, date: { color: p.primary, fontSize: 13, fontWeight: '700' }, pinDot: { width: 8, height: 8, borderRadius: 4 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, small: { color: p.muted, fontSize: 12, lineHeight: 19 }, muted: { color: p.muted, fontSize: 14, lineHeight: 23 }, body: { color: p.ink, fontSize: 16, lineHeight: 29 }, author: { color: p.ink, fontSize: 14, fontWeight: '700' }, link: { color: p.primary, fontSize: 12, fontWeight: '600' }, group: { alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 13, backgroundColor: p.primarySoft, borderRadius: 20 },
  gallery: { borderRadius: 20, overflow: 'hidden' }, photo: { width: '100%', aspectRatio: 1.05, backgroundColor: p.surface, borderRadius: 20 }, photoCaption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 7 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, action: { flexDirection: 'row', gap: 7, alignItems: 'center', borderWidth: 1, borderColor: p.line, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: p.paper }, actionText: { fontSize: 13, color: p.ink, fontWeight: '600' }, liked: { backgroundColor: '#FBE9E1', borderColor: '#E7B9A7' }, iconButton: { padding: 9 },
  card: { padding: 18, borderRadius: 20, borderWidth: 1, borderColor: p.line, backgroundColor: p.paper, gap: 13 }, sectionTitle: { color: p.ink, fontSize: 18, fontWeight: '700', flexShrink: 1 }, map: { height: 210, overflow: 'hidden', borderRadius: 15, backgroundColor: p.surface }, viewer: { flex: 1, backgroundColor: '#111111' }, viewerHeader: { paddingHorizontal: 18, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, viewerCount: { color: '#FFFFFF', fontSize: 14 },
})
