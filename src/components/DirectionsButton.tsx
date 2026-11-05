import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { BusFront, Car, Footprints, Route } from 'lucide-react-native'
import { useCurrentLocation } from '../hooks/useCurrentLocation'
import { useAuth } from '../hooks/useAuth'
import { startMapDirections, type TravelMode } from '../lib/mapDirections'
import { openDirectionsUrl } from '../lib/openDirectionsUrl'
import type { LatLng } from '../lib/mapLocation'
import { Dialog } from './Dialog'
import { Button, Notice, p } from './ui'

const modes = [
  { value: 'transit', label: '대중교통', Icon: BusFront },
  { value: 'walking', label: '도보', Icon: Footprints },
  { value: 'driving', label: '자동차', Icon: Car },
] as const

export function DirectionsButton({ destination, placeName }: { destination: LatLng; placeName?: string }) {
  const geo = useCurrentLocation()
  const { currentUser } = useAuth()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState<TravelMode | null>(null)
  const [message, setMessage] = useState('')
  const revision = useRef(0)
  const locked = useRef(false)
  useEffect(() => {
    revision.current++
    locked.current = false
    setVisible(false); setBusy(null); setMessage('')
    return () => { revision.current++ }
  }, [destination.lat, destination.lng, currentUser?.uid])

  function close() {
    revision.current++
    locked.current = false
    setVisible(false); setBusy(null); setMessage('')
  }

  async function navigate(mode: TravelMode) {
    if (locked.current) return
    locked.current = true
    const request = ++revision.current
    setBusy(mode); setMessage('')
    try {
      const opened = await startMapDirections(destination, mode, {
        getCurrentLocation: () => geo.requestLocation(), openUrl: openDirectionsUrl,
        isCancelled: () => request !== revision.current,
      })
      if (opened && request === revision.current) close()
    } catch (error) {
      if (request === revision.current) setMessage(error instanceof Error ? error.message : '길찾기를 시작할 수 없습니다.')
    } finally {
      if (request === revision.current) { locked.current = false; setBusy(null) }
    }
  }

  return <>
    <Button title="현재 위치에서 길찾기" variant="secondary" icon={<Route size={18} color={p.primary} />} onPress={() => { setMessage(''); setVisible(true) }} />
    <Dialog visible={visible} title="Google 지도 길찾기" onClose={close}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: p.muted, fontSize: 14 }}>출발 · 현재 위치</Text>
        <Text style={{ color: p.ink, fontSize: 16, fontWeight: '700' }}>도착 · {placeName || '선택한 핀'}</Text>
      </View>
      <View accessibilityLabel="이동 수단">{modes.map(({ value, label, Icon }) => <Pressable key={value} accessibilityRole="button"
        accessibilityState={{ disabled: busy !== null, busy: busy === value }} disabled={busy !== null} onPress={() => void navigate(value)}
        style={({ pressed }) => [styles.mode, pressed && { backgroundColor: p.surface }, busy !== null && busy !== value && { opacity: 0.6 }]}>
        {busy === value ? <ActivityIndicator size="small" color={p.primary} /> : <Icon size={19} color={p.primary} />}
        <Text style={styles.modeText}>{busy === value ? '현재 위치 확인 중…' : label + ' 길찾기'}</Text>
      </Pressable>)}</View>
      {!!message && <Notice error>{message}{geo.error ? '\n' + geo.error : ''}</Notice>}
      <Text style={{ color: p.muted, fontSize: 13, lineHeight: 20 }}>Google 지도 앱 또는 웹에서 경로를 확인합니다. 해당 지역·이동 수단의 경로가 없으면 Google 지도에서 이용 불가 안내를 확인할 수 있습니다.</Text>
    </Dialog>
  </>
}

// Travel modes are actions, listed like the map place panel's actions: icon and primary text, no boxes.
const styles = StyleSheet.create({
  mode: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 4, borderRadius: 6 },
  modeText: { color: p.primary, fontSize: 15, fontWeight: '600' },
})
