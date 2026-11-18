import { useEffect, useState } from 'react'
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, FileText, SquareDashed, XCircle } from 'lucide-react-native'
import { Text } from '../components/Typography'
import { Button, IconButton, Notice, p } from '../components/ui'
import { BookCover, COVER_STYLES } from '../components/book/BookCover'
import { PageBackground } from '../components/book/PageBackground'
import { PageThumb } from '../components/book/PageStrip'
import { StaticElementView } from '../components/book/BookElementView'
import { useBookFonts } from '../components/book/bookFonts'
import { useAuth } from '../hooks/useAuth'
import { useBookPreview } from '../hooks/useBookPreview'
import { useBookRender } from '../hooks/useBookRender'
import { requestBookFocus } from '../lib/book/focus'
import { countBySeverity, flaggedPages, orderReadiness, preflightBook, type IssueSeverity, type PreflightIssue } from '../lib/book/preflight'
import { getBookSpec, type BookSpec } from '../lib/book/specs'
import { spreadCount, spreadOf, spreadPages } from '../lib/book/spreads'
import { formatMegabytes, serverOnlyIssues, type SaveState } from '../lib/book/render'
import type { BookDraft, BookPage } from '../types/book'

const FLOW_STEP = '4/5'
const SEVERITY: Record<IssueSeverity, { label: string; color: string }> = {
  error: { label: '꼭 고쳐야 해요', color: p.danger },
  warn: { label: '수정 권장', color: p.coral },
  info: { label: '참고', color: p.muted },
}
const SHORT: Record<PreflightIssue['kind'], string> = {
  'page-count': '쪽 수', 'photo-resolution': '사진 해상도', 'text-outside-safe': '글 잘림',
  'photo-bleed-gap': '사진 가장자리', 'photo-full-bleed': '재단', font: '글꼴',
  'glyph-fallback': '대체 글자', 'glyph-missing': '빠진 글자', 'empty-page': '빈 쪽',
  'text-overflow': '글 길이', 'photo-unavailable': '사진 없음',
}
const BLOCKED_TEXT = {
  deleted: '이 책은 삭제됐어요.',
  newer: '이 책은 더 새로운 버전의 앱에서 저장됐어요. 앱을 업데이트한 뒤 열어 주세요.',
  failed: '책을 불러오지 못했어요. 연결을 확인한 뒤 다시 열어 주세요.',
} as const

export default function BookPreviewScreen({ bookId }: { bookId: string }) {
  const { currentUser } = useAuth()
  return currentUser ? <Preview uid={currentUser.uid} bookId={bookId} /> : null
}

/** Back to the editor, at the page (and element) to fix. */
function openInEditor(bookId: string, pageIndex: number, elementId?: string) {
  requestBookFocus(bookId, { pageIndex, elementId })
  if (router.canGoBack()) router.back()
  else router.replace({ pathname: '/books/[bookId]/edit', params: { bookId } })
}

function leave(bookId: string) {
  if (router.canGoBack()) router.back()
  else router.replace({ pathname: '/books/[bookId]/edit', params: { bookId } })
}

function Preview({ uid, bookId }: { uid: string; bookId: string }) {
  const state = useBookPreview(uid, bookId)
  const fontsReady = useBookFonts()
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    if (!checking) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setChecking(false); return true })
    return () => subscription.remove()
  }, [checking])

  if (state.phase !== 'ready' || !fontsReady) return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.top}>
      <IconButton label="뒤로 가기" onPress={() => leave(bookId)}><ChevronLeft size={22} color={p.ink} /></IconButton>
      <Text accessibilityRole="header" style={styles.topTitle}>미리보기</Text>
    </View>
    <View style={styles.center}>
      {state.phase === 'blocked' ? <Notice error>{BLOCKED_TEXT[state.reason]}</Notice> : <ActivityIndicator color={p.primary} />}
    </View>
  </SafeAreaView>

  const spec = getBookSpec(state.draft.specId)
  const issues = preflightBook(state.draft, spec)
  return checking
    ? <CheckView bookId={bookId} draft={state.draft} spec={spec} issues={issues} save={state.save} onBack={() => setChecking(false)} />
    : <BookView bookId={bookId} draft={state.draft} spec={spec} issues={issues} onCheck={() => setChecking(true)} />
}

/** One page cut to its trim size, as the printed book shows it. */
function PreviewPage({ page, spec, width, showGuides }: { page: BookPage; spec: BookSpec; width: number; showGuides: boolean }) {
  const scale = width / spec.trimMm.w
  const bleed = spec.bleedMm * scale
  const layout = { scale, bleedMm: spec.bleedMm, widthPx: (spec.trimMm.w + spec.bleedMm * 2) * scale, heightPx: (spec.trimMm.h + spec.bleedMm * 2) * scale }
  const safe = spec.safeMm * scale
  return <View style={{ width, height: spec.trimMm.h * scale, overflow: 'hidden', backgroundColor: page.background.color }}>
    <View style={{ position: 'absolute', left: -bleed, top: -bleed, width: layout.widthPx, height: layout.heightPx }}>
      <PageBackground background={page.background} layout={layout} trim={spec.trimMm} />
      {page.elements.map(element => <StaticElementView key={element.id} element={element} layout={layout} full />)}
    </View>
    {showGuides && <View pointerEvents="none" style={[styles.safe, { top: safe, left: safe, right: safe, bottom: safe }]} />}
  </View>
}

function BookView({ bookId, draft, spec, issues, onCheck }: { bookId: string; draft: BookDraft; spec: BookSpec; issues: PreflightIssue[]; onCheck: () => void }) {
  const { width } = useWindowDimensions()
  const [tab, setTab] = useState<'cover' | 'pages'>('pages')
  const [spread, setSpread] = useState(0)
  const [showGuides, setShowGuides] = useState(false)
  const count = draft.pages.length
  const total = spreadCount(count)
  const current = Math.min(spread, total - 1)
  const [left, right] = spreadPages(count, current)
  const pageWidth = Math.min(260, (Math.min(width, 720) - 40) / 2)
  const flagged = flaggedPages(issues)
  const toFix = issues.filter(issue => issue.severity !== 'info' && issue.pageIndex !== null)
  const label = [left, right].filter((index): index is number => index !== null).map(index => index + 1).join('–')

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.top}>
      <IconButton label="편집으로 돌아가기" onPress={() => leave(bookId)}><ChevronLeft size={22} color={p.ink} /></IconButton>
      <Text accessibilityRole="header" style={styles.topTitle}>미리보기</Text>
      {tab === 'pages' && <IconButton label={showGuides ? '안전 영역 숨기기' : '안전 영역 보기'} selected={showGuides} onPress={() => setShowGuides(value => !value)}>
        <SquareDashed size={20} color={showGuides ? p.primary : p.muted} />
      </IconButton>}
    </View>
    <View style={styles.progress} accessibilityLabel="5단계 중 4단계, 미리보기">
      <Text style={styles.progressText}>{FLOW_STEP}  <Text style={styles.progressName}>미리보기</Text></Text>
      <View style={styles.progressBar}>{[0, 1, 2, 3, 4].map(i => <View key={i} style={[styles.progressPart, i <= 3 && styles.progressDone]} />)}</View>
    </View>
    <View style={styles.tabs} accessibilityRole="tablist">
      {(['cover', 'pages'] as const).map(id => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} onPress={() => setTab(id)} style={[styles.tab, tab === id && styles.tabOn]}>
        <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{id === 'cover' ? '표지' : '내지'}</Text>
      </Pressable>)}
    </View>

    <ScrollView style={styles.stage} contentContainerStyle={styles.stageContent}>
      {tab === 'cover'
        ? <View style={styles.coverWrap}>
          <BookCover coverStyle={draft.coverStyle} title={draft.title} photo={draft.coverPhoto} width={Math.min(240, width * 0.55)} />
          <Text style={styles.caption}>{COVER_STYLES.find(item => item.id === draft.coverStyle)?.label} 표지 · {spec.label} · {count}쪽</Text>
          <Text style={styles.captionMuted}>책등과 뒤표지는 인쇄 업체 규격을 확인한 뒤 보여 드릴게요.</Text>
        </View>
        : <>
          <View style={styles.spread} accessibilityLabel={`${label}쪽, 전체 ${count}쪽`}>
            {[left, right].map((index, side) => <View key={side} style={{ width: pageWidth, alignItems: 'center', gap: 4 }}>
              {index === null ? <View style={{ width: pageWidth }} /> : <>
                <View style={[styles.pageShadow, flagged.includes(index) && styles.pageFlagged]}>
                  <PreviewPage page={draft.pages[index]} spec={spec} width={pageWidth - 4} showGuides={showGuides} />
                </View>
                <Text style={[styles.pageNumber, flagged.includes(index) && { color: p.coral, fontWeight: '700' }]}>{flagged.includes(index) ? '! ' : ''}{index + 1}</Text>
              </>}
            </View>)}
          </View>
          <View style={styles.pager}>
            <IconButton variant="round" label="이전 쪽" disabled={current === 0} onPress={() => setSpread(current - 1)}><ChevronLeft size={20} color={p.ink} /></IconButton>
            <Text style={styles.pagerText}>{label} / {count}쪽</Text>
            <IconButton variant="round" label="다음 쪽" disabled={current >= total - 1} onPress={() => setSpread(current + 1)}><ChevronRight size={20} color={p.ink} /></IconButton>
          </View>
          <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.trackFill, { width: `${((current + 1) / total) * 100}%` }]} />
            {flagged.map(index => <Pressable key={index} onPress={() => setSpread(spreadOf(index))} hitSlop={10}
              style={[styles.trackMark, { left: `${(spreadOf(index) / Math.max(1, total - 1)) * 100}%` }]} />)}
          </View>
        </>}
    </ScrollView>

    <View style={styles.bottom}>
      {toFix.length > 0 && <Pressable accessibilityRole="button" onPress={onCheck} style={styles.summary}>
        <AlertTriangle size={18} color={p.coral} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.summaryTitle}>확인이 필요한 쪽 {flagged.length}개</Text>
          <Text numberOfLines={1} style={styles.summaryText}>{toFix.slice(0, 2).map(issue => `${(issue.pageIndex as number) + 1}쪽 ${SHORT[issue.kind]}`).join(' · ')}</Text>
        </View>
        <Text style={styles.link}>보기</Text>
      </Pressable>}
      <View style={styles.actions}>
        <Button variant="secondary" title="계속 편집" style={{ flex: 1 }} onPress={() => leave(bookId)} />
        <Button title="인쇄 전 확인" style={{ flex: 1 }} onPress={onCheck} />
      </View>
    </View>
  </SafeAreaView>
}

function IssueRow({ bookId, draft, spec, issue }: { bookId: string; draft: BookDraft; spec: BookSpec; issue: PreflightIssue }) {
  const tone = SEVERITY[issue.severity]
  const Icon = issue.severity === 'error' ? XCircle : issue.severity === 'warn' ? AlertTriangle : Eye
  const target = issue.pageIndex ?? draft.pages.length - 1
  const page = issue.pageIndex !== null ? draft.pages[issue.pageIndex] : undefined
  return <View style={styles.row}>
    <View style={styles.rowThumb}>
      {page
        ? <View style={[styles.thumbFrame, issue.severity !== 'info' && { borderColor: tone.color }]}><PageThumb page={page} spec={spec} width={48} /></View>
        : <View style={styles.thumbBlank} />}
      <Text style={[styles.thumbLabel, issue.severity !== 'info' && { color: tone.color }]}>{issue.pageIndex !== null ? issue.pageIndex + 1 : '전체'}</Text>
    </View>
    <View style={styles.rowBody}>
      <View style={styles.badge}><Icon size={14} color={tone.color} /><Text style={[styles.badgeText, { color: tone.color }]}>{tone.label}</Text></View>
      <Text style={styles.rowTitle}>{issue.title}</Text>
      <Text style={styles.detail}>{issue.detail}</Text>
      <Pressable accessibilityRole="button" onPress={() => openInEditor(bookId, target, issue.elementId)} style={({ pressed }) => [styles.jump, pressed && { opacity: 0.7 }]}>
        <Text style={styles.jumpText}>{issue.pageIndex !== null ? `${issue.pageIndex + 1}쪽으로 이동` : '페이지 편집으로 이동'}</Text>
      </Pressable>
    </View>
  </View>
}

/**
 * Makes the print PDF of the saved book on the server and lists what its check found
 * beyond the app's own. Ordering it comes later.
 */
function RenderSection({ bookId, draft, spec, issues, save }: { bookId: string; draft: BookDraft; spec: BookSpec; issues: PreflightIssue[]; save: SaveState }) {
  const { last, phase, start } = useBookRender(bookId, save)
  const current = last && save.kind === 'saved' && last.revision === save.revision ? last : null
  const extra = current ? serverOnlyIssues(current.issues, issues) : []
  const working = phase.kind === 'working'
  return <View style={styles.render}>
    <View style={styles.renderHead}>
      <FileText size={18} color={p.primary} />
      <Text style={styles.renderTitle}>인쇄 파일</Text>
    </View>
    <Text style={styles.detail}>서버에 저장된 내용으로 PDF를 만들고, 실제 글꼴과 사진 파일로 한 번 더 확인해요.</Text>
    {save.kind === 'unsaved' && <Text style={styles.detail}>아직 저장되지 않은 변경이 있어요. 저장이 끝나야 만들 수 있어요.</Text>}
    {current && <View style={styles.renderResult}>
      <Text style={styles.rowTitle}>{current.pageCount}쪽 · {formatMegabytes(current.bytes)} · {Math.max(1, Math.round(current.ms / 1000))}초</Text>
      <Text style={styles.detail}>사진 {current.photos.total}장 중 고화질 사본 {current.photos.printCopies}장 · 인쇄 해상도로 줄인 사진 {current.photos.resized}장</Text>
      <Text style={styles.detail}>{current.readiness === 'blocked' ? `주문 전에 고쳐야 할 항목 ${current.counts.error}건` : current.readiness === 'confirm' ? `수정 권장 ${current.counts.warn}건` : '서버 확인에서도 문제가 없었어요'}</Text>
    </View>}
    {last && !current && <Text style={styles.detail}>지난 인쇄 파일은 이전 저장본({last.revision}번째 저장)으로 만들었어요.</Text>}
    {phase.kind === 'working' && <View style={styles.renderWorking}><ActivityIndicator color={p.primary} /><Text style={[styles.detail, { flex: 1 }]}>{phase.text}</Text></View>}
    {phase.kind === 'error' && <Notice error>{phase.message}</Notice>}
    <Button variant="secondary" title={current ? '다시 만들기' : '인쇄 파일 만들기'} disabled={working || save.kind === 'unsaved'} onPress={() => void start()} />
    {extra.length > 0 && <>
      <Text style={styles.renderSub}>서버 확인에서 더 찾은 항목 {extra.length}건</Text>
      {extra.map(issue => <IssueRow key={`server:${issue.id}`} bookId={bookId} draft={draft} spec={spec} issue={issue} />)}
    </>}
  </View>
}

function CheckView({ bookId, draft, spec, issues, save, onBack }: { bookId: string; draft: BookDraft; spec: BookSpec; issues: PreflightIssue[]; save: SaveState; onBack: () => void }) {
  const counts = countBySeverity(issues)
  const readiness = orderReadiness(issues)
  const pages = flaggedPages(issues).length
  const heading = counts.error ? `주문 전에 고쳐야 할 항목이 ${counts.error}건 있어요`
    : pages ? `${draft.pages.length}쪽 중 ${pages}쪽은 고치는 게 좋아요`
      : '인쇄 전 확인을 마쳤어요'
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.top}>
      <IconButton label="미리보기로 돌아가기" onPress={onBack}><ChevronLeft size={22} color={p.ink} /></IconButton>
      <Text accessibilityRole="header" style={styles.topTitle}>인쇄 전 확인</Text>
    </View>
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.heading}>{heading}</Text>
      {issues.length === 0 && <Text style={styles.detail}>사진 해상도, 글 위치, 재단, 쪽 수에서 찾은 문제가 없어요.</Text>}
      {issues.map(issue => <IssueRow key={issue.id} bookId={bookId} draft={draft} spec={spec} issue={issue} />)}
      <RenderSection bookId={bookId} draft={draft} spec={spec} issues={issues} save={save} />
    </ScrollView>
    <View style={[styles.bottom, styles.bottomBar]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.summaryTitle}>{readiness === 'blocked' ? `고쳐야 할 항목 ${counts.error}건` : readiness === 'confirm' ? `수정 권장 ${counts.warn}건` : '주문할 수 있는 상태예요'}</Text>
        <Text style={styles.summaryText}>{readiness === 'blocked' ? '고치기 전에는 주문할 수 없어요' : readiness === 'confirm' ? '그대로 주문할 수도 있어요' : '주문은 다음 업데이트에서 열려요'}</Text>
      </View>
      {/* Ordering (screens F) is the next milestone; the readiness above is what it will check. */}
      <Button title="주문 준비 중" disabled onPress={() => undefined} />
    </View>
  </SafeAreaView>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: p.bg },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 4, gap: 2 },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: p.ink },
  progress: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  progressText: { fontSize: 13, color: p.muted },
  progressName: { fontSize: 13, fontWeight: '700', color: p.ink },
  progressBar: { flexDirection: 'row', gap: 4 },
  progressPart: { flex: 1, height: 4, borderRadius: 2, backgroundColor: p.line },
  progressDone: { backgroundColor: p.primary },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: p.line },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabOn: { borderColor: p.primary },
  tabText: { fontSize: 15, color: p.muted },
  tabTextOn: { color: p.ink, fontWeight: '700' },
  stage: { flex: 1, backgroundColor: p.surface },
  stageContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 24, gap: 16 },
  coverWrap: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  caption: { fontSize: 14, color: p.ink },
  captionMuted: { fontSize: 13, color: p.muted, textAlign: 'center' },
  spread: { flexDirection: 'row', alignItems: 'flex-start' },
  pageShadow: { padding: 2, borderWidth: 1, borderColor: p.line, backgroundColor: p.paper },
  pageFlagged: { borderColor: p.coral, borderWidth: 2, padding: 1 },
  pageNumber: { fontSize: 13, color: p.muted },
  safe: { position: 'absolute', borderWidth: 1, borderStyle: 'dashed', borderColor: p.primary },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pagerText: { minWidth: 96, textAlign: 'center', fontSize: 15, fontWeight: '700', color: p.ink },
  track: { width: '80%', height: 4, borderRadius: 2, backgroundColor: p.line, marginVertical: 8 },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: p.primary },
  trackMark: { position: 'absolute', top: -4, width: 4, height: 12, marginLeft: -2, borderRadius: 1, backgroundColor: p.coral },
  bottom: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, gap: 10, borderTopWidth: 1, borderColor: p.line, backgroundColor: p.paper },
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: p.coralSoft },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: p.ink },
  summaryText: { fontSize: 13, color: p.muted },
  link: { fontSize: 14, fontWeight: '700', color: p.coral },
  actions: { flexDirection: 'row', gap: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  heading: { fontSize: 20, fontWeight: '700', color: p.ink, letterSpacing: -0.3, paddingVertical: 12 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderColor: p.line },
  rowThumb: { alignItems: 'center', gap: 4, width: 56 },
  thumbFrame: { padding: 2, borderWidth: 2, borderColor: 'transparent', borderRadius: 3 },
  thumbBlank: { width: 52, height: 72, borderWidth: 1, borderStyle: 'dashed', borderColor: p.line, borderRadius: 3 },
  thumbLabel: { fontSize: 13, color: p.muted, fontWeight: '600' },
  rowBody: { flex: 1, gap: 4, alignItems: 'flex-start' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: p.ink },
  detail: { fontSize: 14, lineHeight: 21, color: p.muted },
  jump: { marginTop: 4, minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 18, backgroundColor: p.surface },
  jumpText: { fontSize: 13, fontWeight: '700', color: p.primary },
  render: { gap: 8, paddingTop: 20, marginTop: 8, borderTopWidth: 1, borderColor: p.line, alignItems: 'stretch' },
  renderHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  renderTitle: { fontSize: 17, fontWeight: '700', color: p.ink },
  renderResult: { gap: 2, paddingVertical: 4 },
  renderWorking: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  renderSub: { fontSize: 15, fontWeight: '700', color: p.ink, paddingTop: 12 },
})
