import { useState } from 'react'
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CheckCircle2, Flag, ShieldCheck, X } from 'lucide-react-native'
import { Button, Chip, Field, Notice, p } from './ui'
import { submitReport } from '../services/moderationService'
import { REPORT_REASONS, type ReportTarget } from '../types/moderation'

export function ReportButton({ target, compact = false, label = '신고' }: { target: ReportTarget; compact?: boolean; label?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${target.label} ${label}`} onPress={() => setOpen(true)} style={[styles.trigger, compact && styles.compact]}>
      <Flag size={compact ? 14 : 17} color={p.muted} />
      <Text style={styles.triggerText}>{label}</Text>
    </Pressable>
    {open && <ReportDialog target={target} onClose={() => setOpen(false)} />}
  </>
}

export function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
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
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose() }}>
    <SafeAreaView style={styles.modal}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.heading}><Flag size={23} color={p.primary} /><View><Text style={styles.eyebrow}>안전한 스팟잇</Text><Text style={styles.title}>{target.kind === 'photo' ? '사진' : target.kind === 'pin' ? '핀' : target.kind === 'user' ? '유저' : '채팅'} 신고</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel="신고 창 닫기" disabled={busy} onPress={onClose} style={styles.close}><X size={23} color={p.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {success ? <View style={styles.success}><CheckCircle2 size={48} color={p.primary} /><Notice>{success}</Notice><Button title="확인" onPress={onClose} /></View> : <>
            <View style={styles.target}><Text style={styles.eyebrow}>신고 대상</Text><Text style={styles.label}>{target.label}</Text></View>
            {target.kind === 'photo' && <Image source={{ uri: target.photoUrl }} accessibilityLabel="신고할 사진" style={styles.photo} resizeMode="contain" />}
            <Text style={styles.label}>신고 사유</Text>
            <View style={styles.reasons}>{reasons.map(item => <Chip key={item.id} label={item.label} selected={reason === item.id} onPress={() => { if (!busy) setReason(item.id) }} />)}</View>
            <Field label={`상세 내용${reason !== 'other' ? ' (선택)' : ' (필수)'}`} value={details} onChangeText={setDetails} editable={!busy} multiline maxLength={2000} placeholder="어떤 문제가 있었는지 알려 주세요." style={styles.details} textAlignVertical="top" />
            <Text style={styles.counter}>{details.length.toLocaleString()} / 2,000자</Text>
            <View style={styles.disclosure}><ShieldCheck size={20} color={p.primary} /><Text style={styles.disclosureText}>신고자 정보는 상대에게 공개되지 않습니다.{target.kind === 'photo' ? ' 선택한 사진의 주소, 작성자와 연결된 콘텐츠 정보가 검토를 위해 기록됩니다.' : target.kind === 'chat' ? target.messageId ? ' 선택한 메시지와 첨부 사진이 검토를 위해 전달됩니다.' : ' 최근 메시지 최대 20개와 첨부 사진이 검토를 위해 전달됩니다.' : ' 신고 당시 콘텐츠가 검토를 위해 보관됩니다.'}</Text></View>
            {error ? <Notice error>{error}</Notice> : null}
            <Button title="신고 접수" onPress={() => void submit()} loading={busy} disabled={!reason || (reason === 'other' && !details.trim())} />
            <Button title="취소" onPress={onClose} disabled={busy} variant="secondary" />
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, modal: { flex: 1, backgroundColor: p.bg },
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: p.line, backgroundColor: p.paper },
  compact: { paddingHorizontal: 8, paddingVertical: 7, borderWidth: 0, backgroundColor: 'transparent' }, triggerText: { fontSize: 13, color: p.muted, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderColor: p.line },
  heading: { flexDirection: 'row', gap: 12, alignItems: 'center' }, close: { padding: 10 }, eyebrow: { color: p.muted, fontSize: 12, marginBottom: 4 }, title: { color: p.ink, fontWeight: '800', fontSize: 23 },
  content: { padding: 22, gap: 14, paddingBottom: 40 }, label: { color: p.ink, fontWeight: '700', fontSize: 15 }, target: { backgroundColor: p.surface, padding: 16, borderRadius: 16 },
  photo: { width: '100%', height: 230, borderRadius: 15, backgroundColor: p.surface }, reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, details: { minHeight: 130 }, counter: { color: p.muted, fontSize: 12, textAlign: 'right', marginTop: -7 },
  disclosure: { backgroundColor: p.primarySoft, borderRadius: 16, padding: 16, gap: 10, flexDirection: 'row' }, disclosureText: { flex: 1, fontSize: 13, lineHeight: 21, color: p.muted }, success: { paddingVertical: 55, gap: 24 },
})
