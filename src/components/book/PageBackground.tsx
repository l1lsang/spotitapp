import { StyleSheet } from 'react-native'
import Svg, { Line, Rect } from 'react-native-svg'
import type { BookBackground } from '../../types/book'
import type { PageLayout } from '../../lib/book/geometry'
import { PATTERN_STEP_MM } from '../../lib/book/styles'

const LINE_COLOR = '#C5CEC0'

/** Lines at a fixed spacing from the trim corner, across the bleed too. */
function positions(lengthMm: number, bleedMm: number, stepMm: number): number[] {
  const values: number[] = []
  for (let mm = -Math.floor(bleedMm / stepMm) * stepMm; mm <= lengthMm + bleedMm; mm += stepMm) {
    if (mm > -bleedMm) values.push(mm + bleedMm)
  }
  return values
}

/** The paper: its colour and, for grid or lined paper, its printed lines. */
export function PageBackground({ background, layout, trim }: { background: BookBackground; layout: PageLayout; trim: { w: number; h: number } }) {
  const { scale, bleedMm, widthPx, heightPx } = layout
  const pattern = background.pattern
  const stroke = Math.max(0.5, 0.15 * scale)
  const step = pattern ? PATTERN_STEP_MM[pattern] : 0
  const rows = pattern ? positions(trim.h, bleedMm, step) : []
  const columns = pattern === 'grid' ? positions(trim.w, bleedMm, step) : []
  return <Svg pointerEvents="none" width={widthPx} height={heightPx} style={StyleSheet.absoluteFill}>
    <Rect x={0} y={0} width={widthPx} height={heightPx} fill={background.color} />
    {rows.map(mm => <Line key={`r${mm}`} x1={0} x2={widthPx} y1={mm * scale} y2={mm * scale} stroke={LINE_COLOR} strokeWidth={stroke} />)}
    {columns.map(mm => <Line key={`c${mm}`} y1={0} y2={heightPx} x1={mm * scale} x2={mm * scale} stroke={LINE_COLOR} strokeWidth={stroke} />)}
  </Svg>
}
