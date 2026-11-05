import { useEffect, useRef, useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { Download } from 'lucide-react-native'
import { useAppRelease } from '../hooks/useAppRelease'
import { Dialog } from './Dialog'
import { Button, Notice, p } from './ui'

export function AppUpdatePrompt() {
  const { release, currentVersion } = useAppRelease()
  const [dismissedVersions, setDismissedVersions] = useState<Set<string>>(() => new Set())
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<{ version: string; url: string } | null>(null)
  const openingLock = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => { setError(null) }, [release?.version, release?.url])

  function dismiss(version: string) {
    setDismissedVersions(previous => new Set(previous).add(version))
  }
  async function update() {
    if (!release || openingLock.current) return
    const requested = release
    openingLock.current = true; setOpening(true); setError(null)
    try {
      await Linking.openURL(requested.url)
      if (mounted.current) dismiss(requested.version)
    } catch {
      if (mounted.current) setError({ version: requested.version, url: requested.url })
    } finally {
      openingLock.current = false
      if (mounted.current) setOpening(false)
    }
  }

  if (!release || dismissedVersions.has(release.version)) return null

  return <Dialog visible title="새로운 앱 버전이 나왔습니다" busy={opening} onClose={() => { if (!openingLock.current) dismiss(release.version) }}>
    <View style={styles.icon}><Download size={28} color={p.primary} /></View>
    <Text style={styles.description}>더 나은 이용을 위해 피노리를 업데이트해 주세요.</Text>
    <Text style={styles.version}>현재 {currentVersion} → 최신 {release.version}</Text>
    {release.message ? <Text style={styles.description}>{release.message}</Text> : null}
    {error?.version === release.version && error.url === release.url ? <Notice error>업데이트 페이지를 열지 못했습니다. 잠시 후 다시 시도해 주세요.</Notice> : null}
    <Button title="업데이트" icon={<Download size={18} color={p.paper} />} loading={opening} onPress={() => void update()} />
    <Pressable accessibilityRole="button" disabled={opening} onPress={() => dismiss(release.version)} style={styles.dismiss}><Text style={styles.dismissText}>나중에</Text></Pressable>
  </Dialog>
}

// Mirrors the web install prompt: one primary action, dismissal as a quiet underlined link.
const styles = StyleSheet.create({
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: p.primarySoft },
  description: { fontSize: 14, lineHeight: 22, color: p.ink },
  version: { fontSize: 12, color: p.muted },
  dismiss: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  dismissText: { color: p.muted, fontSize: 12, textDecorationLine: 'underline' },
})
