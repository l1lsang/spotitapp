import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth'
import { useBlockedUsers, withoutBlocked } from './useBlockedUsers'
import { getFeedSearchTerms } from '../lib/feedSearch'
import { searchVisiblePosts } from '../services/postService'
import type { Post } from '../types/post'

const SEARCH_DELAY_MS = 250
const NO_POSTS: Post[] = []

// The feed search across every pin the viewer can see, beyond the loaded pages.
// Without a query it searches nothing.
export function useFeedSearch(keyword: string) {
  const { currentUser, accountReady } = useAuth()
  const uid = currentUser?.uid
  const term = getFeedSearchTerms(keyword).join(' ')
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; posts: Post[]; error: string }>({ key: '', posts: NO_POSTS, error: '' })
  const key = term && uid && accountReady ? `${uid}:${revision}:${term}` : ''

  useEffect(() => {
    if (!key || !uid) return
    let active = true
    const timer = setTimeout(() => {
      searchVisiblePosts(uid, term).then(
        posts => { if (active) setResult({ key, posts, error: '' }) },
        () => { if (active) setResult({ key, posts: NO_POSTS, error: '이전 기록까지 검색하지 못해 불러온 기록에서만 찾았어요.' }) },
      )
    }, SEARCH_DELAY_MS)
    return () => { active = false; clearTimeout(timer) }
  }, [key, term, uid])

  // Call after the app's read cache is cleared, as the feed's refresh does.
  const retry = useCallback(() => setRevision(value => value + 1), [])
  const ready = !!key && result.key === key
  const { ids: blockedIds } = useBlockedUsers()
  const posts = useMemo(() => withoutBlocked(result.posts, blockedIds), [result.posts, blockedIds])
  return { posts: ready ? posts : NO_POSTS, searching: !!key && !ready, error: ready ? result.error : '', retry }
}
