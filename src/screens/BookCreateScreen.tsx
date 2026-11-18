import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { randomUUID } from 'expo-crypto'
import { ChevronDown, ChevronLeft, ChevronUp, Minus, Plus } from 'lucide-react-native'
import { Text } from '../components/Typography'
import { RemoteImage } from '../components/RemoteImage'
import { Button, Chip, IconButton, Notice, SearchBox, p } from '../components/ui'
import { BookCover, COVER_STYLES } from '../components/book/BookCover'
import { useAuth } from '../hooks/useAuth'
import { getUserPosts } from '../services/postService'
import { measurePhotos } from '../services/bookPhotoService'
import { printPxOf } from '../lib/photoPrint'
import { createBook, newBookId } from '../services/bookService'
import { getPostCoverThumbnail, type Post } from '../types/post'
import type { BookCoverStyle, BookDraft, BookImageRef } from '../types/book'
import { BOOK_DRAFT_SCHEMA_VERSION, BOOK_SUBTITLE_MAX, BOOK_TITLE_MAX } from '../lib/book/draft'
import { estimateBookPages, layoutBook, suggestPageCount, type LayoutRecord } from '../lib/book/layout'
import { getBookSpec } from '../lib/book/specs'
import { BOOK_PRICE_KRW, formatWon, groupByMonth, matchesQuery, moveRecord, sortByDate, toggleGroup, toggleRecord } from '../lib/book/selection'

const spec = getBookSpec('a5-soft')
const FLOW = ['핀 고르기', '기본 설정', '꾸미기', '미리보기', '주문'] as const
type Step = 'pick' | 'order' | 'settings'

const shortDate = (dateKey: string) => (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? `${dateKey.slice(5, 7)}.${dateKey.slice(8, 10)}` : '')
const recordMeta = (post: Post) => [post.placeName, shortDate(post.dateKey)].filter(Boolean).join(' · ')

export default function BookCreateScreen() {
  const { currentUser } = useAuth()
  return currentUser ? <CreateFlow uid={currentUser.uid} /> : null
}

function leave() {
  if (router.canGoBack()) router.back()
  else router.replace('/books')
}

function CreateFlow({ uid }: { uid: string }) {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [step, setStep] = useState<Step>('pick')
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [photosOnly, setPhotosOnly] = useState(false)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [coverStyle, setCoverStyle] = useState<BookCoverStyle>('photo')
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [creating, setCreating] = useState<string>('')
  /** Creation is queued until the device is online; leaving is fine then. */
  const [waiting, setWaiting] = useState(false)
  const busy = !!creating && !waiting
  const [createError, setCreateError] = useState('')
  // A book whose creation finishes after the user left this screen must not pull them back.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    let active = true
    // Only the signed-in user's own records: another account's pins never reach this list.
    getUserPosts(uid)
      .then(next => { if (active) { setPosts(next); setLoadError('') } })
      .catch(() => { if (active) setLoadError('내 기록을 불러오지 못했어요.') })
    return () => { active = false }
  }, [uid, attempt])

  const back = () => {
    if (busy) return
    // The queued book is still created once online; the list shows it then.
    if (waiting) return leave()
    if (step === 'pick') leave()
    else setStep('pick')
  }
  useEffect(() => {
    if (step === 'pick') return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) { if (waiting) leave(); else setStep('pick') }
      return true
    })
    return () => subscription.remove()
  }, [step, busy, waiting])

  const byId = useMemo(() => new Map((posts ?? []).map(post => [post.id, post])), [posts])
  const chosen = selected.map(id => byId.get(id)).filter((post): post is Post => !!post)
  const photoCount = chosen.reduce((sum, post) => sum + post.photoUrls.length, 0)
  const contentPages = estimateBookPages(chosen.map(post => ({ title: post.title, placeName: post.placeName, dateKey: post.dateKey, content: post.content, photoCount: post.photoUrls.length })), spec)
  const minPages = suggestPageCount(contentPages, spec)
  const pages = minPages === null ? null : Math.max(minPages, pageCount ?? minPages)
  const coverPost = chosen.find(post => post.photoUrls.length > 0)
  const coverPreview: BookImageRef | null = coverPost ? { postId: coverPost.id, photoIndex: 0, url: coverPost.photoUrls[0], thumbUrl: getPostCoverThumbnail(coverPost), pxWidth: 1, pxHeight: 1 } : null

  const create = async () => {
    if (!pages || !title.trim() || creating) return
    setCreateError('')
    const urls = chosen.flatMap(post => post.photoUrls)
    setCreating(urls.length ? `사진 확인 중 0/${urls.length}` : '책을 만드는 중…')
    try {
      const sizes = await measurePhotos(urls, done => setCreating(`사진 확인 중 ${done}/${urls.length}`))
      if (urls.length && sizes.every(size => size === null)) {
        // Every photo failed: almost always no connection. A book without its photos is not what was asked for.
        setCreateError('사진을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
        setCreating('')
        return
      }
      setCreating('책을 만드는 중…')
      let cursor = 0
      const records: LayoutRecord[] = chosen.map(post => {
        const photos: BookImageRef[] = []
        post.photoUrls.forEach((url, index) => {
          const size = sizes[cursor++]
          // A photo that cannot be read is left out; the user can add it again in the editor.
          if (size) photos.push({ postId: post.id, photoIndex: index, url, pxWidth: size.width, pxHeight: size.height, ...(post.photoThumbnailUrls?.[index] ? { thumbUrl: post.photoThumbnailUrls[index] } : {}), ...printPxOf(post, index) })
        })
        return { postId: post.id, title: post.title, placeName: post.placeName, dateKey: post.dateKey, content: post.content, photos }
      })
      const id = newBookId()
      const draft: BookDraft = {
        schemaVersion: BOOK_DRAFT_SCHEMA_VERSION, id, title: title.trim(), subtitle: subtitle.trim(), specId: spec.id,
        coverStyle, coverPhoto: records.flatMap(record => record.photos)[0] ?? null,
        sourcePostIds: chosen.map(post => post.id), updatedAt: new Date().toISOString(),
        pages: layoutBook({ title, subtitle, records, pageCount: pages }, spec, randomUUID),
      }
      // Firestore keeps an offline write queued instead of failing it, so say what is happening.
      const slow = setTimeout(() => {
        if (!alive.current) return
        setWaiting(true)
        setCreating('연결을 기다리는 중이에요. 연결되면 책이 만들어지고, 이 화면은 나가셔도 돼요.')
      }, 5000)
      try {
        await createBook(uid, draft)
      } finally {
        clearTimeout(slow)
        if (alive.current) setWaiting(false)
      }
      if (alive.current) router.replace({ pathname: '/books/[bookId]/edit', params: { bookId: id } })
    } catch {
      if (!alive.current) return
      setCreateError('책을 만들지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
      setCreating('')
    }
  }

  const header = (label: string, right?: ReactNode) => <View style={styles.top}>
    <IconButton label="뒤로 가기" disabled={busy} onPress={back}><ChevronLeft size={22} color={p.ink} /></IconButton>
    <Text accessibilityRole="header" style={styles.topTitle}>{label}</Text>
    {right}
  </View>
  const progress = (index: number) => <View style={styles.progress} accessibilityLabel={`${FLOW.length}단계 중 ${index + 1}단계, ${FLOW[index]}`}>
    <Text style={styles.progressText}>{index + 1}/{FLOW.length}  <Text style={styles.progressName}>{FLOW[index]}</Text></Text>
    <View style={styles.progressBar}>{FLOW.map((name, i) => <View key={name} style={[styles.progressPart, i <= index && styles.progressDone]} />)}</View>
  </View>

  if (step === 'order') return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    {header('순서 바꾸기', <Pressable accessibilityRole="button" onPress={() => setSelected(sortByDate(selected, posts ?? []))} style={styles.textAction}>
      <Text style={styles.textActionLabel}>날짜순 정렬</Text>
    </Pressable>)}
    <ScrollView contentContainerStyle={styles.list}>
      {chosen.map((post, index) => <View key={post.id} style={styles.row}>
        <Text style={styles.orderNumber}>{index + 1}</Text>
        <Thumb post={post} />
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={styles.rowTitle}>{post.title || post.placeName || '제목 없는 기록'}</Text>
          <Text numberOfLines={1} style={styles.rowMeta}>{recordMeta(post)}</Text>
        </View>
        <IconButton label={`${index + 1}번 앞으로`} disabled={index === 0} onPress={() => setSelected(moveRecord(selected, index, -1))}><ChevronUp size={20} color={p.ink} /></IconButton>
        <IconButton label={`${index + 1}번 뒤로`} disabled={index === chosen.length - 1} onPress={() => setSelected(moveRecord(selected, index, 1))}><ChevronDown size={20} color={p.ink} /></IconButton>
      </View>)}
    </ScrollView>
    <View style={styles.bottom}><Button title="순서 저장" style={styles.bottomButton} onPress={() => setStep('pick')} /></View>
  </SafeAreaView>

  if (step === 'settings') return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    {header('기본 설정')}
    {progress(1)}
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <View style={styles.field}>
        <Text style={styles.label}>책 제목</Text>
        <TextInput value={title} onChangeText={value => setTitle(value.slice(0, BOOK_TITLE_MAX))} maxLength={BOOK_TITLE_MAX} placeholder="예: 2026, 우리가 걸었던 길" placeholderTextColor={p.light} accessibilityLabel="책 제목" style={styles.input} />
        <Text style={styles.hint}>{title.length} / {BOOK_TITLE_MAX}자 · 표지와 책등에 들어가요</Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>부제 (선택)</Text>
        <TextInput value={subtitle} onChangeText={value => setSubtitle(value.slice(0, BOOK_SUBTITLE_MAX))} maxLength={BOOK_SUBTITLE_MAX} placeholderTextColor={p.light} accessibilityLabel="부제" style={styles.input} />
        <Text style={styles.hint}>첫 쪽에 들어가요</Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>표지 디자인</Text>
        <View style={styles.covers}>
          {COVER_STYLES.map(option => {
            const on = coverStyle === option.id
            return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`표지 ${option.label}`} onPress={() => setCoverStyle(option.id)} style={styles.coverOption}>
              <View style={[styles.coverFrame, on && styles.coverFrameOn]}><BookCover coverStyle={option.id} title={title} photo={coverPreview} width={88} /></View>
              <Text style={[styles.coverLabel, on && styles.coverLabelOn]}>{option.label}</Text>
            </Pressable>
          })}
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>판형</Text>
        <Text style={styles.value}>{spec.label}</Text>
        <Text style={styles.hint}>{spec.trimMm.w} × {spec.trimMm.h}mm · 지금은 이 판형만 만들 수 있어요</Text>
      </View>
      <View style={styles.field}>
        <View style={styles.pageRow}>
          <Text style={styles.label}>페이지 수</Text>
          <View style={styles.stepper}>
            <IconButton label="2쪽 줄이기" disabled={!pages || !minPages || pages <= minPages} onPress={() => pages && setPageCount(pages - spec.pages.step)}><Minus size={18} color={p.ink} /></IconButton>
            <Text style={styles.pageValue}>{pages ?? '-'}쪽</Text>
            <IconButton label="2쪽 늘리기" disabled={!pages || pages >= spec.pages.max} onPress={() => pages && setPageCount(pages + spec.pages.step)}><Plus size={18} color={p.ink} /></IconButton>
          </View>
        </View>
        <Text style={styles.hint}>기록 {chosen.length}개·사진 {photoCount}장이 들어가는 {minPages ?? '-'}쪽부터 고를 수 있어요. 최대 {spec.pages.max}쪽, {spec.pages.step}쪽 단위예요. 남는 쪽은 빈 페이지로 시작해요.</Text>
      </View>
      <View style={styles.price}>
        <View style={styles.priceRow}><Text style={styles.priceLabel}>제작비 ({spec.label} · {pages ?? '-'}쪽)</Text><Text style={styles.priceValue}>{formatWon(BOOK_PRICE_KRW.base)}</Text></View>
        <View style={styles.priceRow}><Text style={styles.priceLabel}>배송비</Text><Text style={styles.priceValue}>{formatWon(BOOK_PRICE_KRW.shipping)}</Text></View>
        <View style={[styles.priceRow, styles.priceTotal]}><Text style={styles.totalLabel}>예상 금액</Text><Text style={styles.totalValue}>{formatWon(BOOK_PRICE_KRW.base + BOOK_PRICE_KRW.shipping)}</Text></View>
        <Text style={styles.hint}>예상 금액이에요. 쪽 수에 따른 가격과 실제 결제 금액은 주문할 때 확정돼요.</Text>
      </View>
      {!!createError && <Notice error>{createError}</Notice>}
    </ScrollView>
    <View style={styles.bottom}>
      {creating ? <View style={styles.creating}><ActivityIndicator color={p.primary} /><Text style={styles.rowMeta}>{creating}</Text></View>
        : <Button title="페이지 꾸미기" style={styles.bottomButton} disabled={!title.trim() || !pages} onPress={() => void create()} />}
    </View>
  </SafeAreaView>

  const visible = (posts ?? []).filter(post => (!photosOnly || post.photoUrls.length > 0) && matchesQuery(post, query))
  const groups = groupByMonth(visible)
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    {header('핀 고르기')}
    {progress(0)}
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <SearchBox value={query} onChangeText={setQuery} placeholder="장소나 제목으로 찾기" accessibilityLabel="기록 찾기" />
      <View style={styles.chips}><Chip label="사진 있는 기록" selected={photosOnly} onPress={() => setPhotosOnly(value => !value)} /></View>
      {!!loadError && <Notice error>{loadError}</Notice>}
      {!!loadError && <Button variant="secondary" title="다시 불러오기" onPress={() => { setLoadError(''); setAttempt(value => value + 1) }} />}
      {!posts && !loadError && <ActivityIndicator color={p.primary} style={{ marginTop: 24 }} />}
      {posts?.length === 0 && <Text style={styles.empty}>아직 남긴 기록이 없어요. 지도에 핀을 남기면 책에 담을 수 있어요.</Text>}
      {posts && posts.length > 0 && visible.length === 0 && <Text style={styles.empty}>찾는 기록이 없어요.</Text>}
      {groups.map(group => {
        const ids = group.records.map(post => post.id)
        const all = ids.every(id => selected.includes(id))
        return <View key={group.key}>
          <View style={styles.groupHeader}>
            <Text style={styles.groupTitle}>{group.label} · {group.records.length}개</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${group.label} ${all ? '선택 해제' : '모두 선택'}`} onPress={() => setSelected(toggleGroup(selected, ids))} style={styles.textAction}>
              <Text style={styles.textActionLabel}>{all ? '선택 해제' : '모두 선택'}</Text>
            </Pressable>
          </View>
          {group.records.map(post => {
            const order = selected.indexOf(post.id)
            return <Pressable key={post.id} accessibilityRole="checkbox" accessibilityState={{ checked: order >= 0 }}
              accessibilityLabel={`${post.title || post.placeName || '제목 없는 기록'}${order >= 0 ? `, ${order + 1}번째로 선택됨` : ''}`}
              onPress={() => setSelected(toggleRecord(selected, post.id))} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
              <Thumb post={post} />
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={styles.rowTitle}>{post.title || post.placeName || '제목 없는 기록'}</Text>
                <Text numberOfLines={1} style={styles.rowMeta}>{recordMeta(post)}</Text>
                <Text numberOfLines={1} style={styles.rowMeta}>사진 {post.photoUrls.length} · 글 {post.content.trim().length}자</Text>
              </View>
              <View style={[styles.check, order >= 0 && styles.checkOn]}>{order >= 0 && <Text style={styles.checkText}>{order + 1}</Text>}</View>
            </Pressable>
          })}
        </View>
      })}
    </ScrollView>
    <View style={[styles.bottom, styles.bottomBar]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.summary}>{selected.length}개 선택</Text>
        <Text numberOfLines={1} style={[styles.rowMeta, minPages === null && { color: p.danger }]}>
          {minPages === null ? `${spec.pages.max}쪽을 넘어요. 기록을 줄여 주세요.` : `예상 ${minPages}쪽 · 사진 ${photoCount}장`}
        </Text>
        {selected.length > 1 && <Pressable accessibilityRole="button" onPress={() => setStep('order')} hitSlop={6}><Text style={styles.textActionLabel}>순서 바꾸기</Text></Pressable>}
      </View>
      <Button title="다음" style={{ minWidth: 120 }} disabled={!selected.length || minPages === null} onPress={() => setStep('settings')} />
    </View>
  </SafeAreaView>
}

function Thumb({ post }: { post: Post }) {
  const uri = getPostCoverThumbnail(post)
  return <View style={styles.thumb}>{uri ? <RemoteImage uri={uri} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}</View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: p.bg },
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 4, gap: 2 },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: p.ink },
  textAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  textActionLabel: { fontSize: 14, fontWeight: '600', color: p.primary },
  progress: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  progressText: { fontSize: 13, color: p.muted },
  progressName: { fontSize: 13, fontWeight: '700', color: p.ink },
  progressBar: { flexDirection: 'row', gap: 4 },
  progressPart: { flex: 1, height: 4, borderRadius: 2, backgroundColor: p.line },
  progressDone: { backgroundColor: p.primary },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 4 },
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
  empty: { fontSize: 15, lineHeight: 23, color: p.muted, paddingVertical: 24 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  groupTitle: { fontSize: 14, fontWeight: '600', color: p.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: p.line },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: p.ink },
  rowMeta: { fontSize: 13, color: p.muted },
  thumb: { width: 56, height: 56, borderRadius: 4, overflow: 'hidden', backgroundColor: p.surface },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: p.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: p.primary, borderColor: p.primary },
  checkText: { color: p.paper, fontSize: 14, fontWeight: '700' },
  orderNumber: { width: 22, textAlign: 'center', fontSize: 15, fontWeight: '700', color: p.primary },
  bottom: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderColor: p.line, backgroundColor: p.paper },
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bottomButton: { minHeight: 52 },
  summary: { fontSize: 16, fontWeight: '700', color: p.ink },
  creating: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  form: { paddingHorizontal: 16, paddingBottom: 32, gap: 22 },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: '600', color: p.ink },
  value: { fontSize: 16, fontWeight: '600', color: p.ink },
  input: { minHeight: 48, borderWidth: 1, borderColor: p.line, borderRadius: 6, paddingHorizontal: 14, fontSize: 16, color: p.ink, backgroundColor: p.paper },
  hint: { fontSize: 13, lineHeight: 19, color: p.muted },
  covers: { flexDirection: 'row', gap: 12 },
  coverOption: { alignItems: 'center', gap: 6 },
  coverFrame: { padding: 3, borderWidth: 2, borderColor: 'transparent', borderRadius: 4 },
  coverFrameOn: { borderColor: p.primary },
  coverLabel: { fontSize: 13, color: p.muted },
  coverLabelOn: { color: p.primary, fontWeight: '700' },
  pageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pageValue: { minWidth: 56, textAlign: 'center', fontSize: 17, fontWeight: '700', color: p.ink },
  price: { gap: 10, borderTopWidth: 1, borderColor: p.line, paddingTop: 16 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  priceLabel: { fontSize: 14, color: p.muted },
  priceValue: { fontSize: 14, color: p.ink },
  priceTotal: { borderTopWidth: 1, borderColor: p.line, paddingTop: 10 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: p.ink },
  totalValue: { fontSize: 20, fontWeight: '700', color: p.primary },
})
