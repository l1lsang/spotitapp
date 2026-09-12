import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { FlipHorizontal2, Minus, Plus, RotateCcw, RotateCw, Undo2, X } from 'lucide-react-native'
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import type { UploadPhoto } from '../services/storageService'
import { Button, Chip, Notice, Screen, p, s } from './ui'

interface PhotoEditorProps {
  photo: UploadPhoto | null
  onClose: () => void
  onSave: (photo: UploadPhoto) => void
  square?: boolean
}
type ReadyPhoto = UploadPhoto & { width: number; height: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const ratios = [{ label: '원본', value: 'original' }, { label: '1:1', value: '1' }, { label: '4:3', value: String(4 / 3) }, { label: '3:4', value: String(3 / 4) }, { label: '16:9', value: String(16 / 9) }]

export function PhotoEditor(props: PhotoEditorProps) {
  return props.photo ? <Editor key={props.photo.uri} {...props} photo={props.photo} /> : null
}

function Editor({ photo: input, onClose, onSave, square = false }: PhotoEditorProps & { photo: UploadPhoto }) {
  const [photo, setPhoto] = useState<ReadyPhoto | null>(null)
  const [original, setOriginal] = useState<ReadyPhoto | null>(null)
  const [aspect, setAspect] = useState(square ? '1' : 'original')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [availableWidth, setAvailableWidth] = useState(320)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const actionLock = useRef(false)

  useEffect(() => {
    let active = true
    setBusy(true); setError('')
    // Decode once into a local still image. This also freezes animated sources,
    // so the crop preview and the saved frame refer to the same pixels.
    const load = async () => {
      const context = ImageManipulator.manipulate(input.uri)
      const rendered = await context.renderAsync()
      const result = await rendered.saveAsync({ format: SaveFormat.PNG })
      if (active) {
        const image = { ...result, name: input.name || 'photo.png', mimeType: 'image/png' }
        setPhoto(image); setOriginal(image); setZoom(1); setPan({ x: 0, y: 0 })
      }
    }
    load().catch(() => { if (active) setError('사진을 열지 못했습니다. 다른 사진을 선택하거나 다시 시도해 주세요.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [input.uri, input.name, revision])

  const ratio = aspect === 'original' ? (photo ? photo.width / photo.height : 1) : Number(aspect)
  const frameWidth = Math.max(1, Math.min(availableWidth, 370 * ratio))
  const frameHeight = frameWidth / ratio
  const cropWidth = photo ? Math.min(photo.width, photo.height * ratio) / zoom : 1
  const cropHeight = cropWidth / ratio
  const scale = frameWidth / cropWidth
  const imageWidth = (photo?.width || 1) * scale
  const imageHeight = (photo?.height || 1) * scale
  const maxPanX = Math.max(0, (imageWidth - frameWidth) / 2)
  const maxPanY = Math.max(0, (imageHeight - frameHeight) / 2)
  const latest = useRef({ busy, maxPanX, maxPanY, pan })
  latest.current = { busy, maxPanX, maxPanY, pan }
  const dragStart = useRef(pan)
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.busy,
    onMoveShouldSetPanResponder: () => !latest.current.busy,
    onPanResponderGrant: () => { dragStart.current = latest.current.pan },
    onPanResponderMove: (_, gesture) => {
      const state = latest.current
      if (state.busy) return
      setPan({ x: state.maxPanX ? clamp(dragStart.current.x + gesture.dx / state.maxPanX, -1, 1) : 0,
        y: state.maxPanY ? clamp(dragStart.current.y + gesture.dy / state.maxPanY, -1, 1) : 0 })
    },
    onPanResponderTerminationRequest: () => false,
  }), [])

  function close() { if (!actionLock.current) onClose() }
  function move(x: number, y: number) { setPan(previous => ({ x: clamp(previous.x + x, -1, 1), y: clamp(previous.y + y, -1, 1) })) }

  async function transform(action: 'left' | 'right' | 'flip') {
    if (!photo || actionLock.current || busy) return
    actionLock.current = true; setBusy(true); setError('')
    try {
      const context = ImageManipulator.manipulate(photo.uri)
      if (action === 'flip') context.flip(FlipType.Horizontal)
      else context.rotate(action === 'left' ? -90 : 90)
      const rendered = await context.renderAsync()
      const result = await rendered.saveAsync({ format: SaveFormat.PNG })
      setPhoto({ ...result, name: photo.name, mimeType: 'image/png' }); setPan({ x: 0, y: 0 }); setZoom(1)
    } catch { setError('사진을 조절하지 못했습니다. 다시 시도해 주세요.') }
    finally { actionLock.current = false; setBusy(false) }
  }

  async function save() {
    if (!photo || actionLock.current || busy) return
    actionLock.current = true; setBusy(true); setError('')
    try {
      const width = Math.max(1, Math.min(photo.width, Math.round(cropWidth)))
      const height = Math.max(1, Math.min(photo.height, Math.round(cropHeight)))
      const originX = Math.round(clamp((photo.width - width) / 2 * (1 - pan.x), 0, photo.width - width))
      const originY = Math.round(clamp((photo.height - height) / 2 * (1 - pan.y), 0, photo.height - height))
      const context = ImageManipulator.manipulate(photo.uri)
      context.crop({ originX, originY, width, height })
      const maxDimension = square ? 768 : 2048
      if (Math.max(width, height) > maxDimension) context.resize(width > height ? { width: maxDimension } : { height: maxDimension })
      const rendered = await context.renderAsync()
      const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.94 })
      onSave({ ...result, name: 'edited-photo.jpg', mimeType: 'image/jpeg' })
    } catch { setError('사진을 저장하지 못했습니다. 다시 시도해 주세요.') }
    finally { actionLock.current = false; setBusy(false) }
  }

  const controlsDisabled = busy || !photo
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <Screen title={square ? '프로필 사진 편집' : '사진 편집'} right={<Pressable accessibilityRole="button" accessibilityLabel="사진 편집 닫기" disabled={busy} onPress={close} style={styles.iconButton}><X color={p.ink} size={23} /></Pressable>}>
      <Text style={s.muted}>사진을 움직여 원하는 영역을 맞춰 주세요.</Text>
      <View style={styles.previewContainer} onLayout={event => setAvailableWidth(Math.max(1, event.nativeEvent.layout.width))}>
        {photo ? <View {...responder.panHandlers} accessibilityLabel="자르기 미리보기. 손가락으로 사진을 움직여 영역을 조절하세요."
          style={[styles.frame, { width: frameWidth, height: frameHeight }]}>
          <Image source={{ uri: photo.uri }} style={{ position: 'absolute', width: imageWidth, height: imageHeight, left: -maxPanX + pan.x * maxPanX, top: -maxPanY + pan.y * maxPanY }} />
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {[1 / 3, 2 / 3].map(value => <View key={`x${value}`} style={[styles.gridLine, { left: frameWidth * value, top: 0, width: 1, height: frameHeight }]} />)}
            {[1 / 3, 2 / 3].map(value => <View key={`y${value}`} style={[styles.gridLine, { top: frameHeight * value, left: 0, height: 1, width: frameWidth }]} />)}
          </View>
        </View> : <View style={styles.loading}>{busy ? <ActivityIndicator color={p.primary} /> : <Text style={s.muted}>사진을 열 수 없습니다.</Text>}</View>}
      </View>
      {!square && <View style={styles.ratios}>{ratios.map(item => <Chip key={item.value} label={item.label} selected={aspect === item.value} onPress={() => { if (!controlsDisabled) { setAspect(item.value); setZoom(1); setPan({ x: 0, y: 0 }) } }} />)}</View>}
      <View style={styles.zoomRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="축소" disabled={controlsDisabled || zoom <= 1} onPress={() => setZoom(value => Math.max(1, value - 0.1))} style={styles.tool}><Minus color={p.primary} size={19} /></Pressable>
        <Text style={styles.zoomLabel}>확대 {Math.round(zoom * 100)}%</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="확대" disabled={controlsDisabled || zoom >= 4} onPress={() => setZoom(value => Math.min(4, value + 0.1))} style={styles.tool}><Plus color={p.primary} size={19} /></Pressable>
      </View>
      <View style={styles.tools}>
        <Pressable accessibilityRole="button" disabled={controlsDisabled} onPress={() => transform('left')} style={styles.tool}><RotateCcw size={19} color={p.primary} /><Text style={styles.toolText}>왼쪽 회전</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={controlsDisabled} onPress={() => transform('right')} style={styles.tool}><RotateCw size={19} color={p.primary} /><Text style={styles.toolText}>오른쪽 회전</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={controlsDisabled} onPress={() => transform('flip')} style={styles.tool}><FlipHorizontal2 size={19} color={p.primary} /><Text style={styles.toolText}>좌우 반전</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={controlsDisabled} onPress={() => { setPhoto(original); setZoom(1); setPan({ x: 0, y: 0 }); setAspect(square ? '1' : 'original'); setError('') }} style={styles.tool}><Undo2 size={19} color={p.primary} /><Text style={styles.toolText}>초기화</Text></Pressable>
      </View>
      <View style={styles.tools}>{[{ label: '←', hint: '사진을 왼쪽으로 이동', x: -0.1, y: 0 }, { label: '→', hint: '사진을 오른쪽으로 이동', x: 0.1, y: 0 }, { label: '↑', hint: '사진을 위로 이동', x: 0, y: -0.1 }, { label: '↓', hint: '사진을 아래로 이동', x: 0, y: 0.1 }].map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.hint} disabled={controlsDisabled} onPress={() => move(item.x, item.y)} style={styles.nudge}><Text style={styles.toolText}>{item.label}</Text></Pressable>)}</View>
      {!!error && <Notice error>{error}</Notice>}
      {!photo && !busy && <Button title="다시 불러오기" variant="secondary" onPress={() => setRevision(value => value + 1)} />}
      <Button title="편집 적용" loading={busy && !!photo} disabled={controlsDisabled} onPress={save} />
      <Button title="취소" variant="secondary" disabled={busy} onPress={close} />
    </Screen>
  </Modal>
}

const styles = StyleSheet.create({
  iconButton: { padding: 8 }, previewContainer: { alignItems: 'center', justifyContent: 'center', minHeight: 180, backgroundColor: p.surface, borderRadius: 18, overflow: 'hidden' },
  frame: { overflow: 'hidden', backgroundColor: p.ink }, gridLine: { position: 'absolute', backgroundColor: '#FFFFFF88' }, loading: { padding: 55 },
  ratios: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }, zoomLabel: { color: p.ink, fontSize: 15, fontWeight: '600', minWidth: 105, textAlign: 'center' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tool: { paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: p.line, borderRadius: 13, backgroundColor: p.paper, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, toolText: { fontSize: 12, color: p.primary, fontWeight: '600' }, nudge: { flex: 1, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: p.line, borderRadius: 12, backgroundColor: p.paper },
})
