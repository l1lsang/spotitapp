import { useContext, useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Typography';
import { Check, MapPin, Plus, Save, X } from 'lucide-react-native'
import * as Crypto from 'expo-crypto'
import { useAuth } from '../hooks/useAuth'
import { saveUserPinTheme } from '../services/userService'
import {
  DEFAULT_POST_PIN_COLOR, FOLLOWING_PIN_COLOR, PIN_COLOR_PALETTE,
  PIN_THEME_NAME_MAX_LENGTH, getPinThemeError, getPostPinColor, parsePinColorCode,
  type PinTheme, type PostFormInput,
} from '../types/post'
import { Button, Field, Notice, QuietSurface, p } from './ui'

type PinSelection = Pick<PostFormInput, 'pinColor' | 'pinThemeId'>
const monospace = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Consolas, monospace' })

// Six recommended colors, a quiet preview and the HEX code; selection shows a check and an ink ring.
export function PinColorPicker({ value, onChange, disabled = false }: {
  value: string; onChange: (color: string) => void; disabled?: boolean
}) {
  const quiet = useContext(QuietSurface)
  const [focused, setFocused] = useState(false)
  const color = parsePinColorCode(value)
  const preset = PIN_COLOR_PALETTE.find(item => item.color === color)
  const previewColor = color || '#a0a49d'
  return <View style={styles.control} accessibilityLabel="색상">
    <View style={styles.controlHeading}><Text style={styles.label}>색상</Text><Text style={styles.headingHint}>마음에 드는 색을 골라보세요</Text></View>
    <View style={styles.swatches} accessibilityLabel="추천 색상">{PIN_COLOR_PALETTE.map(item => {
      const selected = color === item.color
      return <Pressable key={item.color} accessibilityRole="button" accessibilityLabel={`${item.name} ${item.color.toUpperCase()}`}
        accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onChange(item.color.toUpperCase())}
        style={[styles.swatch, { backgroundColor: item.color }, disabled && styles.disabled]}>
        {selected && <View pointerEvents="none" style={styles.swatchRing} />}
        {selected && <Check size={18} strokeWidth={3} color={p.paper} />}
      </Pressable>
    })}</View>
    <View style={styles.preview}>
      <View style={[styles.previewIcon, { backgroundColor: previewColor }]}><MapPin size={23} color={p.paper} /></View>
      <View style={styles.previewText}><Text style={styles.previewName}>{color ? preset?.name || '나만의 색상' : '색상 확인'}</Text><Text style={styles.small}>{color ? color.toUpperCase() : '올바른 코드를 입력해 주세요'}</Text></View>
    </View>
    <View style={styles.hexField}>
      <Text style={styles.hexLabel}>HEX 색상 코드</Text>
      <TextInput accessibilityLabel="HEX 색상 코드" value={value} onChangeText={onChange} editable={!disabled}
        autoCapitalize="characters" autoCorrect={false} spellCheck={false} placeholder="#DF7658" placeholderTextColor={p.light} maxLength={7}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={[styles.hexInput, quiet && styles.hexQuiet, !color && styles.hexInvalid, focused && { borderColor: p.primary }, disabled && { color: p.muted }]} />
    </View>
    <Text style={[styles.small, !color && { color: p.danger }]}>{color ? '#을 포함하거나 생략한 3자리·6자리 코드를 입력할 수 있어요.' : '색상 코드는 0–9, A–F로 된 3자리 또는 6자리여야 해요.'}</Text>
  </View>
}

export function PinThemeEditor({ value, onChange }: { value?: PinSelection; onChange?: (value: PinSelection) => void }) {
  const { currentUser, profile, refreshProfile } = useAuth()
  const [editing, setEditing] = useState<PinTheme | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const themes = profile?.pinThemes || []
  const color = value ? (value.pinThemeId ? getPostPinColor(value, themes) : value.pinColor) : PIN_COLOR_PALETTE[0].color

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
    } catch (err) { setError(err instanceof Error ? err.message : '핀 테마를 저장하지 못했습니다.') }
    finally { setSaving(false) }
  }

  // In the record form the picker sits flat in the form; on the settings page it is its own soft group.
  return <View style={[styles.fieldset, !value && styles.settingsBox]}>
    <Text accessibilityRole="header" style={styles.legend}>{value ? '내 핀 색상과 테마' : '내 핀 테마'}</Text>
    {value && !editing && <PinColorPicker value={color} onChange={pinColor => onChange?.({ pinColor, pinThemeId: '' })} />}
    <View style={styles.themes} accessibilityLabel="내 핀 테마 목록">{themes.map(theme => {
      const active = value?.pinThemeId === theme.id
      return <Pressable key={theme.id} accessibilityRole="button" accessibilityLabel={value ? theme.name : `${theme.name} 테마 수정`}
        accessibilityState={value ? { selected: active } : undefined}
        onPress={() => { setError(''); if (value) onChange?.({ pinColor: theme.color, pinThemeId: theme.id }); else setEditing(theme) }}
        style={({ pressed }) => [styles.theme, (active || pressed) && styles.activeTheme]}>
        <View style={[styles.dot, { backgroundColor: theme.color }]} /><Text style={[styles.themeText, active && { color: p.ink }]}>{theme.name}</Text>
      </Pressable>
    })}
      <Pressable accessibilityRole="button" disabled={!currentUser} style={({ pressed }) => [styles.theme, pressed && styles.activeTheme, !currentUser && styles.disabled]}
        onPress={() => { setError(''); setEditing({ id: Crypto.randomUUID(), name: '', color: parsePinColorCode(color) || DEFAULT_POST_PIN_COLOR }) }}>
        <Plus size={14} color={p.muted} /><Text style={styles.themeText}>핀 테마 추가</Text>
      </Pressable>
    </View>
    {!themes.length && <Text style={styles.help}>이름과 색상을 정해 나만의 핀 테마를 추가해 보세요.</Text>}
    {!value && themes.length > 0 && <Text style={styles.help}>테마를 누르면 이름과 색상을 바꿀 수 있어요.</Text>}
    {editing && currentUser && <View style={styles.editor}>
      <Field label="테마 이름" autoFocus value={editing.name} maxLength={PIN_THEME_NAME_MAX_LENGTH} placeholder="예: 다시 가고 싶은 곳"
        editable={!saving} onChangeText={name => setEditing({ ...editing, name })} onSubmitEditing={() => void save()} returnKeyType="done" />
      <PinColorPicker value={editing.color} onChange={next => setEditing({ ...editing, color: next })} disabled={saving} />
      {error ? <Notice error>{error}</Notice> : null}
      <View style={styles.actions}>
        <Button title="취소" variant="secondary" icon={<X size={15} color={p.ink} />} disabled={saving} onPress={() => { setError(''); setEditing(null) }} />
        <Button title={saving ? '저장 중' : '테마 저장'} icon={<Save size={15} color={p.paper} />} disabled={saving || !parsePinColorCode(editing.color)} onPress={() => void save()} />
      </View>
    </View>}
    <View style={styles.following}><View style={[styles.followingDot, { backgroundColor: FOLLOWING_PIN_COLOR }]} />
      <Text style={styles.help}>팔로잉 핀은 고정 색상으로 표시됩니다.</Text></View>
  </View>
}

const styles = StyleSheet.create({
  fieldset: { gap: 12, minWidth: 0 },
  settingsBox: { padding: 13, borderWidth: 1, borderColor: p.line, borderRadius: 8, backgroundColor: p.surface },
  legend: { color: p.ink, fontSize: 14, fontWeight: '600' },
  control: { gap: 12, minWidth: 0 },
  controlHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, rowGap: 4 },
  label: { color: p.ink, fontSize: 14, fontWeight: '600' }, headingHint: { color: p.muted, fontSize: 11.8 },
  swatches: { flexDirection: 'row', gap: 9, paddingVertical: 4 },
  swatch: { flex: 1, minWidth: 0, height: 44, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  swatchRing: { position: 'absolute', top: -4, right: -4, bottom: -4, left: -4, borderRadius: 9, borderWidth: 2, borderColor: p.ink },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, minWidth: 0 },
  previewIcon: { width: 42, height: 42, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  previewText: { flex: 1, minWidth: 0, gap: 4 }, previewName: { color: p.ink, fontSize: 13.4, fontWeight: '600' },
  small: { color: p.muted, fontSize: 11.5, lineHeight: 18 },
  hexField: { gap: 7, minWidth: 0 }, hexLabel: { color: p.ink, fontSize: 12.5, fontWeight: '600' },
  hexInput: { height: 44, paddingHorizontal: 13, borderWidth: 1, borderColor: p.line, borderRadius: 6, backgroundColor: p.paper, color: p.ink, fontSize: 14.4, letterSpacing: 0.7, fontFamily: monospace },
  hexQuiet: { borderColor: p.transparent, backgroundColor: p.surface }, hexInvalid: { borderColor: p.danger },
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  theme: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 9, borderRadius: 6, backgroundColor: p.transparent },
  activeTheme: { backgroundColor: p.surface }, themeText: { color: p.muted, fontSize: 12.5, fontWeight: '500' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: p.paper, boxShadow: '0 0 0 1px #161F1B1F' },
  help: { flexShrink: 1, color: p.muted, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  editor: { gap: 12, padding: 14, borderWidth: 1, borderColor: p.line, borderRadius: 10, backgroundColor: p.paper },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  following: { flexDirection: 'row', alignItems: 'center', gap: 6 }, followingDot: { width: 10, height: 10, borderRadius: 5 },
  disabled: { opacity: 0.55 },
})
