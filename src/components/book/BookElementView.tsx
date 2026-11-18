import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { Text } from '../Typography'
import { RemoteImage } from '../RemoteImage'
import { p } from '../ui'
import type { BookElement } from '../../types/book'
import { elementBoxPx, MM_PER_PT, type PageLayout } from '../../lib/book/geometry'
import { getBookFont } from '../../lib/book/styles'

/** A gesture in progress, drawn on top of the stored element until it is committed. */
export interface LiveTransform {
  /** `liveKey` of the element version the gesture started from. */
  key: string
  dxPx: number
  dyPx: number
  scale: number
  rotationDeg: number
}

export function liveKey(element: BookElement): string {
  const size = element.type === 'text' ? element.sizePt : 0
  return `${element.id}:${element.xMm}:${element.yMm}:${element.wMm}:${element.hMm}:${element.rotationDeg}:${size}`
}

/** What an element shows, at the given scale. Thumbnails use the small photo. */
function ElementContent({ element, layout, thumb, onLayout }: { element: BookElement; layout: PageLayout; thumb: boolean; onLayout?: (event: LayoutChangeEvent) => void }) {
  if (element.type === 'image') {
    const uri = thumb ? element.ref.thumbUrl || element.ref.url : element.ref.url
    return <RemoteImage uri={uri} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
  }
  const family = getBookFont(element.font).family
  const fontSize = element.sizePt * MM_PER_PT * layout.scale
  return <Text onLayout={onLayout} style={{
    width: element.wMm * layout.scale,
    color: element.color,
    textAlign: element.align,
    fontSize,
    lineHeight: fontSize * element.lineHeight,
    ...(family ? { fontFamily: family } : {}),
  }}>{element.text}</Text>
}

/** A still element, for thumbnails and previews. */
export function StaticElementView({ element, layout }: { element: BookElement; layout: PageLayout }) {
  return <View pointerEvents="none" style={[styles.element, elementBoxPx(element, layout), { transform: [{ rotate: `${element.rotationDeg}deg` }] }]}>
    <ElementContent element={element} layout={layout} thumb />
  </View>
}

/** An element on the editing canvas, following the gesture that is moving it. */
export function BookElementView({ element, layout, selected, live, onTextHeight }: {
  element: BookElement
  layout: PageLayout
  selected: boolean
  live: SharedValue<LiveTransform | null>
  onTextHeight: (id: string, hMm: number) => void
}) {
  const key = liveKey(element)
  const rotation = element.rotationDeg
  // Once the committed element arrives its key changes, so the gesture's overlay
  // stops applying in the same frame: no jump back to the old place.
  const animated = useAnimatedStyle(() => {
    const value = live.get()
    const own = value !== null && value.key === key
    return {
      transform: [
        { translateX: own ? value.dxPx : 0 },
        { translateY: own ? value.dyPx : 0 },
        { rotate: `${own ? value.rotationDeg : rotation}deg` },
        { scale: own ? value.scale : 1 },
      ],
    }
  })

  const onLayout = (event: LayoutChangeEvent) => {
    if (element.type === 'text') onTextHeight(element.id, event.nativeEvent.layout.height / layout.scale)
  }

  return <Animated.View pointerEvents="none" style={[styles.element, elementBoxPx(element, layout), animated]}>
    <ElementContent element={element} layout={layout} thumb={false} onLayout={onLayout} />
    {selected && <View style={styles.selection} />}
  </Animated.View>
}

const styles = StyleSheet.create({
  element: { position: 'absolute' },
  selection: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderWidth: 1.5, borderColor: p.primary },
})
