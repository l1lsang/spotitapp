import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text } from './Typography';
import { Check, FlipHorizontal2, Minus, Plus, RotateCcw, RotateCw, Undo2, X } from 'lucide-react-native'
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import type { UploadPhoto } from '../services/storageService'
import { Button, IconButton, Notice, QuietSurface, p } from './ui'

interface PhotoEditorProps {
  photo: UploadPhoto | null
  onClose: () => void
  onSave: (photo: UploadPhoto) => void
  square?: boolean
}
type ReadyPhoto = UploadPhoto & { width: number; height: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const ratios = [{ label: '원본 비율', value: 'original' }, { label: '정사각형 1:1', value: '1' }, { label: '가로 4:3', value: String(4 / 3) }, { label: '세로 3:4', value: String(3 / 4) }, { label: '가로 16:9', value: String(16 / 9) }]

export function PhotoEditor(props: PhotoEditorProps) {
  return props.photo ? <Editor key={props.photo.uri} {...props} photo={props.photo} /> : null
}

function Editor({ photo: input, onClose, onSave, square = false }: PhotoEditorProps & { photo: UploadPhoto }) {
  const { width, height } = useWindowDimensions()
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
  const frameWidth = Math.max(1, Math.min(availableWidth, Math.min(340, height * 0.4) * ratio))
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
    } catch { setError('사진을 편집하지 못했습니다. 다른 사진을 선택하거나 다시 시도해 주세요.') }
    finally { actionLock.current = false; setBusy(false) }
  }

  const controlsDisabled = busy || !photo
  const tools = [
    { label: '왼쪽 회전', Icon: RotateCcw, onPress: () => transform('left') },
    { label: '오른쪽 회전', Icon: RotateCw, onPress: () => transform('right') },
    { label: '좌우 반전', Icon: FlipHorizontal2, onPress: () => transform('flip') },
    { label: '초기화', Icon: Undo2, onPress: () => { setPhoto(original); setZoom(1); setPan({ x: 0, y: 0 }); setAspect(square ? '1' : 'original'); setError('') } },
  ]
  const toolBasis = { flexBasis: width <= 480 ? '45%' : '20%', flexGrow: 1 } as const
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <QuietSurface.Provider value={false}><SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Text accessibilityRole="header" style={styles.title}>{square ? '프로필 사진 편집' : '사진 편집'}</Text>
          <Text style={styles.note}>사진을 드래그하거나 화살표 버튼으로 움직여 영역을 맞춰 주세요.</Text>
        </View>
        <IconButton label="사진 편집 닫기" disabled={busy} onPress={close}><X color={p.ink} size={20} /></IconButton>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
        <View style={styles.preview} onLayout={event => setAvailableWidth(Math.max(1, event.nativeEvent.layout.width - 24))}>
          {photo ? <View {...responder.panHandlers} accessibilityLabel="자르기 미리보기. 손가락으로 사진을 움직여 영역을 조절하세요."
            style={[styles.frame, { width: frameWidth, height: frameHeight }]}>
            <Image source={{ uri: photo.uri }} style={{ position: 'absolute', width: imageWidth, height: imageHeight, left: -maxPanX + pan.x * maxPanX, top: -maxPanY + pan.y * maxPanY }} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frameEdge]}>
              {[1 / 3, 2 / 3].map(value => <View key={`x${value}`} style={[styles.gridLine, { left: frameWidth * value, top: 0, width: 1, height: frameHeight }]} />)}
              {[1 / 3, 2 / 3].map(value => <View key={`y${value}`} style={[styles.gridLine, { top: frameHeight * value, left: 0, height: 1, width: frameWidth }]} />)}
            </View>
          </View> : <View accessibilityLiveRegion="polite" style={styles.loading}>{busy ? <><ActivityIndicator color={p.paper} /><Text style={styles.previewStatus}>사진을 불러오는 중…</Text></> : <Text style={styles.previewStatus}>사진을 열 수 없습니다.</Text>}</View>}
        </View>
        <View style={styles.controls}>
          <Text style={styles.controlTitle}>사진 조절</Text>
          {!square && <View style={styles.ratio}>
            <Text style={styles.controlLabel}>자르기 비율</Text>
            <View style={styles.ratioOptions}>{ratios.map(item => {
              const selected = aspect === item.value
              return <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: controlsDisabled }} disabled={controlsDisabled}
                onPress={() => { setAspect(item.value); setZoom(1); setPan({ x: 0, y: 0 }) }} style={[styles.option, selected && styles.optionSelected]}>
                <Text style={[styles.optionText, selected && { color: p.primary }]}>{item.label}</Text>
              </Pressable>
            })}</View>
          </View>}
          <View style={styles.zoom}>
            <View style={styles.zoomLabel}><Text style={styles.controlLabel}>확대</Text><Text style={styles.zoomValue}>{Math.round(zoom * 100)}%</Text></View>
            <View style={styles.zoomButtons}>
              <Pressable accessibilityRole="button" accessibilityLabel="축소" disabled={controlsDisabled || zoom <= 1} onPress={() => setZoom(value => Math.max(1, value - 0.1))} style={({ pressed }) => [styles.tool, { flex: 1 }, pressed && styles.toolPressed, (controlsDisabled || zoom <= 1) && styles.disabled]}><Minus color={p.ink} size={17} /><Text style={styles.toolText}>축소</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="확대" disabled={controlsDisabled || zoom >= 4} onPress={() => setZoom(value => Math.min(4, value + 0.1))} style={({ pressed }) => [styles.tool, { flex: 1 }, pressed && styles.toolPressed, (controlsDisabled || zoom >= 4) && styles.disabled]}><Plus color={p.ink} size={17} /><Text style={styles.toolText}>확대</Text></Pressable>
            </View>
          </View>
          <View style={styles.tools}>{tools.map(({ label, Icon, onPress }) => <Pressable key={label} accessibilityRole="button" disabled={controlsDisabled} onPress={onPress}
            style={({ pressed }) => [styles.tool, toolBasis, pressed && styles.toolPressed, controlsDisabled && styles.disabled]}><Icon size={17} color={p.ink} /><Text style={styles.toolText}>{label}</Text></Pressable>)}</View>
          <View style={styles.tools}>{[{ label: '←', hint: '사진을 왼쪽으로 이동', x: -0.1, y: 0 }, { label: '→', hint: '사진을 오른쪽으로 이동', x: 0.1, y: 0 }, { label: '↑', hint: '사진을 위로 이동', x: 0, y: -0.1 }, { label: '↓', hint: '사진을 아래로 이동', x: 0, y: 0.1 }].map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.hint} disabled={controlsDisabled} onPress={() => move(item.x, item.y)}
            style={({ pressed }) => [styles.tool, { flex: 1 }, pressed && styles.toolPressed, controlsDisabled && styles.disabled]}><Text style={styles.toolText}>{item.label}</Text></Pressable>)}</View>
        </View>
        {!!error && <Notice error>{error}</Notice>}
        {!photo && !busy && <Button title="다시 불러오기" variant="secondary" onPress={() => setRevision(value => value + 1)} />}
      </ScrollView>
      <View style={styles.footer}>
        <Button title="취소" variant="secondary" disabled={busy && !!photo} onPress={close} style={width <= 480 ? { flex: 1 } : undefined} />
        <Button title={busy && !!photo ? '적용 중…' : '편집 적용'} icon={<Check size={17} color={p.paper} />} disabled={controlsDisabled} onPress={save} style={width <= 480 ? { flex: 1 } : undefined} />
      </View>
    </SafeAreaView></QuietSurface.Provider>
  </Modal>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.paper },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  title: { color: p.ink, fontSize: 19, lineHeight: 26, fontWeight: '600', letterSpacing: -0.5 },
  note: { color: p.muted, fontSize: 13, lineHeight: 20 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 16, width: '100%', maxWidth: 680, alignSelf: 'center' },
  preview: { alignItems: 'center', justifyContent: 'center', minHeight: 180, padding: 12, borderRadius: 10, backgroundColor: p.ink },
  frame: { overflow: 'hidden', backgroundColor: p.surface }, frameEdge: { borderWidth: 1, borderColor: '#FFFFFFCC' },
  gridLine: { position: 'absolute', backgroundColor: '#FFFFFF55' },
  loading: { padding: 55, alignItems: 'center', gap: 12 }, previewStatus: { color: p.paper, fontSize: 14 },
  controls: { gap: 12 }, controlTitle: { color: p.ink, fontSize: 14.4, fontWeight: '600' },
  controlLabel: { color: p.ink, fontSize: 14 },
  ratio: { gap: 8 }, ratioOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: p.line, backgroundColor: p.paper },
  optionSelected: { borderColor: p.primarySoft, backgroundColor: p.primarySoft }, optionText: { color: p.ink, fontSize: 13 },
  zoom: { gap: 6 }, zoomLabel: { flexDirection: 'row', justifyContent: 'space-between' }, zoomValue: { color: p.muted, fontSize: 14, fontVariant: ['tabular-nums'] },
  zoomButtons: { flexDirection: 'row', gap: 8 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tool: { minHeight: 44, padding: 6, borderWidth: 1, borderColor: p.line, borderRadius: 8, backgroundColor: p.paper, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  toolPressed: { backgroundColor: p.primarySoft }, toolText: { fontSize: 12.8, color: p.ink }, disabled: { opacity: 0.5 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: p.line, backgroundColor: p.paper },
})
