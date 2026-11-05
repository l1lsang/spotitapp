import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Text } from './Typography'

export interface AppleLoginButtonProps {
  onPress: () => void
  disabled?: boolean
  loading?: boolean
}

export function AppleLoginButton({ onPress, disabled = false, loading = false }: AppleLoginButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={loading ? '애플 로그인 중' : 'Apple로 로그인'}
    accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading}
    onPress={onPress} style={({ pressed }) => [styles.button, (disabled || loading) && styles.disabled, pressed && { opacity: 0.8 }]}>
    {loading ? <ActivityIndicator color="#FFFFFF" /> : <AppleLogo />}
    <Text style={styles.label}>{loading ? '애플 로그인 중' : 'Apple로 로그인'}</Text>
  </Pressable>
}

// Apple logo from Apple's Sign in with Apple JS button asset (ko_KR, v1).
function AppleLogo() {
  return <Svg width={16} height={20} viewBox="20.5 16 15 19" aria-hidden={true}>
    <Path fill="#FFFFFF" d="M28.2226562,20.3846154 C29.0546875,20.3846154 30.0976562,19.8048315 30.71875,19.0317864 C31.28125,18.3312142 31.6914062,17.352829 31.6914062,16.3744437 C31.6914062,16.2415766 31.6796875,16.1087095 31.65625,16 C30.7304687,16.0362365 29.6171875,16.640178 28.9492187,17.4494596 C28.421875,18.06548 27.9414062,19.0317864 27.9414062,20.0222505 C27.9414062,20.1671964 27.9648438,20.3121424 27.9765625,20.3604577 C28.0351562,20.3725366 28.1289062,20.3846154 28.2226562,20.3846154 Z M25.2929688,35 C26.4296875,35 26.9335938,34.214876 28.3515625,34.214876 C29.7929688,34.214876 30.109375,34.9758423 31.375,34.9758423 C32.6171875,34.9758423 33.4492188,33.792117 34.234375,32.6325493 C35.1132812,31.3038779 35.4765625,29.9993643 35.5,29.9389701 C35.4179688,29.9148125 33.0390625,28.9122695 33.0390625,26.0979021 C33.0390625,23.6579784 34.9140625,22.5588048 35.0195312,22.474253 C33.7773438,20.6382708 31.890625,20.5899555 31.375,20.5899555 C29.9804688,20.5899555 28.84375,21.4596313 28.1289062,21.4596313 C27.3554688,21.4596313 26.3359375,20.6382708 25.1289062,20.6382708 C22.8320312,20.6382708 20.5,22.5950413 20.5,26.2911634 C20.5,28.5861411 21.3671875,31.013986 22.4335938,32.5842339 C23.3476562,33.9129053 24.1445312,35 25.2929688,35 Z" />
  </Svg>
}

const styles = StyleSheet.create({
  button: { minHeight: 48, width: '100%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 6, backgroundColor: '#000000', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  disabled: { opacity: 0.5 },
})
