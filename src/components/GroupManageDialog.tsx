import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Ban, ChevronDown, Save, ShieldCheck, ShieldOff, Trash2, UserMinus } from 'lucide-react-native'
import { Dialog } from './Dialog'
import { Text } from './Typography'
import { Avatar, Button, Field, Notice, p } from './ui'
import { deleteGroup, listGroupBans, listGroupMembers, removeGroupMember, setGroupAdmin, unbanGroupMember, updateGroupInfo } from '../services/groupService'
import { GROUP_ROLE_LABELS, getGroupInputError, type GroupBan, type GroupMember, type GroupRole, type PinGroup } from '../types/group'

const errorText = (e: unknown) => e instanceof Error ? e.message : '처리하지 못했습니다. 다시 시도해 주세요.'

// Owner and co-admins: edit the group, manage members; the owner alone appoints admins and deletes the group.
type Props = { visible: boolean; group: PinGroup; viewerUid: string; onClose: () => void; onDeleted: () => void }

// Mounted per opening so the form starts from the group's current details.
export function GroupManageDialog(props: Props) {
  return props.visible ? <ManageBody {...props} /> : null
}

function ManageBody({ visible, group, viewerUid, onClose, onDeleted }: Props) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [bans, setBans] = useState<GroupBan[]>([])
  // One member row is open at a time; removing and banning ask for a second tap before acting.
  const [open, setOpen] = useState<{ uid: string; confirm: 'remove' | 'ban' | null } | null>(null)
  const [viewerRole, setViewerRole] = useState<GroupRole>('member')
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const lock = useRef(false)

  const loadPeople = useCallback(() => Promise.all([listGroupMembers(group.id), listGroupBans(group.id)]), [group.id])

  // Called inside run(), which reports any error.
  const reload = useCallback(async () => {
    setLoadingMembers(true)
    try { const [result, banned] = await loadPeople(); setMembers(result.members); setViewerRole(result.viewerRole); setBans(banned) }
    finally { setLoadingMembers(false) }
  }, [loadPeople])

  useEffect(() => {
    let active = true
    loadPeople().then(
      ([result, banned]) => { if (active) { setMembers(result.members); setViewerRole(result.viewerRole); setBans(banned); setLoadingMembers(false) } },
      e => { if (active) { setError(errorText(e)); setLoadingMembers(false) } },
    )
    return () => { active = false }
  }, [loadPeople])

  async function run(task: () => Promise<void>, done?: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try { await task(); if (done) setMessage(done) }
    catch (e) { setError(errorText(e)) }
    finally { lock.current = false; setBusy(false) }
  }

  const infoChanged = name.trim() !== group.name || description.trim() !== group.description
  const infoError = infoChanged ? getGroupInputError({ name, description }) : ''

  const canAct = (member: GroupMember) => member.uid !== viewerUid && member.role !== 'owner' && (viewerRole === 'owner' || member.role === 'member')

  // Inline under the row rather than an Alert: Android shows at most three Alert buttons, and web shows none.
  function memberPanel(member: GroupMember) {
    if (open?.confirm) {
      const ban = open.confirm === 'ban'
      return <View style={styles.panel}>
        <Text style={styles.help}>{ban
          ? `${member.nickname}님을 내보내고 차단할까요? 그룹과 그룹 채팅방에서 나가고, 초대코드가 있어도 다시 가입할 수 없어요. 차단은 아래 차단 목록에서 언제든 풀 수 있어요.`
          : `${member.nickname}님을 내보낼까요? 그룹과 그룹 채팅방에서 나가게 돼요. 남긴 핀은 작성자에게 그대로 남아요.`}</Text>
        <View style={styles.row}>
          <Button title="취소" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => setOpen({ uid: member.uid, confirm: null })} />
          <Button title={ban ? '내보내고 차단' : '내보내기'} variant="danger" style={{ flex: 1 }} loading={busy}
            onPress={() => void run(async () => { await removeGroupMember(group.id, member.uid, ban); setOpen(null); await reload() },
              ban ? `${member.nickname}님을 내보내고 차단했어요.` : `${member.nickname}님을 내보냈어요.`)} />
        </View>
      </View>
    }
    const admin = member.role === 'admin'
    return <View style={styles.panel}>
      {viewerRole === 'owner' ? <PanelAction icon={admin ? <ShieldOff size={18} color={p.ink} /> : <ShieldCheck size={18} color={p.ink} />}
        label={admin ? '관리자 해제' : '관리자로 지정'} disabled={busy}
        onPress={() => void run(async () => { await setGroupAdmin(group.id, member.uid, !admin); setOpen(null); await reload() },
          admin ? `${member.nickname}님을 관리자에서 해제했어요.` : `${member.nickname}님을 관리자로 지정했어요.`)} /> : null}
      <PanelAction icon={<UserMinus size={18} color={p.ink} />} label="그룹에서 내보내기" disabled={busy} onPress={() => setOpen({ uid: member.uid, confirm: 'remove' })} />
      <PanelAction icon={<Ban size={18} color={p.danger} />} label="내보내고 차단하기" hint="다시 가입할 수 없어요" danger disabled={busy} onPress={() => setOpen({ uid: member.uid, confirm: 'ban' })} />
    </View>
  }

  return <Dialog visible={visible} title="그룹 관리" onClose={onClose} busy={busy}>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>그룹 정보</Text>
      <Field label="그룹 이름" value={name} onChangeText={setName} editable={!busy} maxLength={40} />
      <Field label="그룹 소개" value={description} onChangeText={setDescription} editable={!busy} maxLength={240} multiline />
      {!!infoError && <Text style={styles.fieldError}>{infoError}</Text>}
      <Button title="변경 내용 저장" icon={<Save size={16} color={p.paper} />} disabled={busy || !infoChanged || !!infoError}
        onPress={() => void run(() => updateGroupInfo(group.id, { name, description }), '그룹 정보를 저장했어요.')} />
    </View>

    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>멤버 {members.length || group.memberCount}명</Text>
      <Text style={styles.help}>{viewerRole === 'owner' ? '멤버를 눌러 관리자로 지정하거나, 내보내거나 차단할 수 있어요. 관리자는 그룹 정보 수정과 멤버 내보내기·차단을 할 수 있어요.' : '멤버를 눌러 그룹에서 내보내거나 차단할 수 있어요.'}</Text>
      {loadingMembers && !members.length ? <ActivityIndicator color={p.primary} style={{ paddingVertical: 16 }} /> : null}
      <View>{members.map(member => {
        const actionable = canAct(member)
        const expanded = actionable && open?.uid === member.uid
        return <View key={member.uid}>
          <Pressable accessibilityRole={actionable ? 'button' : undefined} accessibilityState={actionable ? { expanded } : undefined}
            accessibilityLabel={`${member.nickname}, ${GROUP_ROLE_LABELS[member.role]}${actionable ? ', 관리 메뉴' : ''}`}
            disabled={!actionable || busy} onPress={() => setOpen(expanded ? null : { uid: member.uid, confirm: null })}
            style={({ pressed }) => [styles.member, (pressed || expanded) && { backgroundColor: p.surface }]}>
            <Avatar uri={member.photoURL} name={member.nickname} size={40} />
            <Text numberOfLines={1} style={styles.memberName}>{member.nickname}{member.uid === viewerUid ? ' (나)' : ''}</Text>
            {member.role !== 'member' ? <Text style={[styles.role, member.role === 'owner' && styles.ownerRole]}>{GROUP_ROLE_LABELS[member.role]}</Text> : null}
            {actionable ? <ChevronDown size={18} color={p.muted} style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined} /> : null}
          </Pressable>
          {expanded ? memberPanel(member) : null}
        </View>
      })}</View>
    </View>

    {bans.length ? <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>차단한 사용자 {bans.length}명</Text>
      <Text style={styles.help}>차단한 사용자는 초대코드가 있어도 다시 가입할 수 없어요. 차단을 풀면 다시 가입할 수 있어요.</Text>
      <View>{bans.map(ban => <View key={ban.uid} style={styles.member}>
        <Avatar uri={ban.photoURL} name={ban.nickname} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.memberName}>{ban.nickname}</Text>
          {ban.bannedAt ? <Text style={styles.small}>{formatBanDate(ban.bannedAt)} 차단</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${ban.nickname} 차단 해제`} disabled={busy} hitSlop={6}
          onPress={() => void run(async () => { await unbanGroupMember(group.id, ban.uid); await reload() }, `${ban.nickname}님의 차단을 풀었어요.`)}
          style={({ pressed }) => [styles.unban, pressed && { backgroundColor: p.surface }, busy && { opacity: 0.5 }]}>
          <Text style={styles.unbanText}>차단 해제</Text>
        </Pressable>
      </View>)}</View>
    </View> : null}

    {viewerRole === 'owner' ? <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color: p.danger }]}>그룹 삭제</Text>
      {!deleting ? <>
        <Text style={styles.help}>그룹과 그룹 채팅방이 삭제돼요. 멤버들이 남긴 핀은 지워지지 않고, 비공개 그룹의 핀은 작성자만 볼 수 있게 바뀌어요.</Text>
        <Button title="그룹 삭제" variant="secondary" icon={<Trash2 size={16} color={p.ink} />} disabled={busy} onPress={() => { setDeleting(true); setConfirmName('') }} />
      </> : <>
        <Text style={styles.help}>삭제하면 되돌릴 수 없어요. 확인을 위해 그룹 이름 <Text style={{ fontWeight: '700', color: p.ink }}>{group.name}</Text>을(를) 입력해 주세요.</Text>
        <Field label="그룹 이름 확인" value={confirmName} onChangeText={setConfirmName} editable={!busy} autoCorrect={false} autoCapitalize="none" placeholder={group.name} />
        <View style={styles.row}>
          <Button title="취소" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => setDeleting(false)} />
          <Button title={busy ? '삭제 중…' : `'${group.name}' 삭제`} variant="danger" style={{ flex: 1 }} loading={busy} disabled={confirmName !== group.name}
            onPress={() => void run(async () => { await deleteGroup(group.id, confirmName); onDeleted() })} />
        </View>
      </>}
    </View> : null}

    {!!error && <Notice error>{error}</Notice>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.help}>{message}</Text>}
  </Dialog>
}

function PanelAction({ icon, label, hint, danger, disabled, onPress }: { icon: ReactNode; label: string; hint?: string; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityHint={hint} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }, disabled && { opacity: 0.5 }]}>
    {icon}
    <Text style={[styles.actionLabel, danger && { color: p.danger }]}>{label}</Text>
    {hint ? <Text style={styles.small}>{hint}</Text> : null}
  </Pressable>
}

function formatBanDate(millis: number) {
  const date = new Date(millis)
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { color: p.ink, fontSize: 16, fontWeight: '700' },
  help: { color: p.muted, fontSize: 13.5, lineHeight: 21 },
  fieldError: { color: p.danger, fontSize: 13 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10 },
  memberName: { flex: 1, minWidth: 0, color: p.ink, fontSize: 15, fontWeight: '500' },
  role: { color: p.primary, backgroundColor: p.primarySoft, fontSize: 11.5, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  ownerRole: { color: p.paper, backgroundColor: p.primary },
  row: { flexDirection: 'row', gap: 8 },
  panel: { gap: 2, paddingLeft: 56, paddingRight: 4, paddingTop: 2, paddingBottom: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  actionLabel: { flex: 1, color: p.ink, fontSize: 15, fontWeight: '500' },
  small: { color: p.muted, fontSize: 12.5 },
  unban: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' },
  unbanText: { color: p.ink, fontSize: 13, fontWeight: '600' },
})
