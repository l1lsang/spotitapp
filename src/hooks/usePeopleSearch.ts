import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth'
import { useBlockedUsers, withoutBlocked } from './useBlockedUsers'
import { invalidateAppReads } from '../lib/readCache'
import { normalizeUserSearch } from '../lib/userSearch'
import { getFollowingProfiles } from '../services/followService'
import { searchUsers } from '../services/userService'
import type { DaymarkUser } from '../types/user'

const SEARCH_DELAY_MS = 250

// Without a query: the people the viewer follows. With one: matching members.
// Never loads the whole member list.
export function usePeopleSearch(keyword: string, enabled = true) {
  const { currentUser, firebaseReady } = useAuth()
  const uid = currentUser?.uid
  const term = normalizeUserSearch(keyword)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; people: DaymarkUser[]; error: string }>({ key: '', people: [], error: '' })
  const key = enabled && uid && firebaseReady ? `${uid}:${revision}:${term}` : ''

  useEffect(() => {
    if (!key || !uid) return
    let active = true
    const timer = setTimeout(() => {
      const load = term ? searchUsers(term) : getFollowingProfiles(uid)
      load.then(
        people => { if (active) setResult({ key, people: people.filter(user => user.uid !== uid), error: '' }) },
        error => { if (active) setResult({ key, people: [], error: error instanceof Error ? error.message : '사람 목록을 불러오지 못했습니다.' }) },
      )
    }, term ? SEARCH_DELAY_MS : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [key, term, uid])

  const retry = useCallback(() => { invalidateAppReads(); setRevision(value => value + 1) }, [])
  const ready = !!key && result.key === key
  const { ids: blockedIds } = useBlockedUsers()
  const people = useMemo(() => withoutBlocked(result.people, blockedIds), [result.people, blockedIds])
  return { people: ready ? people : [], loading: !!key && !ready, error: ready ? result.error : '', searching: !!term, retry }
}
