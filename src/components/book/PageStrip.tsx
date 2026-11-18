import { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Plus } from 'lucide-react-native'
import { Text } from '../Typography'
import { p } from '../ui'
import type { BookPage } from '../../types/book'
import type { BookSpec } from '../../lib/book/specs'
import { fitPageLayout } from '../../lib/book/geometry'
import { PageBackground } from './PageBackground'
import { StaticElementView } from './BookElementView'

export const THUMB_WIDTH = 52
const GAP = 10

/** A small, still drawing of one page. */
export function PageThumb({ page, spec, width = THUMB_WIDTH }: { page: BookPage; spec: BookSpec; width?: number }) {
  const layout = fitPageLayout(spec, width, width * 10)
  return <View style={[styles.thumb, { width: layout.widthPx, height: layout.heightPx }]}>
    <PageBackground background={page.background} layout={layout} trim={spec.trimMm} />
    {page.elements.map(element => <StaticElementView key={element.id} element={element} layout={layout} />)}
  </View>
}

/** Every page in order. A tap opens a page; the last tile adds one after the open page. */
export function PageStrip({ pages, spec, pageIndex, canAdd, onOpen, onAdd }: {
  pages: BookPage[]
  spec: BookSpec
  pageIndex: number
  canAdd: boolean
  onOpen: (index: number) => void
  onAdd: () => void
}) {
  const scroll = useRef<ScrollView>(null)
  // Keep the open page in view when it changes (a new page, a move, undo).
  useEffect(() => {
    scroll.current?.scrollTo({ x: Math.max(0, pageIndex * (THUMB_WIDTH + GAP) - THUMB_WIDTH), animated: true })
  }, [pageIndex])
  return <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} accessibilityLabel="페이지 목록">
    {pages.map((page, index) => {
      const open = index === pageIndex
      return <Pressable key={page.id} accessibilityRole="button" accessibilityState={{ selected: open }} accessibilityLabel={`${index + 1}쪽${open ? ', 편집 중' : ''}`}
        onPress={() => onOpen(index)} style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
        <View style={[styles.frame, open && styles.frameOpen]}><PageThumb page={page} spec={spec} /></View>
        <Text style={[styles.number, open && styles.numberOpen]}>{index + 1}</Text>
      </Pressable>
    })}
    <Pressable accessibilityRole="button" accessibilityLabel="다음에 쪽 추가" accessibilityState={{ disabled: !canAdd }} disabled={!canAdd} onPress={onAdd}
      style={({ pressed }) => [styles.add, (pressed || !canAdd) && { opacity: canAdd ? 0.6 : 0.35 }]}>
      <Plus size={20} color={p.muted} />
    </Pressable>
  </ScrollView>
}

const styles = StyleSheet.create({
  strip: { gap: GAP, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, alignItems: 'flex-start' },
  item: { alignItems: 'center', gap: 4 },
  frame: { padding: 2, borderWidth: 2, borderColor: 'transparent', borderRadius: 4 },
  frameOpen: { borderColor: p.primary },
  thumb: { overflow: 'hidden', borderRadius: 1 },
  number: { fontSize: 13, color: p.muted },
  numberOpen: { color: p.primary, fontWeight: '700' },
  add: { width: THUMB_WIDTH + 8, height: THUMB_WIDTH * 1.4 + 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.line, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
})
