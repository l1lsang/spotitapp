import { getRandomValues } from 'expo-crypto'
import {
  collection, doc, getDoc, increment, onSnapshot, query, runTransaction, serverTimestamp, where, writeBatch,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { requireDb } from '../lib/firebase'
import { getGroupInputError, isGroupInviteCode, normalizeGroupInviteCode, type GroupBan, type GroupInput, type GroupMember, type GroupRole, type PinGroup } from '../types/group'
import { functionsClient } from './moderationService'

function toGroup(item: DocumentSnapshot): PinGroup | null {
  if (!item.exists()) return null
  return { ...item.data(), id: item.id, visibility: item.data().visibility || 'public' } as PinGroup
}

export function subscribeGroups(onChange: (groups: PinGroup[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(requireDb(), 'groups'), where('visibility', '==', 'public')), snapshot => {
    onChange(snapshot.docs.map(item => toGroup(item)!))
  }, onError)
}

export function subscribeGroup(groupId: string, onChange: (group: PinGroup | null) => void, onError: (error: Error) => void) {
  return onSnapshot(doc(requireDb(), 'groups', groupId), snapshot => onChange(toGroup(snapshot)), onError)
}

export function subscribeMyGroupIds(uid: string, onChange: (ids: string[]) => void, onError: (error: Error) => void) {
  return onSnapshot(collection(requireDb(), 'users', uid, 'groupMemberships'), snapshot => {
    onChange(snapshot.docs.map(item => item.id))
  }, onError)
}

export async function createGroup(input: GroupInput, uid: string): Promise<string> {
  const error = getGroupInputError(input)
  if (error) throw new Error(error)
  const db = requireDb()
  const group = doc(collection(db, 'groups'))
  const code = createInviteCode()
  const membership = { uid, groupId: group.id, joinedAt: serverTimestamp() }
  const batch = writeBatch(db)
  batch.set(group, {
    name: input.name.trim(), description: input.description.trim(), ownerUid: uid,
    visibility: input.visibility || 'public', memberCount: 1, createdAt: serverTimestamp(),
  })
  batch.set(doc(group, 'members', uid), membership)
  batch.set(doc(db, 'users', uid, 'groupMemberships', group.id), membership)
  batch.set(doc(group, 'private', 'invite'), { code })
  batch.set(doc(db, 'groupInvites', code), { groupId: group.id })
  await batch.commit()
  return group.id
}

function createInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(getRandomValues(new Uint8Array(12)), value => alphabet[value & 31]).join('')
}

// Existing groups receive a code the first time a member opens the invitation panel.
export async function getGroupInviteCode(groupId: string): Promise<string> {
  const db = requireDb()
  const inviteRef = doc(db, 'groups', groupId, 'private', 'invite')
  return runTransaction(db, async transaction => {
    const invite = await transaction.get(inviteRef)
    if (invite.exists()) return invite.data().code as string
    const code = createInviteCode()
    transaction.set(inviteRef, { code })
    transaction.set(doc(db, 'groupInvites', code), { groupId })
    return code
  })
}

export async function joinGroupWithCode(codeInput: string, uid: string, expectedGroupId?: string): Promise<string> {
  const code = normalizeGroupInviteCode(codeInput)
  if (!isGroupInviteCode(code)) throw new Error('초대코드 12자리를 확인해 주세요.')
  const invite = await getDoc(doc(requireDb(), 'groupInvites', code))
  const groupId = invite.data()?.groupId as string | undefined
  if (!groupId || (expectedGroupId && groupId !== expectedGroupId)) throw new Error('초대코드가 올바르지 않습니다. 코드를 다시 확인해 주세요.')
  await setGroupMembership(groupId, uid, true, code)
  return groupId
}

// Read only the caller's membership so private groups can be joined without disclosing their contents first.
// Membership, personal index, and count change atomically, including when two tabs join at once.
export async function setGroupMembership(groupId: string, uid: string, joined: boolean, inviteCode?: string): Promise<void> {
  if (joined && inviteCode !== undefined && !isGroupInviteCode(normalizeGroupInviteCode(inviteCode))) throw new Error('초대코드 12자리를 확인해 주세요.')
  const db = requireDb()
  const groupRef = doc(db, 'groups', groupId)
  const memberRef = doc(groupRef, 'members', uid)
  const indexRef = doc(db, 'users', uid, 'groupMemberships', groupId)
  try { await runTransaction(db, async transaction => {
    const member = await transaction.get(memberRef)
    if (member.exists() === joined) return
    if (joined) {
      const membership = { uid, groupId, joinedAt: serverTimestamp(), ...(inviteCode !== undefined ? { inviteCode: normalizeGroupInviteCode(inviteCode) } : {}) }
      transaction.set(memberRef, membership)
      transaction.set(indexRef, membership)
    } else {
      transaction.delete(memberRef)
      transaction.delete(indexRef)
    }
    transaction.update(groupRef, { memberCount: increment(joined ? 1 : -1) })
  }) } catch (error) {
    // A concurrent request may have committed the same join/leave before rules evaluate this write.
    // Only acknowledge success after reading the requested state under this user's own permissions.
    if ((error as { code?: string }).code === 'permission-denied') {
      if ((await getDoc(memberRef)).exists() === joined) return
      if (joined && (await getDoc(doc(groupRef, 'bans', uid)).catch(() => null))?.exists()) {
        throw new Error('이 그룹에서 내보내진 상태라 다시 가입할 수 없어요.', { cause: error })
      }
    }
    throw error
  }
}

async function groupCall<T>(name: string, data: object): Promise<T> {
  try { return (await httpsCallable<object, T>(functionsClient(), name)(data)).data }
  catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'functions/internal' || code === 'functions/unavailable' || code === 'functions/not-found') throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', { cause: error })
    throw error
  }
}

/** Opens the group's own room, creating it on first use; members only. */
export async function openGroupChat(groupId: string): Promise<string> {
  return (await groupCall<{ chatId: string }>('openGroupChat', { groupId })).chatId
}

export function listGroupMembers(groupId: string) {
  return groupCall<{ members: GroupMember[]; viewerRole: GroupRole }>('manageGroup', { groupId, action: 'listMembers' })
}

export async function updateGroupInfo(groupId: string, input: Pick<GroupInput, 'name' | 'description'>): Promise<void> {
  const error = getGroupInputError(input)
  if (error) throw new Error(error)
  await groupCall('manageGroup', { groupId, action: 'update', name: input.name.trim(), description: input.description.trim() })
}

export async function setGroupAdmin(groupId: string, uid: string, isAdmin: boolean): Promise<void> {
  await groupCall('manageGroup', { groupId, action: 'setAdmin', uid, admin: isAdmin })
}

/** With ban, the person also cannot join again, even with an invite code, until unbanned. */
export async function removeGroupMember(groupId: string, uid: string, ban = false): Promise<void> {
  await groupCall('manageGroup', { groupId, action: 'removeMember', uid, ban })
}

export async function listGroupBans(groupId: string): Promise<GroupBan[]> {
  return (await groupCall<{ bans: GroupBan[] }>('manageGroup', { groupId, action: 'listBans' })).bans
}

export async function unbanGroupMember(groupId: string, uid: string): Promise<void> {
  await groupCall('manageGroup', { groupId, action: 'unban', uid })
}

/** Owner only. Pins stay with their authors; the group room is deleted with the group. */
export async function deleteGroup(groupId: string, confirmName: string): Promise<void> {
  await groupCall('manageGroup', { groupId, action: 'delete', confirmName })
}
