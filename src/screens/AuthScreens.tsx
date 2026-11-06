import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { FormScrollView } from '../components/keyboard'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, ArrowRight, AtSign, MapPin, Camera, Check, Crop, KeyRound, Mail, UserRound, X } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import Svg, { Path } from 'react-native-svg'
import { updateProfile } from 'firebase/auth'
import { Button, Field, Notice, Screen, p, s } from '../components/ui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { BrandLogo } from '../components/BrandLogo'
import { AppleLoginButton } from '../components/AppleLoginButton'
import { policyNavigation } from '../lib/policyNavigation'
import { PhotoEditor } from '../components/PhotoEditor'
import { useAuth } from '../hooks/useAuth'
import { requireAuth } from '../lib/firebase'
import { getBirthDateError, getSignupRequirementsError, type SignupRequirements } from '../lib/signupRequirements'
import { BIO_MAX_LENGTH, NICKNAME_MAX_LENGTH, USERNAME_MAX_LENGTH, getUsernameError, normalizeUsername } from '../lib/userProfile'
import { authErrorMessage, loginWithApple, loginWithEmail, loginWithGoogle, loginWithKakao, logout, sendPasswordReset, signupWithEmail, type LoginProvider } from '../services/authService'
import { DeleteAccountDialog } from '../components/DeleteAccountDialog'
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

// Shown with a login error only. The web build keeps the browser guidance; the app uses its native sign-in sheet.
const googleNotice = Platform.OS === 'web'
  ? ['구글 로그인은 Chrome, Safari, Edge, Firefox 등 지원되는 일반 브라우저에서 이용할 수 있어요.', '카카오톡·인스타그램 등의 앱 내 브라우저에서는 로그인이 제한될 수 있으니 외부 브라우저로 열어주세요.']
  : ['구글 로그인은 이 기기에 표시되는 Google 계정 선택 화면에서 이용할 수 있어요.', '로그인 창이 닫히거나 계속 실패하면 네트워크 연결과 기기의 Google 계정 상태를 확인한 뒤 다시 시도해 주세요.']

// Policy links under auth forms; the logo credit appears on signup only.
function PolicyLinks({ credit = false }: { credit?: boolean }) {
  return <View style={a.policyFooter}>
    <View style={a.policyLinks}>{[...policyNavigation, { id: 'licenses', title: '오픈소스 라이선스' }].map(item => <Pressable key={item.id} accessibilityRole="link" style={a.policyLink} onPress={() => router.push(item.id === 'licenses' ? '/licenses' : '/policies/' + item.id)}><Text style={[a.policyText, item.id === 'privacy' && { fontWeight: '700', color: p.ink }]}>{item.title}</Text></Pressable>)}</View>
    {credit && <View style={a.credit}><Text style={a.policyText}>로고 제작: </Text><Pressable accessibilityRole="link" accessibilityLabel="로고리즘" style={a.policyLink} onPress={() => void Linking.openURL('https://smartstore.naver.com/logoism99/products/7337632372')}><Text style={[a.policyText, { textDecorationLine: 'underline' }]}>로고리즘</Text></Pressable></View>}
  </View>
}
function AuthFrame({ children }: React.PropsWithChildren) {
  const { width, height } = useWindowDimensions()
  const wide = width > 960
  const mobile = width <= 640
  const visualHeight = Math.max(600, height - 64)
  return <SafeAreaView style={s.page}><FormScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingVertical: mobile ? 24 : 32, paddingHorizontal: wide ? 32 : mobile ? 16 : 24, flexDirection: wide ? 'row' : 'column', gap: wide ? Math.min(80, Math.max(32, width * 0.05)) : 0, alignItems: wide ? 'flex-start' : 'center' }}>
    {wide && <View style={{ flex: 1, minWidth: 0, height: visualHeight, overflow: 'hidden', backgroundColor: p.primary }}><Image source={require('../../assets/spotit/landing/walk.webp')} accessibilityLabel="햇살 아래 초록빛 성북천 산책길" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" /><LinearGradient colors={[p.transparent, p.scrim]} style={a.visualCopy}><View style={[s.row, { gap: 8 }]}><MapPin size={15} color={p.paper} /><Text style={{ color: p.paper, fontSize: 12 }}>성북천, 서울</Text></View><Text style={[a.visualTitle, { fontSize: Math.min(48, Math.max(32, width * 0.032)), lineHeight: Math.min(48, Math.max(32, width * 0.032)) * 1.3 }]}>{'오늘의 발걸음이\n내일의 추억으로.'}</Text><Text style={{ color: p.paper, fontSize: 14 }}>당신만의 장소를 하나씩 모아보세요.</Text></LinearGradient></View>}
    <View style={{ flex: wide ? 1 : undefined, minWidth: 0, width: wide ? undefined : '100%', alignItems: 'center', justifyContent: 'center', minHeight: wide ? visualHeight : undefined }}><View style={[a.authPanel, { maxWidth: wide ? 420 : 440, paddingVertical: wide ? 32 : mobile ? 12 : 24, paddingHorizontal: wide ? 0 : mobile ? 8 : 16 }]}>{children}</View></View>
  </FormScrollView></SafeAreaView>
}
function TextAction({ label, icon, onPress, disabled }: { label: string; icon?: ReactNode; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [a.textButton, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}>{icon}<Text style={a.textAction}>{label}</Text></Pressable>
}
function LabelRow({ label, note }: { label: string; note?: string }) {
  return <Text style={a.label}>{label}{note ? <Text style={a.hint}>  {note}</Text> : null}</Text>
}

function KakaoLogo() {
  return <Svg width={23} height={23} viewBox="0 0 23 23"><Path d="M11.5 2.38989C17.2177 2.38989 21.85 6.04474 21.85 10.5513C21.85 15.0579 17.2177 18.7127 11.5 18.7127C10.8711 18.7127 10.2566 18.6696 9.66002 18.5833C9.06346 19.0038 5.61346 21.426 5.28643 21.4727C5.28643 21.4727 5.15346 21.523 5.03846 21.4583C4.92346 21.3936 4.94502 21.2175 4.94502 21.2175C4.98096 20.9804 5.84346 18.0119 6.00159 17.4621C3.08706 16.021 1.15002 13.4622 1.15002 10.5477C1.15002 6.04114 5.78237 2.38989 11.5 2.38989ZM4.24784 8.11114C3.9244 8.11114 3.66206 8.37349 3.66206 8.69692C3.66206 9.02036 3.9244 9.2827 4.24784 9.2827H5.17862V12.8297C5.17862 13.146 5.44815 13.4011 5.77518 13.4011C6.10221 13.4011 6.37174 13.146 6.37174 12.8297V9.2827H7.30252C7.62596 9.2827 7.88831 9.02036 7.88831 8.69692C7.88831 8.37349 7.62596 8.11114 7.30252 8.11114H4.24424H4.24784ZM9.30784 8.11114C8.91971 8.11833 8.61424 8.41302 8.51362 8.70052L7.0869 12.4596C6.90721 13.0238 7.06534 13.2322 7.22706 13.3077C7.34206 13.3616 7.47502 13.3904 7.60799 13.3904C7.85596 13.3904 8.04643 13.2897 8.10393 13.128L8.39862 12.3518H10.2206L10.5153 13.1244C10.5728 13.2861 10.7633 13.3868 11.0113 13.3868C11.1442 13.3868 11.2736 13.358 11.3922 13.3041C11.5575 13.2286 11.7157 13.0202 11.5324 12.456L10.1057 8.70052C10.005 8.41302 9.69956 8.11833 9.30784 8.11114ZM15.8089 8.11114C15.4783 8.11114 15.2124 8.38067 15.2124 8.70771V12.7938C15.2124 13.1244 15.4819 13.3904 15.8089 13.3904C16.136 13.3904 16.4055 13.1208 16.4055 12.7938V11.4929L16.6139 11.2844L18.0119 13.1388C18.1269 13.2897 18.2994 13.376 18.4899 13.376C18.6192 13.376 18.745 13.3365 18.8492 13.2574C18.975 13.1604 19.0577 13.0202 19.0792 12.8621C19.1008 12.704 19.0613 12.5458 18.9642 12.42L17.4944 10.4722L18.8564 9.1138C18.9499 9.02036 18.9966 8.89099 18.9894 8.75083C18.9822 8.61067 18.9175 8.4777 18.8133 8.37349C18.7019 8.26208 18.551 8.19739 18.4036 8.19739C18.2742 8.19739 18.1592 8.24411 18.073 8.33036L16.4091 9.99786V8.71489C16.4091 8.38427 16.1396 8.11833 15.8125 8.11833L15.8089 8.11114ZM12.5278 8.11114C12.1936 8.11114 11.9205 8.38067 11.9205 8.70771V12.7615C11.9205 13.0633 12.1757 13.3077 12.4919 13.3113H14.4074C14.7236 13.3113 14.9788 13.0633 14.9788 12.7615C14.9788 12.4596 14.72 12.2152 14.4074 12.2152H13.1388V8.70771C13.1388 8.37708 12.8657 8.11114 12.5278 8.11114ZM9.9044 11.2952H8.71127L9.30784 9.60255L9.9044 11.2952Z" fill="black" /></Svg>
}
function GoogleLogo() {
  return <Svg width={20} height={20} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z" />
    <Path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.82 23.82 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
  </Svg>
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

  async function login(provider: LoginProvider) {
    if (lock.current) return
    if (provider === 'email' && (!email.trim() || !password)) { setError('이메일과 비밀번호를 입력해 주세요.'); return }
    lock.current = true; setBusy(provider); setError(''); setMessage('')
    try {
      const user = await (provider === 'apple' ? loginWithApple() : provider === 'google' ? loginWithGoogle() : provider === 'kakao' ? loginWithKakao() : loginWithEmail(email, password))
      const details = await upsertUserProfile(user)
      router.replace(details.onboardingComplete === false ? '/signup' : destination)
    } catch (err) {
      const code = String((err as { code?: string })?.code || '')
      if (!/cancel|closed|SIGN_IN_CANCELLED/i.test(code)) setError(authErrorMessage(err, '로그인하지 못했습니다.', provider))
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
  return <AuthFrame>
    <BrandLogo size="auth" style={a.authLogo} />
    <View style={a.heading}><Text accessibilityRole="header" style={a.authTitle}>다시 만나 반가워요.</Text><Text style={a.authDescription}>내 장소 기록을 이어서 남겨보세요.</Text></View>
    {!firebaseReady && <Notice>로그인 연결을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.</Notice>}
    <View style={a.form}>
      <Field label="이메일" icon={<Mail size={18} color={p.muted} />} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="you@example.com" editable={!busy} />
      <Field label="비밀번호" icon={<KeyRound size={18} color={p.muted} />} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="6자 이상" editable={!busy} returnKeyType="go" onSubmitEditing={() => login('email')} />
      {!!error && <Notice error>{error}</Notice>}{!!message && <Notice>{message}</Notice>}
      <Button title={busy === 'email' ? '로그인 중' : '로그인'} style={a.authButton} onPress={() => login('email')} loading={busy === 'email'} disabled={!firebaseReady || !!busy} />
      <TextAction label={busy === 'reset' ? '메일 보내는 중' : '비밀번호를 잊으셨나요?'} disabled={!!busy || !firebaseReady} onPress={reset} />
    </View>
    <View style={a.divider}><View style={a.rule} /><Text style={a.dividerText}>또는</Text><View style={a.rule} /></View>
    <View style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityHint={error ? googleNotice.join(' ') : undefined} disabled={!!busy || !firebaseReady} onPress={() => login('google')} style={[a.social, a.google]}>
        {busy === 'google' ? <ActivityIndicator color={p.primary} /> : <GoogleLogo />}<Text style={[a.socialText, { color: '#3C4043' }]}>{busy === 'google' ? '구글 로그인 중' : '구글로 로그인하기'}</Text>
      </Pressable>
      {!!error && <View accessibilityRole="text" style={a.googleNotice}>{googleNotice.map(line => <Text key={line} style={a.hint}>{line}</Text>)}</View>}
    </View>
    <Pressable accessibilityRole="button" disabled={!!busy || !firebaseReady} onPress={() => login('kakao')} style={[a.social, a.kakao]}>
      {busy === 'kakao' ? <ActivityIndicator color={p.ink} /> : <KakaoLogo />}<Text style={a.socialText}>{busy === 'kakao' ? '카카오 로그인 중' : '카카오로 로그인'}</Text>
    </Pressable>
    <AppleLoginButton onPress={() => { void login('apple') }} loading={busy === 'apple'} disabled={!!busy || !firebaseReady} />
    <Pressable accessibilityRole="link" onPress={() => router.push('/signup')} style={a.textButton}><Text style={a.switchText}>계정이 없다면 <Text style={a.switchLink}>회원가입</Text></Text></Pressable>
    <PolicyLinks />
  </AuthFrame>
}

function ConsentRow({ label, value, onChange, policy }: { label: string; value: boolean; onChange: (value: boolean) => void; policy: string }) {
  return <View style={a.consentRow}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={a.consentLabel}>
      <View style={[a.checkbox, value && a.checkboxOn]}>{value && <Check color={p.paper} size={14} strokeWidth={3} />}</View><Text style={a.consentText}>{label}</Text>
    </Pressable>
    <Pressable accessibilityRole="link" accessibilityLabel={`${label.replace(/^\[[^\]]+\]\s*/, '')} 보기`} onPress={() => router.push(`/policies/${policy}`)} style={a.policyView}><Text style={a.consentLink}>보기</Text></Pressable>
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
  const [cancelOpen, setCancelOpen] = useState(false)
  const lock = useRef(false)

  const initialNickname = profile?.onboardingComplete === false && currentUser?.displayName ? currentUser.displayName : profile?.nickname
  useEffect(() => { if (initialNickname) setNickname(previous => previous || initialNickname) }, [initialNickname])
  // Validate once the date is complete so typing a partial date stays quiet.
  const birthError = requirements.birthDate.length === 10 ? getBirthDateError(requirements.birthDate) : ''
  const photoUri = photo?.uri || profile?.photoURL || currentUser?.photoURL || ''

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

  // A social sign-in that has not finished signup can switch accounts or leave entirely.
  async function switchAccount() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await logout(); router.replace('/login') }
    catch (err) { setError(authErrorMessage(err)) }
    finally { lock.current = false; setBusy(false) }
  }

  async function choosePhoto() {
    try { const result = await pickProfilePhoto(); if (result) setEditingPhoto(result) }
    catch (err) { setError(authErrorMessage(err)) }
  }

  if (loading && !busy) return <Screen title="회원가입"><ActivityIndicator color={p.primary} /></Screen>
  if (currentUser && profile?.username && profile.onboardingComplete !== false && !busy) return <Redirect href="/map" />

  return <AuthFrame>
    <BrandLogo size="auth" style={a.authLogo} />
    <View accessibilityLabel="가입 단계" style={a.progress}>
      <View style={a.progressStep} accessibilityState={{ selected: step === 'account' }}><View style={[a.stepCircle, a.stepActive]}>{step === 'profile' ? <Check color={p.paper} size={14} /> : <Text style={a.stepNumber}>1</Text>}</View><Text style={[a.stepLabel, step === 'account' && a.stepLabelActive]}>계정 만들기</Text></View>
      <View style={a.progressStep} accessibilityState={{ selected: step === 'profile' }}><View style={[a.stepCircle, step === 'profile' && a.stepActive]}><Text style={[a.stepNumber, step !== 'profile' && { color: p.muted }]}>2</Text></View><Text style={[a.stepLabel, step === 'profile' && a.stepLabelActive]}>프로필 꾸미기</Text></View>
    </View>
    <View style={a.heading}>
      <Text accessibilityRole="header" style={a.authTitle}>{step === 'account' ? '나만의 이름으로 시작해요' : '프로필을 꾸며보세요'}</Text>
      <Text style={a.authDescription}>{step === 'account' ? '피노리에서 나를 찾을 수 있는 고유한 이름이에요.' : '사진과 짧은 소개로 나를 표현해 보세요.'}</Text></View>
    {!firebaseReady && <Notice>로그인 연결을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.</Notice>}
    {step === 'account' ? <View style={a.signupFields}>
      <View style={a.fieldGroup}>
        <Field label="사용자 이름" icon={<AtSign size={18} color={p.muted} />} value={username} onChangeText={value => setUsername(value.toLowerCase())} autoCapitalize="none" autoCorrect={false} autoComplete="username" maxLength={USERNAME_MAX_LENGTH} placeholder="spotit.name" editable={!busy} />
        <Text style={a.hint}>영어, 숫자, 밑줄(_), 점(.) · 최대 30자 · 대문자는 소문자로 저장돼요.</Text>
      </View>
      {!currentUser && <>
        <Field label="이메일" icon={<Mail size={18} color={p.muted} />} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="you@example.com" editable={!busy} />
        <Field label="비밀번호" icon={<KeyRound size={18} color={p.muted} />} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="6자 이상" editable={!busy} />
      </>}
      <View style={a.fieldGroup}>
        <LabelRow label="생년월일" note="필수" />
        <Field accessibilityLabel="생년월일 (필수)" value={requirements.birthDate} onChangeText={value => { const digits = value.replace(/\D/g, '').slice(0, 8); setRequirements({ ...requirements, birthDate: [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-') }); setError('') }} placeholder="YYYY-MM-DD" keyboardType="number-pad" autoComplete="birthdate-full" maxLength={10} editable={!busy} style={birthError ? { borderColor: p.danger } : undefined} />
        <Text style={a.hint}>만 14세 미만은 가입할 수 없습니다. 생년월일은 공개되지 않습니다.</Text>
        {!!birthError && <Text accessibilityLiveRegion="polite" style={a.fieldError}>{birthError}</Text>}
      </View>
      <View style={a.consents}><Text style={a.consentLegend}>약관 및 개인정보 동의</Text>
        <ConsentRow label="[필수] 이용약관 동의" value={requirements.termsAccepted} onChange={value => { setRequirements({ ...requirements, termsAccepted: value }); setError('') }} policy="terms" />
        <ConsentRow label="[필수] 개인정보 처리 관련 동의" value={requirements.privacyAccepted} onChange={value => { setRequirements({ ...requirements, privacyAccepted: value }); setError('') }} policy="privacy" />
        <Text style={a.consentHint}>이메일·회원 식별자·사용자 이름·닉네임·생년월일·동의 내역을 회원 식별, 로그인, 프로필 제공, 가입 연령 및 동의 확인을 위해 회원 탈퇴 시까지 보관합니다. 필수 동의를 거부하면 가입할 수 없습니다.</Text>
        <ConsentRow label="[선택/기능 이용 시] 위치기반서비스 이용약관 동의" value={requirements.locationAccepted} onChange={value => { setRequirements({ ...requirements, locationAccepted: value }); setError('') }} policy="location" />
        <Text style={a.consentHint}>선택 동의 없이 가입할 수 있습니다. 현재 위치·장소 기록 기능을 이용할 때 다시 동의할 수 있으며, 기기의 위치 권한은 별도로 요청합니다.</Text>
        <Text style={a.consentHint}>회원정보는 Firebase 미국 서버로 전송·보관됩니다. <Text accessibilityRole="link" style={a.consentLink} onPress={() => router.push('/policies/privacy')}>국외이전 안내</Text></Text>
      </View>
      {!!error && <Notice error>{error}</Notice>}
      <Button title={busy ? '사용자 이름 확인 중' : '다음'} style={a.authButton} icon={<ArrowRight size={18} color={p.paper} />} loading={busy} disabled={!firebaseReady} onPress={next} />
    </View> : <View style={a.signupFields}>
      <View style={a.photoSection}>
        <Pressable style={[a.photoPicker, !photoUri && a.photoPickerEmpty]} accessibilityRole="button" accessibilityLabel="프로필 사진 선택 및 자르기" onPress={choosePhoto} disabled={busy}>
          {photoUri ? <Image source={{ uri: photoUri }} accessibilityLabel="프로필 사진 미리보기" style={a.photoImage} /> : <UserRound size={42} strokeWidth={1.5} color={p.muted} />}
          <View style={a.camera}><Camera size={16} color={p.paper} /></View>
        </Pressable>
        <Text style={{ textAlign: 'center', color: p.ink, fontWeight: '700' }}>@{username}</Text><Text style={a.hint}>사진을 눌러 추가해 보세요 · 선택 사항 · 최대 5MB</Text>
        {(photo || currentUser?.photoURL) && <TextAction label="사진 편집" icon={<Crop size={14} color={p.muted} />} onPress={() => setEditingPhoto(photo || { uri: currentUser!.photoURL! })} disabled={busy} />}
        {photo && <TextAction label="선택한 사진 지우기" icon={<X size={13} color={p.muted} />} onPress={() => setPhoto(null)} disabled={busy} />}
      </View>
      <View style={a.fieldGroup}>
        <Field label="닉네임" value={nickname} onChangeText={setNickname} maxLength={NICKNAME_MAX_LENGTH} autoComplete="nickname" placeholder="친구들에게 보여줄 이름" editable={!busy} />
        <Text style={a.hint}>한글도 사용할 수 있어요 · 최대 24자</Text>
      </View>
      <View style={a.fieldGroup}>
        <LabelRow label="소개글" note="선택 사항" />
        <Field accessibilityLabel="소개글 (선택 사항)" value={bio} onChangeText={setBio} multiline maxLength={BIO_MAX_LENGTH} placeholder="좋아하는 장소, 취향, 나를 소개하는 한마디" editable={!busy} />
        <Text style={[a.hint, { textAlign: 'right' }]}>{bio.length} / {BIO_MAX_LENGTH}</Text>
      </View>
      {!!error && <Notice error>{error}</Notice>}
      <Button title={busy ? '프로필 저장 중' : '가입 완료'} style={a.authButton} icon={<Check size={18} color={p.paper} />} loading={busy} onPress={save} />
      <TextAction label="이전 단계" icon={<ArrowLeft size={16} color={p.muted} />} disabled={busy} onPress={() => { setError(''); setStep('account') }} />
    </View>}
    {!currentUser && <Pressable style={a.textButton} accessibilityRole="link" onPress={() => router.replace('/login')}><Text style={a.switchText}>이미 계정이 있다면 <Text style={a.switchLink}>로그인</Text></Text></Pressable>}
    {currentUser && profile?.onboardingComplete === false && <View style={a.exitActions}>
      <TextAction label="다른 계정으로 로그인" disabled={busy} onPress={() => void switchAccount()} />
      <Text style={a.hint}>·</Text>
      <TextAction label="가입 취소" disabled={busy} onPress={() => setCancelOpen(true)} />
    </View>}
    <PolicyLinks credit />
    <DeleteAccountDialog visible={cancelOpen} incomplete onClose={() => setCancelOpen(false)} />
    <PhotoEditor photo={editingPhoto} square onClose={() => setEditingPhoto(null)} onSave={value => { setPhoto(value); setEditingPhoto(null) }} />
  </AuthFrame>
}

const a = StyleSheet.create({
  authPanel: { width: '100%', gap: 16, alignSelf: 'center' },
  authTitle: { fontSize: 28, lineHeight: 39, fontWeight: '600', letterSpacing: -1.1, color: p.ink }, authDescription: { fontSize: 14, lineHeight: 24, color: p.muted },
  authLogo: { marginBottom: 32 }, heading: { gap: 8, marginBottom: 16 }, form: { gap: 16 }, signupFields: { gap: 18 }, fieldGroup: { gap: 7 },
  authButton: { minHeight: 48 },
  label: { fontSize: 14, fontWeight: '500', color: p.ink }, hint: { color: p.muted, fontSize: 12, lineHeight: 19 }, fieldError: { color: p.danger, fontSize: 13, lineHeight: 19 },
  visualCopy: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 48, paddingTop: 120, gap: 24 },
  visualTitle: { fontWeight: '500', letterSpacing: -1.8, color: p.paper },
  textButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', gap: 6, minHeight: 44 }, textAction: { color: p.muted, fontSize: 14, fontWeight: '600' },
  switchText: { color: p.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' }, switchLink: { color: p.primaryHover, fontWeight: '700' },
  policyFooter: { borderTopWidth: 1, borderTopColor: p.line, marginTop: 8, paddingTop: 16 },
  policyLinks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 16 }, policyLink: { minHeight: 44, justifyContent: 'center' }, policyText: { fontSize: 12, lineHeight: 19, color: p.muted },
  credit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 }, rule: { flex: 1, height: 1, backgroundColor: p.line }, dividerText: { color: p.muted, fontSize: 13.6, fontWeight: '600' },
  social: { minHeight: 48, borderRadius: 6, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' }, google: { backgroundColor: p.paper, borderWidth: 1, borderColor: p.line }, kakao: { backgroundColor: '#FEE500' }, socialText: { color: '#191600', fontSize: 14, fontWeight: '600' },
  googleNotice: { gap: 5, marginTop: -2 },
  exitActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 16 }, progressStep: { flexDirection: 'row', alignItems: 'center', gap: 8 }, stepCircle: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' }, stepActive: { borderColor: p.primary, backgroundColor: p.primary }, stepNumber: { color: p.paper, fontSize: 12, fontWeight: '600' }, stepLabel: { color: p.muted, fontSize: 13, fontWeight: '600' }, stepLabelActive: { color: p.primaryHover },
  consents: { padding: 16, borderRadius: 6, backgroundColor: p.paper, gap: 14 }, consentLegend: { color: p.ink, fontSize: 15, fontWeight: '700' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, consentLabel: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 9, minHeight: 44 }, consentText: { flex: 1, fontSize: 14, color: p.ink, lineHeight: 21 }, consentHint: { color: p.muted, fontSize: 14, lineHeight: 22 }, consentLink: { color: p.ink, fontSize: 14, lineHeight: 21, textDecorationLine: 'underline' },
  checkbox: { width: 18, height: 18, marginTop: 2, borderRadius: 4, borderWidth: 1, borderColor: p.muted, alignItems: 'center', justifyContent: 'center' }, checkboxOn: { borderColor: p.primary, backgroundColor: p.primary }, policyView: { minHeight: 44, paddingHorizontal: 4 },
  photoSection: { alignItems: 'center', gap: 10, paddingTop: 6, paddingBottom: 10 },
  photoPicker: { width: 104, height: 104, marginBottom: 4, borderRadius: 52, alignItems: 'center', justifyContent: 'center' }, photoPickerEmpty: { borderWidth: 2, borderStyle: 'dashed', borderColor: p.line },
  photoImage: { width: 104, height: 104, borderRadius: 52, backgroundColor: p.surface },
  camera: { position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primary, borderColor: p.paper, borderWidth: 3 },
})
