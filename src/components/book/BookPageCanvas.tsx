import { useEffect, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import type { BookPage } from '../../types/book'
import type { BookSpec } from '../../lib/book/specs'
import { applyTransform, fitPageLayout, hitTest, pagePxToMm, type ElementTransform } from '../../lib/book/geometry'
import { createGestureSession, type GestureFrame } from '../../lib/book/gestureSession'
import { BookElementView, liveKey, type LiveTransform } from './BookElementView'

const WORKSPACE_PADDING = 20

/**
 * One page, drawn at the largest size that fits, with its elements and print guides.
 * One finger moves the element it starts on; two fingers resize and turn the
 * selected element wherever they land, so small items stay workable. A tap selects;
 * a tap on the already selected text opens it for writing.
 */
export function BookPageCanvas({ page, spec, selectedId, showGuides, onSelect, onTransform, onEditText, onTextHeight }: {
  page: BookPage
  spec: BookSpec
  selectedId: string | null
  showGuides: boolean
  onSelect: (id: string | null) => void
  onTransform: (id: string, transform: ElementTransform) => void
  onEditText: (id: string) => void
  onTextHeight: (id: string, hMm: number) => void
}) {
  const [area, setArea] = useState({ width: 0, height: 0 })
  const live = useSharedValue<LiveTransform | null>(null)
  const [session] = useState(createGestureSession)

  // A finished gesture's overlay is dropped once the stored page has caught up.
  useEffect(() => { if (session.isIdle()) live.set(null) }, [page, live, session])

  const layout = fitPageLayout(spec, Math.max(0, area.width - WORKSPACE_PADDING * 2), Math.max(0, area.height - WORKSPACE_PADDING * 2))
  const pageLeft = (area.width - layout.widthPx) / 2
  const pageTop = (area.height - layout.heightPx) / 2
  const toMm = (x: number, y: number) => pagePxToMm(x - pageLeft, y - pageTop, layout)
  const findElement = (id: string | null) => page.elements.find(element => element.id === id) ?? null

  const preview = (frame: GestureFrame | null) => {
    if (!frame) return
    const { target, transform } = frame
    // Preview exactly what will be stored: limits, snapping and the page edge included.
    const next = applyTransform(target, transform, spec)
    live.set({
      key: liveKey(target),
      dxPx: (next.xMm - target.xMm) * layout.scale,
      dyPx: (next.yMm - target.yMm) * layout.scale,
      scale: next.wMm / target.wMm,
      rotationDeg: next.rotationDeg,
    })
  }
  const end = () => {
    const frame = session.end()
    if (frame) onTransform(frame.target.id, frame.transform)
  }

  const pan = Gesture.Pan().runOnJS(true).minDistance(4)
    .onStart(event => {
      const point = toMm(event.x, event.y)
      const hit = findElement(hitTest(page.elements, point.x, point.y))
      // A one-finger drag on empty paper does nothing, so the page never slides by accident.
      const element = hit ?? (event.numberOfPointers > 1 ? findElement(selectedId) : null)
      if (hit && hit.id !== selectedId) onSelect(hit.id)
      session.begin(element)
    })
    .onUpdate(event => {
      preview(session.change({ dxMm: event.translationX / layout.scale, dyMm: event.translationY / layout.scale }))
    })
    .onEnd(end)
  const pinch = Gesture.Pinch().runOnJS(true)
    .onStart(() => session.begin(findElement(selectedId)))
    .onUpdate(event => preview(session.change({ scale: event.scale })))
    .onEnd(end)
  const rotate = Gesture.Rotation().runOnJS(true)
    .onStart(() => session.begin(findElement(selectedId)))
    .onUpdate(event => preview(session.change({ dRotationDeg: (event.rotation * 180) / Math.PI })))
    .onEnd(end)
  const tap = Gesture.Tap().runOnJS(true).maxDuration(300)
    .onEnd((event, success) => {
      if (!success) return
      const point = toMm(event.x, event.y)
      const id = hitTest(page.elements, point.x, point.y)
      const element = findElement(id)
      if (element && element.id === selectedId && element.type === 'text') onEditText(element.id)
      else onSelect(id)
    })
  const gesture = Gesture.Race(tap, Gesture.Simultaneous(pan, pinch, rotate))

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setArea(current => current.width === width && current.height === height ? current : { width, height })
  }

  const bleed = spec.bleedMm * layout.scale
  const safe = (spec.bleedMm + spec.safeMm) * layout.scale
  return <GestureDetector gesture={gesture}>
    <View style={styles.workspace} onLayout={onLayout} accessibilityLabel="책 페이지 편집 영역">
      {area.width > 0 && <View style={[styles.page, { left: pageLeft, top: pageTop, width: layout.widthPx, height: layout.heightPx, backgroundColor: page.background.color }]}>
        {page.elements.map(element => <BookElementView key={element.id} element={element} layout={layout} selected={element.id === selectedId} live={live} onTextHeight={onTextHeight} />)}
        {showGuides && <>
          <View pointerEvents="none" style={[styles.trim, { top: bleed, left: bleed, right: bleed, bottom: bleed }]} />
          <View pointerEvents="none" style={[styles.safe, { top: safe, left: safe, right: safe, bottom: safe }]} />
        </>}
      </View>}
    </View>
  </GestureDetector>
}

const styles = StyleSheet.create({
  workspace: { flex: 1, overflow: 'hidden' },
  // The drawn page includes the bleed; whatever lies outside it is not printed.
  page: { position: 'absolute', overflow: 'hidden', boxShadow: '0 4px 16px #19211D24' },
  trim: { position: 'absolute', borderWidth: 1, borderColor: '#C2493D' },
  safe: { position: 'absolute', borderWidth: 1, borderColor: '#3E6EA8', borderStyle: 'dashed' },
})
