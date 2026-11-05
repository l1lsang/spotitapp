import { useEffect, useSyncExternalStore } from 'react'
import { useAuth } from './useAuth'
import { subscribeBlockedUsers, type BlockedUser } from '../services/blockService'

interface BlockState { uid: string; users: BlockedUser[]; ids: ReadonlySet<string>; error: string }
const EMPTY: BlockState = { uid: '', users: [], ids: new Set(), error: '' }
let state = EMPTY
const listeners = new Set<() => void>()
function update(next: BlockState) { state = next; listeners.forEach(listener => listener()) }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }

// Mounted once at the root: keeps the signed-in member's block list live so
// every screen hides blocked members the moment a block is written.
export function BlockedUsersSync() {
  const { currentUser, accountReady } = useAuth()
  const uid = currentUser?.uid
  useEffect(() => {
    if (!uid || !accountReady) { update(EMPTY); return }
    update({ ...EMPTY, uid })
    return subscribeBlockedUsers(uid,
      users => update({ uid, users, ids: new Set(users.map(user => user.uid)), error: '' }),
      error => update({ ...state, uid, error: error.message }))
  }, [uid, accountReady])
  return null
}

export function useBlockedUsers() {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

export function withoutBlocked<T extends { uid: string }>(items: T[], ids: ReadonlySet<string>): T[] {
  return ids.size ? items.filter(item => !ids.has(item.uid)) : items
}
