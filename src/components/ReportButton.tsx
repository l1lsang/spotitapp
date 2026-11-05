import { FormScrollView, useKeyboardVisible } from './keyboard'
import { useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { RemoteImage } from './RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, CheckCircle2, Flag, ShieldCheck, X } from 'lucide-react-native'
import { Button, Field, Notice, QuietSurface, elevation, p } from './ui'
import { submitReport } from '../services/moderationService'
import { REPORT_REASONS, type ReportTarget } from '../types/moderation'

export function ReportButton({ target, compact = false, label = '신고' }: { target: ReportTarget; compact?: boolean; label?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${target.label} ${label}`} onPress={() => setOpen(true)}
      style={({ pressed }) => [compact ? styles.compact : styles.trigger, !compact && pressed && { backgroundColor: p.surface }]}>
      {({ pressed }) => <><Flag size={compact ? 13 : 16} color={compact && pressed ? p.danger : compact ? p.muted : p.ink} />
        <Text style={[compact ? styles.compactText : styles.triggerText, compact && pressed && { color: p.danger }]}>{label}</Text></>}
    </Pressable>
    {open && <ReportDialog target={target} onClose={() => setOpen(false)} />}
  </>
}

// A centered card with its own outline (the web report dialog is not one of the quiet dialogs).
export function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const keyboardVisible = useKeyboardVisible()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const reasons = REPORT_REASONS.filter(item => target.kind === 'pin' || (target.kind === 'photo' && target.sourceKind === 'pin') || item.id !== 'false_place')
  async function submit() {
    if (busy || !reason || (reason === 'other' && !details.trim())) return
    setBusy(true)
    setError('')
    try {
      const result = await submitReport(target, reason, details.trim())
      setSuccess(result.duplicate ? '이미 접수한 신고입니다. 문의·신고 내역에서 처리 상태를 확인할 수 있어요.' : '신고가 접수되었습니다. 검토 후 처리하겠습니다.')
    } catch (e) {
      setError(e instanceof Error ? e.message : '신고를 접수하지 못했습니다.')
    } finally { setBusy(false) }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose() }}>
    <SafeAreaView style={styles.backdrop}>
      <View style={[styles.center, keyboardVisible && { justifyContent: 'flex-start' }]}>
        <View style={[styles.card, elevation.menu]}>
          <View style={styles.header}>
            <View style={styles.heading}><View style={styles.headingIcon}><Flag size={22} color={p.coral} /></View>
              <Text accessibilityRole="header" style={styles.title}>{target.kind === 'photo' ? '사진' : target.kind === 'pin' ? '핀' : target.kind === 'user' ? '유저' : target.kind === 'comment' ? (target.replyId ? '답글' : '댓글') : '채팅'} 신고</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="신고 창 닫기" disabled={busy} onPress={onClose} style={({ pressed }) => [styles.close, pressed && { backgroundColor: p.surface }]}><X size={20} color={p.ink} /></Pressable>
          </View>
          <QuietSurface.Provider value={false}>
            <FormScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {success ? <View accessibilityLiveRegion="polite" style={styles.success}><CheckCircle2 size={38} color={p.primary} /><Text style={styles.successText}>{success}</Text><Button title="확인" onPress={onClose} style={styles.fullButton} /></View> : <>
                <View style={styles.target}><Text style={styles.targetLabel}>신고 대상</Text><Text style={styles.targetText}>{target.label}</Text></View>
                {target.kind === 'photo' && <RemoteImage uri={target.photoUrl} accessibilityLabel="신고할 사진" style={styles.photo} contentFit="contain" />}
                <View style={styles.field}>
                  <Text style={styles.label}>신고 사유</Text>
                  <View accessibilityRole="radiogroup" accessibilityLabel="신고 사유">{reasons.map(item => {
                    const selected = reason === item.id
                    return <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: busy }} disabled={busy} onPress={() => setReason(item.id)}
                      style={({ pressed }) => [styles.reason, pressed && { backgroundColor: p.surface }]}>
                      <Text style={[styles.reasonText, selected && { color: p.primary }]}>{item.label}</Text>
                      {selected && <Check size={18} color={p.primary} />}
                    </Pressable>
                  })}</View>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>상세 내용{reason !== 'other' ? <Text style={styles.optional}> (선택)</Text> : null}</Text>
                  <Field accessibilityLabel="상세 내용" value={details} onChangeText={setDetails} editable={!busy} multiline maxLength={2000} placeholder="어떤 문제가 있었는지 알려 주세요." style={styles.details} textAlignVertical="top" />
                  <Text style={styles.counter}>{details.length.toLocaleString()} / 2,000자</Text>
                </View>
                <View style={styles.disclosure}><ShieldCheck size={18} color={p.muted} /><Text style={styles.disclosureText}>신고자 정보는 상대에게 공개되지 않습니다.{target.kind === 'photo' ? ' 선택한 사진의 주소, 작성자와 연결된 콘텐츠 정보가 검토를 위해 기록됩니다.' : target.kind === 'comment' ? ' 선택한 댓글 내용이 검토를 위해 보관됩니다.' : target.kind === 'chat' ? target.messageId ? ' 선택한 메시지와 첨부 사진이 검토를 위해 전달됩니다.' : ' 최근 메시지 최대 20개와 첨부 사진이 검토를 위해 전달됩니다.' : ' 신고 당시 콘텐츠가 검토를 위해 보관됩니다.'}</Text></View>
                {error ? <Notice error>{error}</Notice> : null}
                <View style={styles.actions}>
                  <Button title="취소" onPress={onClose} disabled={busy} variant="secondary" style={{ flex: 1, minHeight: 46 }} />
                  <Button title={busy ? '접수 중…' : '신고 접수'} onPress={() => void submit()} disabled={busy || !reason || (reason === 'other' && !details.trim())} style={{ flex: 2, minHeight: 46 }} />
                </View>
              </>}
            </FormScrollView>
          </QuietSurface.Provider>
        </View>
      </View>
    </SafeAreaView>
  </Modal>
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 6, borderWidth: 1, borderColor: p.line, backgroundColor: p.paper },
  triggerText: { fontSize: 14, color: p.ink, fontWeight: '600' },
  compact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, padding: 5 },
  compactText: { fontSize: 11.5, color: p.muted },
  backdrop: { flex: 1, backgroundColor: '#161F1B80' }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 460, maxHeight: '94%', backgroundColor: p.paper, borderRadius: 18, borderWidth: 1, borderColor: p.line, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8 },
  heading: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, alignItems: 'center' },
  headingIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: p.coralSoft },
  title: { flexShrink: 1, color: p.ink, fontWeight: '600', fontSize: 22, letterSpacing: -0.8 },
  close: { width: 44, height: 44, borderRadius: 6, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 22, gap: 18 },
  field: { gap: 8 }, label: { color: p.ink, fontWeight: '500', fontSize: 14 }, optional: { color: p.muted, fontSize: 12, fontWeight: '400' },
  target: { gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: p.line, backgroundColor: p.bg },
  targetLabel: { color: p.muted, fontSize: 12 }, targetText: { color: p.ink, fontSize: 14.4, lineHeight: 23, fontWeight: '600' },
  photo: { width: '100%', height: 230, borderRadius: 8, borderWidth: 1, borderColor: p.line, backgroundColor: p.bg },
  reason: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, paddingHorizontal: 4, borderRadius: 6 },
  reasonText: { flex: 1, color: p.ink, fontSize: 15 },
  details: { minHeight: 110 }, counter: { color: p.muted, fontSize: 12, textAlign: 'right' },
  disclosure: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 14, borderRadius: 10, backgroundColor: p.oliveSoft },
  disclosureText: { flex: 1, fontSize: 12.5, lineHeight: 21, color: p.muted },
  actions: { flexDirection: 'row', gap: 10 },
  success: { alignItems: 'center', gap: 16, paddingTop: 16 }, successText: { color: p.ink, fontSize: 15, lineHeight: 26, textAlign: 'center' }, fullButton: { alignSelf: 'stretch', minHeight: 46 },
})
