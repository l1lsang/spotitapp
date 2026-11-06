import { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native';
import { Text } from './Typography';
import { router } from 'expo-router'
import { MapPin, Send } from 'lucide-react-native'
import { useAuth } from '../hooks/useAuth'
import { createPinShareMessage, getShareUrl } from '../lib/chatPinShare'
import type { Post } from '../types/post'
import { SendSheet } from './SendSheet'
import { p, s } from './ui'

// "보내기": share a pin to people and rooms inside the app, with link sharing as a fallback.
export function SharePinButton({ post }: { post: Post }) {
  const { currentUser } = useAuth()
  const [open, setOpen] = useState(false)
  const message = useMemo(() => { try { return createPinShareMessage(post) } catch { return null } }, [post])
  const url = useMemo(() => { try { return getShareUrl('posts', post.id) } catch { return '' } }, [post.id])

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="핀 보내기" style={({ pressed }) => [s.row, { minHeight: 44, gap: 7, paddingVertical: 4, opacity: pressed ? 0.6 : 1 }]} onPress={() => {
      if (!currentUser) { router.push('/login'); return }
      setOpen(true)
    }}><Send size={19} color={p.primary} /><Text style={{ color: p.primary, fontSize: 13.76 }}>보내기</Text></Pressable>
    <SendSheet visible={open} onClose={() => setOpen(false)} message={message} link={{ url, text: `${post.title} · ${post.placeName}` }}
      preview={<>
        <View style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primarySoft }}><MapPin size={22} color={p.primary} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: p.ink, fontSize: 15, fontWeight: '600' }}>{post.title}</Text>
          <Text numberOfLines={1} style={{ color: p.muted, fontSize: 13 }}>{post.placeName}{post.visibility !== 'public' ? ' · 받는 사람은 공개 범위에 따라 볼 수 있어요' : ''}</Text>
        </View>
      </>} />
  </>
}
