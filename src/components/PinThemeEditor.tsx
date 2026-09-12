import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Check, Plus } from 'lucide-react-native'
import * as Crypto from 'expo-crypto'
import { useAuth } from '../hooks/useAuth'
import { saveUserPinTheme } from '../services/userService'
import {
  DEFAULT_POST_PIN_COLOR, FOLLOWING_PIN_COLOR, PIN_COLOR_PALETTE,
  PIN_THEME_NAME_MAX_LENGTH, getPinThemeError, getPostPinColor, parsePinColorCode,
  type PinTheme, type PostFormInput,
} from '../types/post'
import { Button, Field, H, Notice, Txt, p } from './ui'

type PinSelection = Pick<PostFormInput, 'pinColor' | 'pinThemeId'>

export function PinColorPicker({ value, onChange, disabled = false }: {
  value: string; onChange: (color: string) => void; disabled?: boolean
}) {
  return <View style={styles.gap}>
    <View style={styles.swatches}>{PIN_COLOR_PALETTE.map(item => <Pressable key={item.color}
      accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: value === item.color, disabled }}
      disabled={disabled} onPress={() => onChange(item.color)}
      style={[styles.swatch, { backgroundColor: item.color }, value === item.color && styles.selected]}>
      {value === item.color && <Check size={19} color="white" />}
    </Pressable>)}</View>
    <Field label="색상 코드" value={value} onChangeText={onChange} autoCapitalize="none" autoCorrect={false}
      placeholder="#df7658" maxLength={7} editable={!disabled} />
  </View>
}

export function PinThemeEditor({ value, onChange }: { value?: PinSelection; onChange?: (value: PinSelection) => void }) {
  const { currentUser, profile, refreshProfile } = useAuth()
  const [editing, setEditing] = useState<PinTheme | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const themes = profile?.pinThemes || []
  const color = value ? getPostPinColor(value, themes) : DEFAULT_POST_PIN_COLOR

  async function save() {
    if (!editing || !currentUser || saving) return
    const parsedColor = parsePinColorCode(editing.color)
    if (!parsedColor) { setError('올바른 HEX 색상 코드를 입력해 주세요.'); return }
    const next = { ...editing, name: editing.name.trim(), color: parsedColor }
    const validation = getPinThemeError(next)
    if (validation) { setError(validation); return }
    setSaving(true); setError('')
    try {
      await saveUserPinTheme(currentUser.uid, next)
      await refreshProfile()
      onChange?.({ pinColor: next.color, pinThemeId: next.id })
      setEditing(null)
    } catch (err) { setError(err instanceof Error ? err.message : '테마를 저장하지 못했습니다.') }
    finally { setSaving(false) }
  }

  return <View style={styles.card}>
    <H>{value ? '내 핀 색상과 테마' : '내 핀 테마'}</H>
    {value && !editing && <PinColorPicker value={color} onChange={pinColor => onChange?.({ pinColor, pinThemeId: '' })} />}
    <View style={styles.themes}>{themes.map(theme => <Pressable key={theme.id} accessibilityRole="button"
      accessibilityState={{ selected: value?.pinThemeId === theme.id }}
      onPress={() => { setError(''); value ? onChange?.({ pinColor: theme.color, pinThemeId: theme.id }) : setEditing(theme) }}
      style={[styles.theme, value?.pinThemeId === theme.id && styles.activeTheme]}>
      <View style={[styles.dot, { backgroundColor: theme.color }]} /><Txt>{theme.name}</Txt>
    </Pressable>)}
      <Pressable accessibilityRole="button" disabled={!currentUser} style={styles.theme}
        onPress={() => { setError(''); setEditing({ id: Crypto.randomUUID(), name: '', color }) }}>
        <Plus size={16} color={p.primary} /><Txt>핀 테마 추가</Txt>
      </Pressable>
    </View>
    {!themes.length && <Txt>이름과 색상을 정해 나만의 핀 테마를 추가해 보세요.</Txt>}
    {editing && <View style={styles.editor}>
      <Field label="테마 이름" value={editing.name} maxLength={PIN_THEME_NAME_MAX_LENGTH} placeholder="예: 다시 가고 싶은 곳"
        editable={!saving} onChangeText={name => setEditing({ ...editing, name })} />
      <PinColorPicker value={editing.color} onChange={color => setEditing({ ...editing, color })} disabled={saving} />
      {error ? <Notice error>{error}</Notice> : null}
      <View style={styles.actions}><Button title="취소" variant="secondary" disabled={saving} onPress={() => setEditing(null)} />
        <Button title="테마 저장" loading={saving} onPress={save} /></View>
    </View>}
    <View style={styles.hint}><View style={[styles.dot, { backgroundColor: FOLLOWING_PIN_COLOR }]} />
      <Txt>팔로잉 핀은 고정 색상으로 표시됩니다.</Txt></View>
  </View>
}

const styles = StyleSheet.create({
  gap: { gap: 12 }, card: { gap: 14 }, themes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  theme: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: p.line, borderRadius: 18, backgroundColor: p.paper },
  activeTheme: { borderColor: p.primary, backgroundColor: p.primarySoft }, dot: { width: 12, height: 12, borderRadius: 6 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, swatch: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  selected: { borderWidth: 3, borderColor: p.ink }, editor: { gap: 14, backgroundColor: p.surface, padding: 16, borderRadius: 16 },
  actions: { flexDirection: 'row', gap: 10 }, hint: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
