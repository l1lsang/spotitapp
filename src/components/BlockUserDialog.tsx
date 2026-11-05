import { useState } from 'react'
import { View } from 'react-native'
import { Ban } from 'lucide-react-native'
import { Text } from './Typography'
import { Dialog } from './Dialog'
import { Button, Notice, p } from './ui'
import { useAuth } from '../hooks/useAuth'
import { blockUser, type BlockTarget } from '../services/blockService'

export const blockNotice = (name: string) => [
  `${name}님의 기록, 댓글, 메시지가 내 화면에서 바로 사라지고 서로의 팔로우가 해제돼요.`,
  '차단 사실은 운영팀에 전달되어 계정을 검토해요. 상대에게는 알리지 않아요.',
  '프로필 설정 > 차단한 사용자에서 언제든 해제할 수 있어요.',
]

export function BlockUserDialog({ target, onClose, onBlocked }: { target: BlockTarget; onClose: () => void; onBlocked?: () => void }) {
  const { currentUser } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = target.nickname || '피노리 사용자'
  async function confirm() {
    if (!currentUser || busy) return
    setBusy(true); setError('')
    try { await blockUser(currentUser.uid, target); onClose(); onBlocked?.() }
    catch (e) { setError(e instanceof Error ? e.message : '차단하지 못했습니다. 다시 시도해 주세요.'); setBusy(false) }
  }
  return <Dialog visible title={`${name}님을 차단할까요?`} busy={busy} onClose={onClose}>
    <View style={{ gap: 8 }}>{blockNotice(name).map(line => <Text key={line} style={{ color: p.muted, fontSize: 15, lineHeight: 24 }}>{line}</Text>)}</View>
    {error ? <Notice error>{error}</Notice> : null}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button title="취소" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={onClose} />
      <Button title={busy ? '차단 중…' : '차단하기'} variant="danger" style={{ flex: 1 }} icon={<Ban size={17} color={p.paper} />} loading={busy} disabled={busy || !currentUser} onPress={() => void confirm()} />
    </View>
  </Dialog>
}
