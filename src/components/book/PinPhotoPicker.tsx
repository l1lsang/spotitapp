import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../Typography'
import { Dialog } from '../Dialog'
import { RemoteImage } from '../RemoteImage'
import { Button, Notice, p } from '../ui'
import { getUserPosts } from '../../services/postService'
import { measurePhoto } from '../../services/bookPhotoService'
import type { Post } from '../../types/post'
import type { BookImageRef } from '../../types/book'

const THUMB = 76

/** Photos from the signed-in user's own records only. */
export function PinPhotoPicker({ uid, visible, onClose, onPick }: {
  uid: string
  visible: boolean
  onClose: () => void
  onPick: (ref: BookImageRef) => void
}) {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!visible) return
    let active = true
    getUserPosts(uid)
      .then(next => { if (active) { setPosts(next.filter(post => post.photoUrls.length > 0)); setError('') } })
      .catch(() => { if (active) setError('내 기록을 불러오지 못했어요.') })
    return () => { active = false }
  }, [uid, visible, attempt])

  const pick = (post: Post, index: number) => {
    const url = post.photoUrls[index]
    const key = `${post.id}:${index}`
    if (picking) return
    setPicking(key)
    measurePhoto(url)
      .then(size => {
        onPick({ postId: post.id, photoIndex: index, url, thumbUrl: post.photoThumbnailUrls?.[index], pxWidth: size.width, pxHeight: size.height })
        onClose()
      })
      .catch(() => setError('사진을 열지 못했어요. 다른 사진을 골라 주세요.'))
      .finally(() => setPicking(''))
  }

  return <Dialog visible={visible} title="내 기록에서 사진 넣기" onClose={onClose} busy={Boolean(picking)}>
    {!!error && <Notice error>{error}</Notice>}
    {!!error && !posts && <Button variant="secondary" title="다시 불러오기" onPress={() => setAttempt(value => value + 1)} />}
    {!posts && !error && <ActivityIndicator color={p.primary} />}
    {posts?.length === 0 && <Text style={styles.empty}>사진이 있는 기록이 아직 없어요.</Text>}
    {posts?.map(post => <View key={post.id} style={styles.record}>
      <Text numberOfLines={1} style={styles.title}>{post.title || post.placeName}</Text>
      <Text numberOfLines={1} style={styles.meta}>{[post.placeName, post.dateKey].filter(Boolean).join(' · ')}</Text>
      <View style={styles.photos}>
        {post.photoUrls.map((url, index) => {
          const key = `${post.id}:${index}`
          return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${post.title || post.placeName} 사진 ${index + 1} 넣기`}
            onPress={() => pick(post, index)} style={({ pressed }) => [styles.thumb, pressed && { opacity: 0.7 }]}>
            <RemoteImage uri={post.photoThumbnailUrls?.[index] || url} contentFit="cover" style={StyleSheet.absoluteFill} />
            {picking === key && <View style={styles.busy}><ActivityIndicator color={p.paper} /></View>}
          </Pressable>
        })}
      </View>
    </View>)}
  </Dialog>
}

const styles = StyleSheet.create({
  record: { gap: 4, paddingBottom: 14, borderBottomWidth: 1, borderColor: p.line },
  title: { fontSize: 15, fontWeight: '600', color: p.ink },
  meta: { fontSize: 13, color: p.muted },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 6, overflow: 'hidden', backgroundColor: p.surface },
  busy: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: p.overlay },
  empty: { fontSize: 15, lineHeight: 23, color: p.muted },
})
