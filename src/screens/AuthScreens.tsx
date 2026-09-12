import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { Camera, Check, MapPin, MessageCircle } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import Svg, { Path } from 'react-native-svg'
import { updateProfile } from 'firebase/auth'
import { Avatar, Button, Field, H, Notice, Screen, Txt, p, s } from '../components/ui'
import { PhotoEditor } from '../components/PhotoEditor'
import { useAuth } from '../hooks/useAuth'
import { requireAuth } from '../lib/firebase'
import { getSignupRequirementsError, type SignupRequirements } from '../lib/signupRequirements'
import { BIO_MAX_LENGTH, NICKNAME_MAX_LENGTH, USERNAME_MAX_LENGTH, getUsernameError, normalizeUsername } from '../lib/userProfile'
import { authErrorMessage, loginWithEmail, loginWithGoogle, loginWithKakao, sendPasswordReset, signupWithEmail } from '../services/authService'
import { uploadProfilePhoto, type UploadPhoto } from '../services/storageService'
import { isUsernameAvailable, updateUserProfileDetails, upsertUserProfile, UsernameTakenError } from '../services/userService'

export async function pickProfilePhoto(): Promise<UploadPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) throw new Error('프로필 사진을 선택하려면 사진 접근을 허용해 주세요.')
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
  if (result.canceled) return null
  const asset = result.assets[0]
  if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error('프로필 사진은 5MB 이하로 선택해 주세요.')
  return { uri: asset.uri, name: asset.fileName || 'profile.jpg', mimeType: asset.mimeType || 'image/jpeg', width: asset.width, height: asset.height, size: asset.fileSize }
}

function PolicyLinks() {
  return <View style={a.policyLinks}>
    <Pressable accessibilityRole="link" onPress={() => router.push('/policies/terms')}><Text style={a.policyText}>이용약관</Text></Pressable>
    <Text style={a.policyText}>·</Text>
    <Pressable accessibilityRole="link" onPress={() => router.push('/policies/privacy')}><Text style={a.policyText}>개인정보처리방침</Text></Pressable>
    <Text style={a.policyText}>·</Text>
    <Pressable accessibilityRole="link" onPress={() => router.push('/policies')}><Text style={a.policyText}>정책 안내</Text></Pressable>
  </View>
}

function GoogleLogo() {
  return <Svg width={20} height={20} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z" />
    <Path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.82 23.82 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
  </Svg>
}

export function LandingScreen() {
  const { currentUser, loading } = useAuth()
  return <Screen>
    <View style={a.landingTop}><Image source={require('../../assets/spotit/logo.png')} style={a.logo} resizeMode="contain" /></View>
    <View style={a.hero}>
      <View style={a.mapLineOne} /><View style={a.mapLineTwo} /><View style={a.mapLineThree} />
      <View style={a.mapPark} />
      <View style={[a.memory, a.cafe]}><Image source={require('../../assets/spotit/landing/cafe.webp')} style={a.memoryImage} />
        <Text style={a.memoryCaption}>오래 머물고 싶은 오후</Text><MapPin size={22} fill={p.coral} color={p.coral} style={a.memoryPin} /></View>
      <View style={[a.memory, a.walk]}><Image source={require('../../assets/spotit/landing/walk.webp')} style={a.memoryImage} />
        <Text style={a.memoryCaption}>천천히 걸었던 길</Text><MapPin size={22} fill={p.primary} color={p.primary} style={a.memoryPin} /></View>
      <View style={[a.memory, a.sunset]}><Image source={require('../../assets/spotit/landing/sunset.webp')} style={a.memoryImage} />
        <Text style={a.memoryCaption}>오늘의 작은 발견</Text></View>
      <View style={a.heroBadge}><MapPin size={16} color={p.primary} /><Text style={a.heroBadgeText}>내 하루가 쌓이는 지도</Text></View>
    </View>
    <View style={a.landingCopy}><Text style={a.eyebrow}>MY PLACES, MY STORIES</Text><Text style={a.brandTitle}>스팟잇</Text>
      <Text style={a.landingSubtitle}>사진과 글로 남긴 오늘이,{"\n"}나만의 지도가 됩니다</Text></View>
    <Button title="시작하기  →" loading={loading} onPress={() => router.push(currentUser ? '/map' : '/login')} />
    <PolicyLinks />
  </Screen>
}

export function LoginScreen() {
  const { firebaseReady, currentUser, profile } = useAuth()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const lock = useRef(false)
  const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !/^\/(login|signup)(\/|$)/.test(from) ? from : '/map'

  async function login(provider: 'email' | 'google' | 'kakao') {
    if (lock.current) return
    if (provider === 'email' && (!email.trim() || !password)) { setError('이메일과 비밀번호를 입력해 주세요.'); return }
    lock.current = true; setBusy(provider); setError(''); setMessage('')
    try {
      const user = await (provider === 'google' ? loginWithGoogle() : provider === 'kakao' ? loginWithKakao() : loginWithEmail(email, password))
      const details = await upsertUserProfile(user)
      router.replace(details.onboardingComplete === false ? '/signup' : destination)
    } catch (err) {
      const code = String((err as { code?: string })?.code || '')
      if (!/cancel|closed|SIGN_IN_CANCELLED/i.test(code)) setError(authErrorMessage(err, '로그인하지 못했습니다.'))
    } finally { lock.current = false; setBusy('') }
  }

  async function reset() {
    if (lock.current) return
    if (!email.trim()) { setError('비밀번호 재설정 메일을 받을 이메일을 입력해 주세요.'); return }
    lock.current = true; setBusy('reset'); setError(''); setMessage('')
    try { await sendPasswordReset(email); setMessage('비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해 주세요.') }
    catch (err) { setError(authErrorMessage(err)) }
    finally { lock.current = false; setBusy('') }
  }

  if (currentUser && profile && !busy) return <Redirect href={profile.onboardingComplete === false ? '/signup' : destination} />
  return <Screen title="로그인" back>
    <Image source={require('../../assets/spotit/logo.png')} style={a.authLogo} resizeMode="contain" />
    <View style={a.heading}><Text style={a.eyebrow}>WELCOME BACK</Text><H>내 장소 기록을 이어서</H><Text style={s.muted}>기억하고 싶은 오늘을 남겨보세요.</Text></View>
    {!firebaseReady && <Notice>로그인 연결을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.</Notice>}
    <View style={a.form}>
      <Field label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="you@example.com" editable={!busy} />
      <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="6자 이상" editable={!busy} returnKeyType="go" onSubmitEditing={() => login('email')} />
      {!!error && <Notice error>{error}</Notice>}{!!message && <Notice>{message}</Notice>}
      <Button title="로그인" onPress={() => login('email')} loading={busy === 'email'} disabled={!firebaseReady || !!busy} />
      <Pressable accessibilityRole="button" disabled={!!busy || !firebaseReady} onPress={reset} style={a.textButton}><Text style={a.link}>{busy === 'reset' ? '메일 보내는 중…' : '비밀번호를 잊으셨나요?'}</Text></Pressable>
    </View>
    <View style={a.divider}><View style={a.rule} /><Text style={s.muted}>또는</Text><View style={a.rule} /></View>
    <Pressable accessibilityRole="button" disabled={!!busy || !firebaseReady} onPress={() => login('google')} style={[a.social, a.google]}>
      {busy === 'google' ? <ActivityIndicator color={p.primary} /> : <GoogleLogo />}<Text style={a.socialText}>구글로 로그인하기</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={!!busy || !firebaseReady} onPress={() => login('kakao')} style={[a.social, a.kakao]}>
      {busy === 'kakao' ? <ActivityIndicator color={p.ink} /> : <MessageCircle size={21} color="#191919" fill="#191919" />}<Text style={a.socialText}>카카오로 로그인</Text>
    </Pressable>
    <Pressable accessibilityRole="link" onPress={() => router.push('/signup')} style={a.textButton}><Txt>계정이 없다면 <Text style={a.link}>회원가입</Text></Txt></Pressable>
    <PolicyLinks />
  </Screen>
}

function ConsentRow({ label, value, onChange, policy }: { label: string; value: boolean; onChange: (value: boolean) => void; policy: string }) {
  return <View style={a.consentRow}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={a.consentLabel}>
      <View style={[a.checkbox, value && a.checkboxOn]}>{value && <Check color="white" size={16} />}</View><Text style={a.consentText}>{label}</Text>
    </Pressable>
    <Pressable accessibilityRole="link" accessibilityLabel={`${label} 보기`} onPress={() => router.push(`/policies/${policy}`)} style={a.policyView}><Text style={a.link}>보기</Text></Pressable>
  </View>
}

export function SignupScreen() {
  const { currentUser, profile, loading, firebaseReady, refreshProfile } = useAuth()
  const [step, setStep] = useState<'account' | 'profile'>('account')
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [requirements, setRequirements] = useState<SignupRequirements>({ birthDate: '', termsAccepted: false, privacyAccepted: false, locationAccepted: false })
  const [photo, setPhoto] = useState<UploadPhoto | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<UploadPhoto | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)

  useEffect(() => { if (profile?.nickname) setNickname(previous => previous || profile.nickname) }, [profile?.nickname])

  async function next() {
    if (lock.current) return
    const validation = getUsernameError(username) || getSignupRequirementsError(requirements)
      || (!currentUser && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? '올바른 이메일 주소를 입력해 주세요.' : '')
      || (!currentUser && password.length < 6 ? '비밀번호는 6자 이상으로 입력해 주세요.' : '')
    if (validation) { setError(validation); return }
    lock.current = true; setBusy(true); setError('')
    try {
      if (!await isUsernameAvailable(username, currentUser?.uid)) throw new UsernameTakenError()
      setUsername(normalizeUsername(username)); setStep('profile')
    } catch (err) { setError(authErrorMessage(err)) }
    finally { lock.current = false; setBusy(false) }
  }

  async function save() {
    if (lock.current) return
    const validation = getSignupRequirementsError(requirements) || getUsernameError(username)
    if (validation) { setError(validation); setStep('account'); return }
    if (!nickname.trim()) { setError('닉네임을 입력해 주세요.'); return }
    lock.current = true; setBusy(true); setError('')
    try {
      if (!await isUsernameAvailable(username, requireAuth().currentUser?.uid)) throw new UsernameTakenError()
      const user = requireAuth().currentUser || await signupWithEmail(email, password, requirements)
      setPassword('')
      await upsertUserProfile(user)
      const photoURL = photo ? await uploadProfilePhoto(user.uid, photo) : user.photoURL || ''
      await updateProfile(user, { displayName: nickname.trim(), photoURL })
      await updateUserProfileDetails(user.uid, { username, nickname, bio, photoURL }, requirements)
      await refreshProfile()
      router.replace('/map')
    } catch (err) {
      setError(authErrorMessage(err, '가입 정보를 저장하지 못했습니다.'))
      if (err instanceof UsernameTakenError || !requireAuth().currentUser) setStep('account')
    } finally { lock.current = false; setBusy(false) }
  }

  async function choosePhoto() {
    try { const result = await pickProfilePhoto(); if (result) setEditingPhoto(result) }
    catch (err) { setError(authErrorMessage(err)) }
  }

  if (loading && !busy) return <Screen title="회원가입"><ActivityIndicator color={p.primary} /></Screen>
  if (currentUser && profile?.username && profile.onboardingComplete !== false && !busy) return <Redirect href="/map" />

  return <Screen title="회원가입" back>
    <View style={a.progress}>
      <View style={a.progressStep}><View style={[a.stepCircle, a.stepActive]}>{step === 'profile' ? <Check color="white" size={15} /> : <Text style={a.stepNumber}>1</Text>}</View><Text style={a.stepLabel}>계정 만들기</Text></View>
      <View style={a.progressLine} /><View style={a.progressStep}><View style={[a.stepCircle, step === 'profile' && a.stepActive]}><Text style={[a.stepNumber, step !== 'profile' && { color: p.muted }]}>2</Text></View><Text style={a.stepLabel}>프로필 꾸미기</Text></View>
    </View>
    <View style={a.heading}><Text style={a.eyebrow}>{step === 'account' ? 'CREATE ACCOUNT' : 'MAKE IT YOURS'}</Text>
      <H>{step === 'account' ? '나만의 이름으로 시작해요' : '프로필을 꾸며보세요'}</H>
      <Text style={s.muted}>{step === 'account' ? '스팟잇에서 나를 찾을 수 있는 고유한 이름이에요.' : '사진과 짧은 소개로 나를 표현해 보세요.'}</Text></View>
    {!firebaseReady && <Notice>로그인 연결을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.</Notice>}
    {step === 'account' ? <View style={a.form}>
      <Field label="사용자 이름" value={username} onChangeText={value => setUsername(value.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={USERNAME_MAX_LENGTH} placeholder="my.spotit" editable={!busy} />
      <Text style={s.muted}>영어, 숫자, 밑줄(_), 점(.) · 최대 30자</Text>
      {!currentUser && <>
        <Field label="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="you@example.com" editable={!busy} />
        <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="6자 이상" editable={!busy} />
      </>}
      <Field label="생년월일" value={requirements.birthDate} onChangeText={value => { const digits = value.replace(/\D/g, '').slice(0, 8); setRequirements({ ...requirements, birthDate: [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-') }) }} placeholder="YYYY-MM-DD" keyboardType="number-pad" maxLength={10} editable={!busy} />
      <Text style={s.muted}>만 14세 이상부터 가입할 수 있어요. 생년월일은 공개되지 않습니다.</Text>
      <View style={a.consents}>
        <ConsentRow label="[필수] 이용약관 동의" value={requirements.termsAccepted} onChange={value => setRequirements({ ...requirements, termsAccepted: value })} policy="terms" />
        <ConsentRow label="[필수] 개인정보 수집·이용 동의" value={requirements.privacyAccepted} onChange={value => setRequirements({ ...requirements, privacyAccepted: value })} policy="privacy" />
        <ConsentRow label="[선택] 위치기반서비스 이용 동의" value={requirements.locationAccepted} onChange={value => setRequirements({ ...requirements, locationAccepted: value })} policy="location" />
      </View>
      {!!error && <Notice error>{error}</Notice>}
      <Button title="다음  →" loading={busy} disabled={!firebaseReady} onPress={next} />
    </View> : <View style={a.form}>
      <Pressable style={a.photoPicker} accessibilityRole="button" accessibilityLabel="프로필 사진 선택 및 자르기" onPress={choosePhoto} disabled={busy}>
        <Avatar uri={photo?.uri || profile?.photoURL || currentUser?.photoURL || undefined} name={nickname} size={100} /><View style={a.camera}><Camera size={19} color="white" /></View>
      </Pressable>
      <Text style={a.photoHint}>프로필 사진 선택 · 자르기</Text>
      {(photo || currentUser?.photoURL) && <Button title="사진 편집" variant="secondary" onPress={() => setEditingPhoto(photo || { uri: currentUser!.photoURL! })} disabled={busy} />}
      {photo && <Button title="선택한 사진 제거" variant="secondary" onPress={() => setPhoto(null)} disabled={busy} />}
      <Field label="닉네임" value={nickname} onChangeText={setNickname} maxLength={NICKNAME_MAX_LENGTH} placeholder="어떤 이름으로 불러드릴까요?" editable={!busy} />
      <Field label="소개글" value={bio} onChangeText={setBio} multiline maxLength={BIO_MAX_LENGTH} placeholder="나를 소개하는 한마디" editable={!busy} />
      <Text style={s.muted}>{bio.length} / {BIO_MAX_LENGTH}</Text>
      {!!error && <Notice error>{error}</Notice>}
      <Button title="스팟잇 시작하기" loading={busy} onPress={save} />
      <Button title="이전 단계" variant="secondary" disabled={busy} onPress={() => { setError(''); setStep('account') }} />
    </View>}
    {!currentUser && <Pressable style={a.textButton} accessibilityRole="link" onPress={() => router.replace('/login')}><Txt>이미 계정이 있다면 <Text style={a.link}>로그인</Text></Txt></Pressable>}
    <PolicyLinks />
    <PhotoEditor photo={editingPhoto} square onClose={() => setEditingPhoto(null)} onSave={value => { setPhoto(value); setEditingPhoto(null) }} />
  </Screen>
}

const a = StyleSheet.create({
  logo: { width: 126, height: 44 }, landingTop: { paddingTop: 10, alignItems: 'center' }, authLogo: { width: 130, height: 48, marginVertical: 10 },
  hero: { height: 314, borderRadius: 28, backgroundColor: '#E8ECE3', overflow: 'hidden', marginTop: 10, position: 'relative' },
  mapLineOne: { position: 'absolute', width: 500, height: 25, backgroundColor: '#FAF9F1', transform: [{ rotate: '-25deg' }], top: 128, left: -45 },
  mapLineTwo: { position: 'absolute', width: 450, height: 18, backgroundColor: '#FAF9F1', transform: [{ rotate: '65deg' }], top: 160, left: -75 },
  mapLineThree: { position: 'absolute', width: 460, height: 16, backgroundColor: '#FAF9F1', transform: [{ rotate: '17deg' }], top: 220, left: -20 },
  mapPark: { position: 'absolute', width: 150, height: 200, backgroundColor: '#D7E3D1', borderRadius: 60, right: -20, top: 16, transform: [{ rotate: '25deg' }] },
  memory: { position: 'absolute', width: 127, padding: 6, paddingBottom: 9, borderRadius: 10, backgroundColor: p.paper, shadowColor: p.ink, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  memoryImage: { width: '100%', height: 93, borderRadius: 6 }, memoryCaption: { fontSize: 10, color: p.ink, textAlign: 'center', paddingTop: 7 }, memoryPin: { position: 'absolute', bottom: -20, alignSelf: 'center' },
  cafe: { top: 34, left: 19, transform: [{ rotate: '-8deg' }] }, walk: { top: 40, right: 17, transform: [{ rotate: '7deg' }] }, sunset: { top: 168, left: '33%', transform: [{ rotate: '-4deg' }] },
  heroBadge: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, left: 10, bottom: 15, backgroundColor: '#FFFEFAED', borderRadius: 15 }, heroBadgeText: { fontSize: 10, color: p.primary },
  landingCopy: { alignItems: 'center', gap: 8, marginTop: 11, marginBottom: 10 }, brandTitle: { fontSize: 44, fontWeight: '800', letterSpacing: -2, color: p.primary },
  landingSubtitle: { fontSize: 18, lineHeight: 29, color: p.ink, textAlign: 'center' }, eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 2.2, color: p.primary },
  heading: { gap: 10, marginBottom: 12 }, form: { gap: 15 }, textButton: { alignItems: 'center', paddingVertical: 10 }, link: { color: p.primary, fontSize: 13, fontWeight: '600' },
  policyLinks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }, policyText: { fontSize: 10, color: p.muted },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 13 }, rule: { flex: 1, height: 1, backgroundColor: p.line },
  social: { minHeight: 52, borderRadius: 14, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' }, google: { backgroundColor: p.paper, borderWidth: 1, borderColor: p.line }, kakao: { backgroundColor: '#FEE500' }, socialText: { color: '#191919', fontSize: 15, fontWeight: '600' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 }, progressStep: { flexDirection: 'row', alignItems: 'center', gap: 7 }, stepCircle: { width: 25, height: 25, borderRadius: 13, backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center' }, stepActive: { backgroundColor: p.primary }, stepNumber: { color: 'white', fontSize: 12, fontWeight: '700' }, stepLabel: { color: p.ink, fontSize: 12, fontWeight: '600' }, progressLine: { flex: 1, height: 1, backgroundColor: p.line },
  consents: { padding: 12, borderRadius: 15, backgroundColor: p.paper, gap: 3 }, consentRow: { flexDirection: 'row', alignItems: 'center' }, consentLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 }, consentText: { flex: 1, fontSize: 12, color: p.ink, lineHeight: 18 }, checkbox: { width: 21, height: 21, borderRadius: 5, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' }, checkboxOn: { borderColor: p.primary, backgroundColor: p.primary }, policyView: { padding: 8 },
  photoPicker: { alignSelf: 'center', marginVertical: 10 }, camera: { position: 'absolute', right: -2, bottom: 0, backgroundColor: p.primary, borderRadius: 19, padding: 9, borderColor: p.bg, borderWidth: 3 }, photoHint: { color: p.muted, fontSize: 12, textAlign: 'center' },
})
