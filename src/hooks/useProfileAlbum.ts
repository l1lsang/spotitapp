import { useEffect, useMemo, useState } from 'react'
import { useBlockedUsers, withoutBlocked } from './useBlockedUsers'
import { getProfilePosts, subscribeToLikedPosts } from '../services/postService'
import type { Post } from '../types/post'

export type ProfileAlbum = Awaited<ReturnType<typeof getProfilePosts>>

export interface ProfileAlbumState {
  album: ProfileAlbum | null
  loading: boolean
  error: string
  retry: () => void
}

// The header shows the pin count, so the page owns the album request.
export function useProfileAlbum(ownerUid: string, viewerUid: string | undefined, refreshKey = 0): ProfileAlbumState {
  const [album, setAlbum] = useState<ProfileAlbum | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setAlbum(null)
    setError('')
    void getProfilePosts(ownerUid, viewerUid).then(result => {
      if (active) setAlbum(result)
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : '핀을 불러오지 못했습니다.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [ownerUid, viewerUid, refreshKey, revision])

  return { album, loading, error, retry: () => setRevision(value => value + 1) }
}

export interface LikedPostsState {
  posts: Post[]
  loading: boolean
  error: string
  retry: () => void
}

// Subscribes only while the likes tab is open.
export function useLikedPosts(uid: string | undefined, enabled: boolean): LikedPostsState {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!enabled) return
    setPosts([]); setLoading(true); setError('')
    if (!uid) { setLoading(false); return }
    return subscribeToLikedPosts(uid, next => { setPosts(next); setLoading(false) }, () => {
      setPosts([]); setLoading(false); setError('좋아요한 핀을 불러오지 못했어요. 다시 시도해 주세요.')
    })
  }, [uid, enabled, revision])
  const { ids: blockedIds } = useBlockedUsers()
  const shown = useMemo(() => withoutBlocked(posts, blockedIds), [posts, blockedIds])

  return { posts: shown, loading, error, retry: () => setRevision(value => value + 1) }
}
