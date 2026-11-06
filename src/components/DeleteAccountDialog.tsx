import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { Trash2 } from 'lucide-react-native'
import type { User } from 'firebase/auth'
import { Text } from './Typography'
import { Dialog } from './Dialog'
import { Button, Field, Notice, p, s } from './ui'
import { useAuth } from '../hooks/useAuth'
import { authErrorMessage, deleteMyAccount, isRecentlyAuthenticated, sendPasswordReset } from '../services/authService'

type Method = 'password' | 'apple' | 'google' | 'kakao' | 'none'

function signInMethod(user: User): Method {
  const providers = user.providerData.map(item => item.providerId)
  if (providers.includes('apple.com')) return 'apple'
  if (providers.includes('password') && user.email) return 'password'
  if (providers.includes('google.com')) return 'google'
  if (providers.some(id => id.startsWith('oidc.'))) return 'kakao'
  return 'none'
}

const confirmLabels: Record<Exclude<Method, 'none'>, string> = {
  password: '비밀번호 확인하고 탈퇴',
  apple: 'Apple로 확인하고 탈퇴',
  google: 'Google로 확인하고 탈퇴',
  kakao: '카카오로 확인하고 탈퇴',
}

/**
 * Account deletion in one dialog. Identity is confirmed only when Firebase needs it,
 * so a member who signed in a few minutes ago deletes with a single tap.
 * `incomplete` is for a member who signed in but never finished signup.
 */
export function DeleteAccountDialog(props: { visible: boolean; onClose: () => void; incomplete?: boolean }) {
  // Mounted only while open, so every visit starts with an empty form.
  return props.visible ? <DeleteAccountBody {...props} /> : null
}

function DeleteAccountBody({ onClose, incomplete = false }: { onClose: () => void; incomplete?: boolean }) {
  const { currentUser } = useAuth()
  const [recent, setRecent] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'' | 'delete' | 'reset'>('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const method = currentUser ? signInMethod(currentUser) : 'none'

  useEffect(() => {
    if (!currentUser) return
    let active = true
    void isRecentlyAuthenticated(currentUser).then(value => { if (active) setRecent(value) })
    return () => { active = false }
  }, [currentUser])

  // Apple always confirms (one Face ID tap) so the app's Apple access can be revoked.
  const needsConfirmation = method === 'apple' || recent === false
  const needsPassword = method === 'password' && recent === false
  const title = needsConfirmation && method !== 'none' ? confirmLabels[method] : incomplete ? '가입 취소하기' : '탈퇴하기'

  async function remove() {
    if (!currentUser || lock.current) return
    if (needsPassword && !password) { setError('현재 비밀번호를 입력해 주세요.'); return }
    lock.current = true; setBusy('delete'); setError(''); setMessage('')
    try {
      await deleteMyAccount(currentUser, { password, incomplete })
      setPassword('')
      onClose()
      router.replace('/login')
      Alert.alert(incomplete ? '가입을 취소했어요' : '탈퇴가 완료되었어요', incomplete ? '입력한 정보는 저장되지 않았어요.' : '그동안 피노리를 이용해 주셔서 감사합니다.')
    } catch (err) {
      const code = String((err as { code?: string })?.code || '')
      if (/cancel|closed|SIGN_IN_CANCELLED/i.test(code)) return
      const provider = method === 'password' ? 'email' : method === 'none' ? undefined : method
      setError(authErrorMessage(err, '탈퇴하지 못했습니다. 잠시 후 다시 시도해 주세요.', provider))
    } finally { lock.current = false; setBusy('') }
  }

  async function resetPassword() {
    if (!currentUser?.email || lock.current) return
    lock.current = true; setBusy('reset'); setError(''); setMessage('')
    try { await sendPasswordReset(currentUser.email); setMessage(`${currentUser.email}로 비밀번호 재설정 메일을 보냈어요. 새 비밀번호로 바꾼 뒤 다시 탈퇴해 주세요.`) }
    catch (err) { setError(authErrorMessage(err)) }
    finally { lock.current = false; setBusy('') }
  }

  if (!currentUser) return null
  return <Dialog visible title={incomplete ? '가입을 취소할까요?' : '정말 탈퇴할까요?'} busy={busy === 'delete'} onClose={onClose}>
    {incomplete
      ? <Text style={d.copy}>지금까지 입력한 정보와 로그인 연결이 삭제돼요. 언제든 다시 가입할 수 있어요.</Text>
      : <View style={{ gap: 8 }}>
        <Text style={d.copy}>탈퇴하면 바로 아래 정보가 삭제되며 복구할 수 없어요.</Text>
        <View style={d.list}>{['프로필과 사용자 이름', '내가 남긴 핀·사진·댓글·좋아요', '팔로우 관계와 알림'].map(item => <Text key={item} style={d.item}>· {item}</Text>)}</View>
        <Text style={d.copy}>채팅방의 내 메시지는 ‘탈퇴한 사용자’로 익명 처리돼요.</Text>
      </View>}
    {needsPassword && <View style={{ gap: 6 }}>
      <Field label="현재 비밀번호" value={password} onChangeText={value => { setPassword(value); setError('') }} secureTextEntry autoFocus
        autoComplete="current-password" returnKeyType="done" onSubmitEditing={() => void remove()} editable={!busy} />
      <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void resetPassword()} style={d.link}>
        <Text style={d.linkText}>{busy === 'reset' ? '메일 보내는 중…' : '비밀번호가 기억나지 않나요? 재설정 메일 받기'}</Text>
      </Pressable>
    </View>}
    {needsConfirmation && method !== 'password' && method !== 'none' && <Text style={d.hint}>본인 확인 창이 한 번 열려요. 확인하면 바로 탈퇴가 진행돼요.</Text>}
    {!!message && <Notice>{message}</Notice>}
    {!!error && <Notice error>{error}</Notice>}
    <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
      <Button title="취소" variant="secondary" style={{ flex: 1 }} disabled={!!busy} onPress={onClose} />
      <Button title={busy === 'delete' ? '처리 중' : title} variant="danger" style={{ flex: 1.6 }} icon={<Trash2 size={17} color={p.paper} />}
        loading={busy === 'delete'} disabled={!!busy || recent === null} onPress={() => void remove()} />
    </View>
  </Dialog>
}

const d = StyleSheet.create({
  copy: { color: p.muted, fontSize: 15, lineHeight: 24 },
  list: { gap: 2, paddingLeft: 4 },
  item: { color: p.ink, fontSize: 15, lineHeight: 24 },
  hint: { color: p.muted, fontSize: 13, lineHeight: 20 },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { color: p.muted, fontSize: 13, textDecorationLine: 'underline' },
})
