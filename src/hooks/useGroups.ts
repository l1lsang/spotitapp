import { useEffect, useState } from 'react'
import { subscribeGroup, subscribeGroups, subscribeMyGroupIds } from '../services/groupService'
import type { PinGroup } from '../types/group'
import { useAuth } from './useAuth'

export function useGroups(enabled = true) {
  const { currentUser, accountReady: firebaseReady } = useAuth()
  const uid = currentUser?.uid
  const [groups, setGroups] = useState<PinGroup[]>([])
  const [joinedIds, setJoinedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    setGroups([])
    setJoinedIds([])
    setError('')
    if (!enabled || !uid || !firebaseReady) { setLoading(false); return }
    setLoading(true)
    let groupsReady = false
    let membershipsReady = false
    let publicGroups: PinGroup[] = []
    const memberGroups = new Map<string, PinGroup>()
    const memberSubscriptions = new Map<string, () => void>()
    const pending = new Set<string>()
    const publish = () => {
      const combined = new Map(publicGroups.map(group => [group.id, group]))
      memberGroups.forEach((group, id) => combined.set(id, group))
      setGroups([...combined.values()].sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)))
      if (groupsReady && membershipsReady && pending.size === 0) setLoading(false)
    }
    const failed = () => { setError('그룹을 불러오지 못했습니다. 다시 시도해 주세요.'); setLoading(false) }
    const stopGroups = subscribeGroups(next => {
      publicGroups = next
      groupsReady = true
      publish()
    }, failed)
    const stopMemberships = subscribeMyGroupIds(uid, ids => {
      setJoinedIds(ids)
      membershipsReady = true
      for (const [id, stop] of memberSubscriptions) {
        if (!ids.includes(id)) { stop(); memberSubscriptions.delete(id); memberGroups.delete(id); pending.delete(id) }
      }
      for (const id of ids) {
        if (memberSubscriptions.has(id)) continue
        pending.add(id)
        setLoading(true)
        memberSubscriptions.set(id, subscribeGroup(id, group => {
          if (group) memberGroups.set(id, group)
          else memberGroups.delete(id)
          pending.delete(id)
          publish()
        }, cause => {
          memberGroups.delete(id)
          pending.delete(id)
          publish()
          // A departing member's listener can lose permission before the membership index updates.
          if ((cause as { code?: string }).code !== 'permission-denied') failed()
        }))
      }
      publish()
    }, failed)
    return () => { stopGroups(); stopMemberships(); memberSubscriptions.forEach(stop => stop()) }
  }, [uid, firebaseReady, enabled, revision])

  return { groups, joinedIds, loading, error, retry: () => setRevision(value => value + 1) }
}
