import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import type { AppleLoginButtonProps } from './AppleLoginButton'

export function AppleLoginButton({ onPress, disabled = false, loading = false }: AppleLoginButtonProps) {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let active = true
    void AppleAuthentication.isAvailableAsync().then(value => { if (active) setAvailable(value) }).catch(() => {})
    return () => { active = false }
  }, [])
  if (!available) return null
  const blocked = disabled || loading
  return <View pointerEvents={blocked ? 'none' : 'auto'} style={{ opacity: blocked ? 0.5 : 1 }}>
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={6} style={{ height: 48, width: '100%' }}
      accessibilityState={{ disabled: blocked, busy: loading }}
      onPress={() => { if (!blocked) onPress() }}
    />
    {loading && <ActivityIndicator color="#FFFFFF" style={{ position: 'absolute', left: 14, top: 14 }} />}
  </View>
}
