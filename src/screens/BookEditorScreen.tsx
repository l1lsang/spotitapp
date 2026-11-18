import { useCallback, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { randomUUID } from 'expo-crypto'
import {
  AlertTriangle, BookOpen, BringToFront, Check, ChevronLeft, CopyPlus, Files, ImagePlus, Minus, Palette, PenLine, Plus, Redo2, RotateCw,
  SendToBack, SquareDashed, Trash2, Type, Undo2, ALargeSmall,
} from 'lucide-react-native'
import { Text } from '../components/Typography'
import { Button, IconButton, Notice, p } from '../components/ui'
import { Dialog } from '../components/Dialog'
import { BookPageCanvas } from '../components/book/BookPageCanvas'
import { PinPhotoPicker } from '../components/book/PinPhotoPicker'
import { TextEditDialog } from '../components/book/TextEditDialog'
import { PageStrip } from '../components/book/PageStrip'
import { useBookFonts } from '../components/book/bookFonts'
import { BackgroundPanel, PagesPanel, TextStylePanel } from '../components/book/EditorPanels'
import { useAuth } from '../hooks/useAuth'
import { useBookEditor, type BlockedReason } from '../hooks/useBookEditor'
import { canAddElement, canAddPage, currentPage, MAX_ELEMENTS_PER_PAGE } from '../lib/book/editor'
import { NO_TRANSFORM } from '../lib/book/geometry'
import { getBookSpec } from '../lib/book/specs'
import { flaggedPages, preflightBook } from '../lib/book/preflight'
import { takeBookFocus } from '../lib/book/focus'
import type { BookSaveStatus } from '../lib/book/bookSession'

const SAVE_LABEL: Record<BookSaveStatus, string> = {
  saved: '저장됨',
  saving: '저장 중…',
  // The write is queued and goes out by itself once connected: nothing to retry.
  offline: '오프라인 · 이 기기에 저장됨',
  local: '이 기기에만 저장됨',
  error: '저장 안 됨',
  conflict: '다른 기기에서 수정됨',
  deleted: '삭제된 책',
}
const RETRYABLE: readonly BookSaveStatus[] = ['local', 'error']
const ALERT: readonly BookSaveStatus[] = ['local', 'error', 'conflict', 'deleted']

const BLOCKED_TEXT: Record<BlockedReason, string> = {
  deleted: '이 책은 삭제됐어요.',
  newer: '이 책은 더 새로운 버전의 앱에서 저장됐어요. 앱을 업데이트한 뒤 열어 주세요.',
  failed: '책을 불러오지 못했어요. 연결을 확인한 뒤 다시 열어 주세요.',
}

type TextEdit = { id: string | null; text: string }
type Panel = 'text-style' | 'background' | 'pages' | null

export default function BookEditorScreen({ bookId }: { bookId: string }) {
  const { currentUser } = useAuth()
  // AuthGate renders this screen only for a signed-in account.
  return currentUser ? <Editor uid={currentUser.uid} bookId={bookId} /> : null
}

function leave() {
  if (router.canGoBack()) router.back()
  else router.replace('/books')
}

function Editor({ uid, bookId }: { uid: string; bookId: string }) {
  const fontsReady = useBookFonts()
  const { editor, blocked: openBlocked, conflict, dispatch, canUndo, canRedo, saveStatus, flushLocal, retrySave, resolveConflict } = useBookEditor(uid, bookId)
  const [showGuides, setShowGuides] = useState(true)
  const [picking, setPicking] = useState(false)
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [resolving, setResolving] = useState(false)
  const blocked: BlockedReason | null = openBlocked ?? (saveStatus === 'deleted' ? 'deleted' : null)
  const ready = editor !== null
  // Back from the preview with a problem to fix: open that page and select the element.
  useFocusEffect(useCallback(() => {
    if (!ready) return
    const focus = takeBookFocus(bookId)
    if (!focus) return
    dispatch({ type: 'go-page', index: focus.pageIndex })
    if (focus.elementId) dispatch({ type: 'select', id: focus.elementId })
  }, [ready, bookId, dispatch]))

  if (!editor || blocked || !fontsReady) return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.top}><IconButton label="뒤로 가기" onPress={leave}><ChevronLeft size={22} color={p.ink} /></IconButton></View>
    <View style={styles.center}>
      {blocked ? <View style={styles.blocked}>
        <Notice error>{BLOCKED_TEXT[blocked]}</Notice>
        <Button variant="secondary" title="내 책 목록으로" onPress={() => router.replace('/books')} />
      </View> : <ActivityIndicator color={p.primary} />}
    </View>
  </SafeAreaView>

  const spec = getBookSpec(editor.draft.specId)
  const pages = editor.draft.pages
  const page = currentPage(editor)
  const selected = page.elements.find(element => element.id === editor.selectedId) ?? null
  const full = !canAddElement(editor)
  const now = () => new Date().toISOString()
  const transform = (part: Partial<typeof NO_TRANSFORM>) => {
    if (selected) dispatch({ type: 'transform', id: selected.id, transform: { ...NO_TRANSFORM, ...part }, now: now() })
  }
  const openText = (id: string) => {
    const element = page.elements.find(item => item.id === id)
    if (element?.type === 'text') setTextEdit({ id, text: element.text })
  }
  const saveText = (text: string) => {
    if (!textEdit) return
    if (textEdit.id) dispatch({ type: 'set-text', id: textEdit.id, text, now: now() })
    else dispatch({ type: 'add-text', id: randomUUID(), text, now: now() })
    setTextEdit(null)
  }
  const addPage = () => dispatch({ type: 'add-page', pageId: randomUUID(), now: now() })
  const issues = preflightBook(editor.draft, spec)
  const pageIssue = issues.find(issue => issue.pageIndex === editor.pageIndex && issue.severity !== 'info')
  const openPreview = () => {
    // The preview reads this device's copy, so it must hold the latest edit first.
    void flushLocal().catch(() => undefined).finally(() => router.push({ pathname: '/books/[bookId]/preview', params: { bookId } }))
  }
  // A text style panel belongs to the selected text; it closes with the selection.
  const openPanel: Panel = panel === 'text-style' && selected?.type !== 'text' ? null : panel

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.top}>
      <IconButton label="뒤로 가기" onPress={leave}><ChevronLeft size={22} color={p.ink} /></IconButton>
      <View style={styles.heading}>
        <Text numberOfLines={1} style={styles.title}>{editor.draft.title || '제목 없는 책'}</Text>
        <Pressable accessibilityRole="button" disabled={!RETRYABLE.includes(saveStatus)} onPress={retrySave}
          accessibilityLabel={RETRYABLE.includes(saveStatus) ? `${SAVE_LABEL[saveStatus]}, 다시 저장` : SAVE_LABEL[saveStatus]}>
          <Text numberOfLines={1} style={[styles.status, ALERT.includes(saveStatus) && styles.statusError]}>
            {editor.pageIndex + 1}/{pages.length}쪽 · {SAVE_LABEL[saveStatus]}{RETRYABLE.includes(saveStatus) ? ' · 다시 저장' : ''}
          </Text>
        </Pressable>
      </View>
      <IconButton label="되돌리기" disabled={!canUndo} onPress={() => dispatch({ type: 'undo' })}><Undo2 size={20} color={p.ink} /></IconButton>
      <IconButton label="다시 하기" disabled={!canRedo} onPress={() => dispatch({ type: 'redo' })}><Redo2 size={20} color={p.ink} /></IconButton>
      <IconButton label={showGuides ? '인쇄 안내선 숨기기' : '인쇄 안내선 보기'} selected={showGuides} onPress={() => setShowGuides(value => !value)}>
        <SquareDashed size={20} color={showGuides ? p.primary : p.muted} />
      </IconButton>
      <IconButton label="미리보기" onPress={openPreview}><BookOpen size={20} color={p.ink} /></IconButton>
    </View>

    <View style={styles.workspace}>
      <BookPageCanvas
        key={page.id}
        page={page} spec={spec} selectedId={editor.selectedId} showGuides={showGuides}
        onSelect={id => dispatch({ type: 'select', id })}
        onTransform={(id, change) => dispatch({ type: 'transform', id, transform: change, now: now() })}
        onEditText={openText}
        onTextHeight={(id, hMm) => dispatch({ type: 'measure-text', id, hMm })}
      />
    </View>

    {openPanel === 'text-style' && selected?.type === 'text'
      ? <TextStylePanel element={selected} onDone={() => setPanel(null)}
          onStyle={style => dispatch({ type: 'set-text-style', id: selected.id, style, now: now() })} />
      : openPanel === 'background'
        ? <BackgroundPanel spec={spec} background={page.background} pageCount={pages.length} onDone={() => setPanel(null)}
            onPick={background => dispatch({ type: 'set-background', background, allPages: false, now: now() })}
            onApplyAll={() => dispatch({ type: 'set-background', background: page.background, allPages: true, now: now() })} />
        : openPanel === 'pages'
          ? <PagesPanel spec={spec} pageIndex={editor.pageIndex} pageCount={pages.length} canAdd={canAddPage(editor)} onDone={() => setPanel(null)}
              onMove={to => dispatch({ type: 'move-page', to, now: now() })}
              onAdd={addPage}
              onDuplicate={() => dispatch({ type: 'duplicate-page', pageId: randomUUID(), elementIds: page.elements.map(() => randomUUID()), now: now() })}
              onDelete={() => dispatch({ type: 'delete-page', now: now() })} />
          : <>
            {pageIssue && <View style={styles.issue} accessibilityRole="alert">
              <AlertTriangle size={16} color={pageIssue.severity === 'error' ? p.danger : p.coral} />
              <Text numberOfLines={1} style={[styles.issueText, pageIssue.severity === 'error' && { color: p.danger }]}>{pageIssue.title}</Text>
            </View>}
            <PageStrip pages={pages} spec={spec} pageIndex={editor.pageIndex} canAdd={canAddPage(editor)} flagged={flaggedPages(issues)}
              onOpen={index => dispatch({ type: 'go-page', index })} onAdd={addPage} />
            {full && !selected && <View style={styles.notice}><Notice>한 쪽에는 요소를 {MAX_ELEMENTS_PER_PAGE}개까지 넣을 수 있어요.</Notice></View>}
            {selected
              ? <View style={styles.toolbar} accessibilityRole="toolbar">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolScroll}>
                  {selected.type === 'text' && <>
                    <Tool label="글 고치기" onPress={() => openText(selected.id)}><PenLine size={20} color={p.ink} /></Tool>
                    <Tool label="스타일" onPress={() => setPanel('text-style')}><ALargeSmall size={20} color={p.ink} /></Tool>
                  </>}
                  <Tool label="작게" onPress={() => transform({ scale: 1 / 1.1 })}><Minus size={20} color={p.ink} /></Tool>
                  <Tool label="크게" onPress={() => transform({ scale: 1.1 })}><Plus size={20} color={p.ink} /></Tool>
                  <Tool label="90° 회전" onPress={() => transform({ dRotationDeg: 90 })}><RotateCw size={20} color={p.ink} /></Tool>
                  <Tool label="앞으로" onPress={() => dispatch({ type: 'arrange', id: selected.id, to: 'forward', now: now() })}><BringToFront size={20} color={p.ink} /></Tool>
                  <Tool label="뒤로" onPress={() => dispatch({ type: 'arrange', id: selected.id, to: 'backward', now: now() })}><SendToBack size={20} color={p.ink} /></Tool>
                  <Tool label="복제" disabled={full} onPress={() => dispatch({ type: 'duplicate', id: selected.id, newId: randomUUID(), now: now() })}><CopyPlus size={20} color={p.ink} /></Tool>
                  <Tool label="삭제" danger onPress={() => dispatch({ type: 'delete', id: selected.id, now: now() })}><Trash2 size={20} color={p.danger} /></Tool>
                </ScrollView>
                <View style={styles.toolDivider} />
                <Tool label="완료" onPress={() => dispatch({ type: 'select', id: null })}><Check size={20} color={p.primary} /></Tool>
              </View>
              : <View style={[styles.toolbar, styles.toolbarEven]} accessibilityRole="toolbar">
                <Tool label="사진" disabled={full} onPress={() => setPicking(true)}><ImagePlus size={20} color={p.ink} /></Tool>
                <Tool label="글" disabled={full} onPress={() => setTextEdit({ id: null, text: '' })}><Type size={20} color={p.ink} /></Tool>
                <Tool label="배경" onPress={() => setPanel('background')}><Palette size={20} color={p.ink} /></Tool>
                <Tool label="페이지" onPress={() => setPanel('pages')}><Files size={20} color={p.ink} /></Tool>
              </View>}
          </>}

    <PinPhotoPicker uid={uid} visible={picking} onClose={() => setPicking(false)}
      onPick={ref => dispatch({ type: 'add-image', id: randomUUID(), ref, now: now() })} />
    <Dialog visible={conflict} title="다른 기기에서 이 책을 고쳤어요" onClose={() => undefined} busy>
      <Text style={styles.blockedText}>어느 쪽을 남길까요? 남기지 않은 쪽에서 고친 내용은 사라져요.</Text>
      <View style={styles.conflictActions}>
        <Button variant="secondary" title="다른 기기 내용 불러오기" disabled={resolving}
          onPress={() => { setResolving(true); void resolveConflict('server').finally(() => setResolving(false)) }} />
        <Button title="이 기기 내용으로 저장" loading={resolving}
          onPress={() => { setResolving(true); void resolveConflict('local').finally(() => setResolving(false)) }} />
      </View>
    </Dialog>
    {textEdit && <TextEditDialog initialText={textEdit.text} title={textEdit.id ? '글 고치기' : '글 넣기'} onClose={() => setTextEdit(null)} onSave={saveText} />}
  </SafeAreaView>
}

function Tool({ label, onPress, children, disabled = false, danger = false }: { label: string; onPress: () => void; children: ReactNode; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.tool, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.6 }]}>
    {children}
    <Text numberOfLines={1} style={[styles.toolLabel, danger && { color: p.danger }]}>{label}</Text>
  </Pressable>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: p.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  blocked: { alignSelf: 'stretch', gap: 12 },
  blockedText: { fontSize: 15, lineHeight: 23, color: p.ink },
  conflictActions: { gap: 8 },
  issue: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 8, backgroundColor: p.paper },
  issueText: { flex: 1, fontSize: 13, color: p.coral },
  top: { flexDirection: 'row', alignItems: 'center', gap: 0, paddingHorizontal: 4, minHeight: 56, borderBottomWidth: 1, borderColor: p.line },
  heading: { flex: 1, gap: 1, paddingLeft: 2 },
  title: { fontSize: 16, fontWeight: '600', color: p.ink },
  status: { fontSize: 13, color: p.muted },
  statusError: { color: p.danger },
  workspace: { flex: 1, backgroundColor: p.surface },
  notice: { paddingHorizontal: 16, paddingTop: 4, backgroundColor: p.paper },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingTop: 4, paddingBottom: 4, borderTopWidth: 1, borderColor: p.line, backgroundColor: p.paper },
  toolbarEven: { justifyContent: 'space-around' },
  toolScroll: { paddingHorizontal: 6 },
  toolDivider: { width: 1, alignSelf: 'stretch', marginVertical: 8, backgroundColor: p.line },
  tool: { minWidth: 58, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6 },
  toolLabel: { fontSize: 13, color: p.ink },
})
