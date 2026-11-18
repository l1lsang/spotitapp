import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, ArrowRight, Check, CopyPlus, Minus, Plus, Trash2, type LucideIcon } from 'lucide-react-native'
import { Text } from '../Typography'
import { p } from '../ui'
import type { BookBackground, BookTextElement } from '../../types/book'
import type { BookSpec } from '../../lib/book/specs'
import type { TextStyle } from '../../lib/book/editor'
import { BOOK_FONTS, PAGE_BACKGROUNDS, sameBackground, stepTextSize, TEXT_COLORS } from '../../lib/book/styles'
import { fitPageLayout } from '../../lib/book/geometry'
import { PageBackground } from './PageBackground'

/** A panel that takes the toolbar's place while one kind of setting is being changed. */
export function EditorPanel({ title, onDone, children }: { title: string; onDone: () => void; children: ReactNode }) {
  return <View style={styles.panel}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Pressable accessibilityRole="button" onPress={onDone} hitSlop={8} style={({ pressed }) => [styles.done, pressed && { opacity: 0.6 }]}>
        <Text style={styles.doneText}>완료</Text>
      </Pressable>
    </View>
    <ScrollView style={styles.body} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </View>
}

const Label = ({ children }: { children: string }) => <Text style={styles.label}>{children}</Text>

function Choice({ selected, label, onPress, children, style }: { selected: boolean; label: string; onPress: () => void; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && { opacity: 0.7 }, style]}>
    {children}
  </Pressable>
}

const ALIGNS: { id: BookTextElement['align']; label: string; Icon: LucideIcon }[] = [
  { id: 'left', label: '왼쪽 정렬', Icon: AlignLeft },
  { id: 'center', label: '가운데 정렬', Icon: AlignCenter },
  { id: 'right', label: '오른쪽 정렬', Icon: AlignRight },
]

export function TextStylePanel({ element, onStyle, onDone }: { element: BookTextElement; onStyle: (style: Partial<TextStyle>) => void; onDone: () => void }) {
  const size = Math.round(element.sizePt)
  return <EditorPanel title="글 스타일" onDone={onDone}>
    <Label>글꼴</Label>
    <View style={styles.row}>
      {BOOK_FONTS.map(font => {
        const selected = element.font === font.id
        return <Choice key={font.id} selected={selected} label={`${font.label} 글꼴`} onPress={() => onStyle({ font: font.id })} style={styles.fontChoice}>
          <Text style={[styles.fontSample, font.family ? { fontFamily: font.family } : null]}>가나다</Text>
          <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{font.label}</Text>
        </Choice>
      })}
    </View>
    <Label>크기 · 정렬</Label>
    <View style={styles.row}>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel="글자 작게" onPress={() => onStyle({ sizePt: stepTextSize(element.sizePt, -1) })} style={styles.stepButton}><Minus size={18} color={p.ink} /></Pressable>
        <Text accessibilityLabel={`글자 크기 ${size}포인트`} style={styles.size}>{size}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="글자 크게" onPress={() => onStyle({ sizePt: stepTextSize(element.sizePt, 1) })} style={styles.stepButton}><Plus size={18} color={p.ink} /></Pressable>
      </View>
      {ALIGNS.map(({ id, label, Icon }) => <Choice key={id} selected={element.align === id} label={label} onPress={() => onStyle({ align: id })} style={styles.iconChoice}>
        <Icon size={18} color={element.align === id ? p.primary : p.ink} />
      </Choice>)}
    </View>
    <Label>색</Label>
    <View style={styles.swatches}>
      {TEXT_COLORS.map(({ color, label }) => {
        const selected = element.color.toUpperCase() === color
        return <Pressable key={color} accessibilityRole="button" accessibilityLabel={`${label} 글자`} accessibilityState={{ selected }} onPress={() => onStyle({ color })}
          style={[styles.swatchRing, selected && { borderColor: p.primary }]}>
          <View style={[styles.swatch, { backgroundColor: color }, color === '#FFFFFF' && styles.swatchLight]} />
        </Pressable>
      })}
    </View>
  </EditorPanel>
}

export function BackgroundPanel({ spec, background, pageCount, onPick, onApplyAll, onDone }: {
  spec: BookSpec
  background: BookBackground
  pageCount: number
  onPick: (background: BookBackground) => void
  onApplyAll: () => void
  onDone: () => void
}) {
  const layout = fitPageLayout(spec, 44, 200)
  return <EditorPanel title="이 쪽의 배경" onDone={onDone}>
    <View style={styles.backgrounds}>
      {PAGE_BACKGROUNDS.map(option => {
        const selected = sameBackground(option.background, background)
        return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${option.label} 배경`} accessibilityState={{ selected }} onPress={() => onPick(option.background)}
          style={({ pressed }) => [styles.backgroundItem, pressed && { opacity: 0.7 }]}>
          <View style={[styles.backgroundFrame, selected && { borderColor: p.primary }]}>
            <View style={{ width: layout.widthPx, height: layout.heightPx, overflow: 'hidden' }}>
              <PageBackground background={option.background} layout={layout} trim={spec.trimMm} />
            </View>
          </View>
          <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{option.label}</Text>
        </Pressable>
      })}
    </View>
    {pageCount > 1 && <ListAction label="이 배경을 모든 쪽에 적용" Icon={Check} onPress={onApplyAll} last />}
  </EditorPanel>
}

function ListAction({ label, Icon, onPress, disabled = false, danger = false, last = false }: { label: string; Icon: LucideIcon; onPress: () => void; disabled?: boolean; danger?: boolean; last?: boolean }) {
  const color = danger ? p.danger : p.ink
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.listRow, last && { borderBottomWidth: 0 }, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.6 }]}>
    <Icon size={19} color={color} />
    <Text style={[styles.listText, { color }]}>{label}</Text>
  </Pressable>
}

export function PagesPanel({ spec, pageIndex, pageCount, canAdd, onMove, onAdd, onDuplicate, onDelete, onDone }: {
  spec: BookSpec
  pageIndex: number
  pageCount: number
  canAdd: boolean
  onMove: (to: number) => void
  onAdd: () => void
  onDuplicate: () => void
  onDelete: () => void
  onDone: () => void
}) {
  const { min, max, step } = spec.pages
  return <EditorPanel title={`${pageIndex + 1}쪽 / 전체 ${pageCount}쪽`} onDone={onDone}>
    <View>
      <ListAction label="앞으로 옮기기" Icon={ArrowLeft} disabled={pageIndex === 0} onPress={() => onMove(pageIndex - 1)} />
      <ListAction label="뒤로 옮기기" Icon={ArrowRight} disabled={pageIndex === pageCount - 1} onPress={() => onMove(pageIndex + 1)} />
      <ListAction label="다음에 빈 쪽 추가" Icon={Plus} disabled={!canAdd} onPress={onAdd} />
      <ListAction label="이 쪽 복제" Icon={CopyPlus} disabled={!canAdd} onPress={onDuplicate} />
      <ListAction label="이 쪽 삭제" Icon={Trash2} danger disabled={pageCount <= 1} onPress={onDelete} last />
    </View>
    <Text style={styles.note}>삭제한 쪽은 되돌리기로 복구할 수 있어요. 인쇄하려면 {min}~{max}쪽, {step}쪽 단위가 필요해요.</Text>
  </EditorPanel>
}

const styles = StyleSheet.create({
  panel: { maxHeight: 340, backgroundColor: p.paper, borderTopWidth: 1, borderColor: p.line },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 48 },
  title: { fontSize: 16, fontWeight: '700', color: p.ink },
  done: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  doneText: { fontSize: 15, fontWeight: '700', color: p.primary },
  body: { flexGrow: 0 },
  content: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: p.muted, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choice: { minHeight: 44, borderWidth: 1, borderColor: p.line, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: p.paper },
  choiceSelected: { borderColor: p.primary, borderWidth: 1.5, backgroundColor: p.primarySoft },
  fontChoice: { flex: 1, paddingVertical: 6, gap: 2 },
  fontSample: { fontSize: 20, lineHeight: 28, color: p.ink },
  choiceLabel: { fontSize: 13, color: p.muted },
  choiceLabelSelected: { color: p.primary, fontWeight: '700' },
  iconChoice: { width: 44 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: p.line, borderRadius: 8, minHeight: 44, marginRight: 4 },
  stepButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  size: { minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: '700', color: p.ink },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  swatchRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  swatchLight: { borderWidth: 1, borderColor: p.line },
  backgrounds: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  backgroundItem: { alignItems: 'center', gap: 4, minWidth: 52 },
  backgroundFrame: { padding: 2, borderWidth: 2, borderColor: 'transparent', borderRadius: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderBottomWidth: 1, borderColor: p.line },
  listText: { fontSize: 15 },
  note: { fontSize: 13, lineHeight: 20, color: p.muted },
})
