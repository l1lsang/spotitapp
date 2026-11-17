import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { randomUUID } from 'expo-crypto'
import { Check, ChevronLeft, ImagePlus, Minus, PenLine, Plus, SquareDashed, Trash2, Type } from 'lucide-react-native'
import { Text } from '../components/Typography'
import { IconButton, Notice, p } from '../components/ui'
import { BookPageCanvas } from '../components/book/BookPageCanvas'
import { PinPhotoPicker } from '../components/book/PinPhotoPicker'
import { TextEditDialog } from '../components/book/TextEditDialog'
import { useAuth } from '../hooks/useAuth'
import { useBookEditor } from '../hooks/useBookEditor'
import { canAddElement, currentPage, MAX_ELEMENTS_PER_PAGE } from '../lib/book/editor'
import { getBookSpec } from '../lib/book/specs'
import type { SaveStatus } from '../lib/book/saveQueue'

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: '이 기기에 저장됨',
  pending: '저장 중…',
  saving: '저장 중…',
  error: '저장 안 됨',
}

type TextEdit = { id: string | null; text: string }

export default function BookEditorScreen({ bookId }: { bookId: string }) {
  const { currentUser } = useAuth()
  // AuthGate renders this screen only for a signed-in account.
  return currentUser ? <Editor uid={currentUser.uid} bookId={bookId} /> : null
}

function Editor({ uid, bookId }: { uid: string; bookId: string }) {
  const { editor, loadError, dispatch, saveStatus, retrySave } = useBookEditor(uid, bookId)
  const [showGuides, setShowGuides] = useState(true)
  const [picking, setPicking] = useState(false)
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null)

  const leave = () => { if (router.canGoBack()) router.back(); else router.replace('/my') }
  const now = () => new Date().toISOString()

  if (!editor) return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.top}><IconButton label="뒤로 가기" onPress={leave}><ChevronLeft size={22} color={p.ink} /></IconButton></View>
    <View style={styles.center}>{loadError ? <Notice error>{loadError}</Notice> : <ActivityIndicator color={p.primary} />}</View>
  </SafeAreaView>

  const spec = getBookSpec(editor.draft.specId)
  const page = currentPage(editor)
  const selected = page.elements.find(element => element.id === editor.selectedId) ?? null
  const full = !canAddElement(editor)
  const resize = (factor: number) => {
    if (selected) dispatch({ type: 'transform', id: selected.id, transform: { dxMm: 0, dyMm: 0, scale: factor, dRotationDeg: 0 }, now: now() })
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

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.top}>
      <IconButton label="뒤로 가기" onPress={leave}><ChevronLeft size={22} color={p.ink} /></IconButton>
      <View style={styles.heading}>
        <Text numberOfLines={1} style={styles.title}>{editor.draft.title || '제목 없는 책'}</Text>
        <Pressable accessibilityRole="button" disabled={saveStatus !== 'error'} onPress={retrySave} accessibilityLabel={saveStatus === 'error' ? '저장 안 됨, 다시 저장' : SAVE_LABEL[saveStatus]}>
          <Text style={[styles.status, saveStatus === 'error' && styles.statusError]}>
            {spec.label} · {SAVE_LABEL[saveStatus]}{saveStatus === 'error' ? ' · 다시 저장' : ''}
          </Text>
        </Pressable>
      </View>
      <IconButton label={showGuides ? '인쇄 안내선 숨기기' : '인쇄 안내선 보기'} selected={showGuides} onPress={() => setShowGuides(value => !value)}>
        <SquareDashed size={20} color={showGuides ? p.primary : p.muted} />
      </IconButton>
    </View>

    <View style={styles.workspace}>
      <BookPageCanvas
        page={page} spec={spec} selectedId={editor.selectedId} showGuides={showGuides}
        onSelect={id => dispatch({ type: 'select', id })}
        onTransform={(id, transform) => dispatch({ type: 'transform', id, transform, now: now() })}
        onEditText={openText}
        onTextHeight={(id, hMm) => dispatch({ type: 'measure-text', id, hMm })}
      />
    </View>

    {full && !selected && <View style={styles.notice}><Notice>한 쪽에는 요소를 {MAX_ELEMENTS_PER_PAGE}개까지 넣을 수 있어요.</Notice></View>}
    <View style={styles.toolbar} accessibilityRole="toolbar">
      {selected
        ? <>
          {selected.type === 'text' && <Tool label="글 고치기" onPress={() => openText(selected.id)}><PenLine size={20} color={p.ink} /></Tool>}
          <Tool label="작게" onPress={() => resize(1 / 1.1)}><Minus size={20} color={p.ink} /></Tool>
          <Tool label="크게" onPress={() => resize(1.1)}><Plus size={20} color={p.ink} /></Tool>
          <Tool label="삭제" danger onPress={() => dispatch({ type: 'delete', id: selected.id, now: now() })}><Trash2 size={20} color={p.danger} /></Tool>
          <Tool label="완료" onPress={() => dispatch({ type: 'select', id: null })}><Check size={20} color={p.primary} /></Tool>
        </>
        : <>
          <Tool label="사진" disabled={full} onPress={() => setPicking(true)}><ImagePlus size={20} color={p.ink} /></Tool>
          <Tool label="글" disabled={full} onPress={() => setTextEdit({ id: null, text: '' })}><Type size={20} color={p.ink} /></Tool>
        </>}
    </View>

    <PinPhotoPicker uid={uid} visible={picking} onClose={() => setPicking(false)}
      onPick={ref => dispatch({ type: 'add-image', id: randomUUID(), ref, now: now() })} />
    {textEdit && <TextEditDialog initialText={textEdit.text} title={textEdit.id ? '글 고치기' : '글 넣기'} onClose={() => setTextEdit(null)} onSave={saveText} />}
  </SafeAreaView>
}

function Tool({ label, onPress, children, disabled = false, danger = false }: { label: string; onPress: () => void; children: ReactNode; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.tool, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.6 }]}>
    {children}
    <Text style={[styles.toolLabel, danger && { color: p.danger }]}>{label}</Text>
  </Pressable>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: p.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, minHeight: 56, borderBottomWidth: 1, borderColor: p.line },
  heading: { flex: 1, gap: 1 },
  title: { fontSize: 16, fontWeight: '600', color: p.ink },
  status: { fontSize: 13, color: p.muted },
  statusError: { color: p.danger },
  workspace: { flex: 1, backgroundColor: p.surface },
  notice: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: p.paper },
  toolbar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 6, paddingBottom: 4, borderTopWidth: 1, borderColor: p.line, backgroundColor: p.paper },
  tool: { minWidth: 56, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6 },
  toolLabel: { fontSize: 13, color: p.ink },
})
