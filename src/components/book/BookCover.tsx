import { StyleSheet, View } from 'react-native'
import { Text } from '../Typography'
import { RemoteImage } from '../RemoteImage'
import { p } from '../ui'
import type { BookCoverStyle, BookImageRef } from '../../types/book'

const KRAFT = '#B98A57'
const CREAM = '#F7F2E8'

export const COVER_STYLES: readonly { id: BookCoverStyle; label: string }[] = [
  { id: 'photo', label: '사진 한 장' },
  { id: 'minimal', label: '여백' },
  { id: 'kraft', label: '크라프트 수첩' },
]

/** A small drawing of the front cover (A5 proportions), for lists and the cover choice. */
export function BookCover({ coverStyle, title, photo, width }: { coverStyle: BookCoverStyle; title: string; photo: BookImageRef | null; width: number }) {
  const height = width * (210 / 148)
  const uri = photo ? photo.thumbUrl || photo.url : ''
  const fontSize = Math.max(7, width / 11)
  const label = title.trim() || '제목 없는 책'
  const small = width < 80
  return <View accessible={false} style={[styles.cover, { width, height }, coverStyle === 'kraft' && { backgroundColor: KRAFT }]}>
    {coverStyle === 'photo' && <>
      {uri ? <RemoteImage uri={uri} contentFit="cover" style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: p.surface }]} />}
      {!small && <View style={styles.photoStrip}><Text numberOfLines={1} style={[styles.title, { fontSize }]}>{label}</Text></View>}
    </>}
    {coverStyle === 'minimal' && <View style={styles.minimal}>
      {uri ? <RemoteImage uri={uri} contentFit="cover" style={{ width: width * 0.56, height: width * 0.56 }} /> : null}
      {!small && <Text numberOfLines={2} style={[styles.title, { fontSize, textAlign: 'center' }]}>{label}</Text>}
    </View>}
    {coverStyle === 'kraft' && !small && <View style={styles.kraftLabel}>
      <Text numberOfLines={2} style={[styles.title, { fontSize, textAlign: 'center' }]}>{label}</Text>
    </View>}
    <View pointerEvents="none" style={styles.spine} />
  </View>
}

const styles = StyleSheet.create({
  cover: { backgroundColor: CREAM, borderRadius: 2, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#00000014' },
  photoStrip: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 6, paddingHorizontal: 6, backgroundColor: CREAM },
  minimal: { alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  kraftLabel: { backgroundColor: CREAM, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: 10 },
  title: { color: p.ink, fontWeight: '600' },
})
