import type { Timestamp } from 'firebase/firestore'

export type GroupVisibility = 'public' | 'private'

export interface PinGroup {
  id: string
  name: string
  description: string
  ownerUid: string
  memberCount: number
  createdAt: Timestamp
  visibility: GroupVisibility
  /** Co-admins appointed by the owner; they can edit the group and remove ordinary members. */
  adminUids?: string[]
}

export type GroupRole = 'owner' | 'admin' | 'member'

export interface GroupMember {
  uid: string
  nickname: string
  photoURL: string
  role: GroupRole
  joinedAt: number
}

/** Someone removed from the group who may not join again until unbanned. */
export interface GroupBan {
  uid: string
  nickname: string
  photoURL: string
  bannedAt: number
}

export function getGroupRole(group: Pick<PinGroup, 'ownerUid' | 'adminUids'>, uid: string | undefined): GroupRole {
  if (!uid) return 'member'
  if (group.ownerUid === uid) return 'owner'
  return group.adminUids?.includes(uid) ? 'admin' : 'member'
}

export const GROUP_ROLE_LABELS: Record<GroupRole, string> = { owner: '그룹장', admin: '관리자', member: '멤버' }

export interface GroupInput {
  name: string
  description: string
  visibility?: GroupVisibility
}

export function getGroupInputError(input: GroupInput): string {
  if (input.name.trim().length < 2 || input.name.trim().length > 40) return '그룹 이름은 2~40자로 입력해 주세요.'
  if (input.description.trim().length > 240) return '그룹 소개는 240자 이내로 입력해 주세요.'
  if (input.visibility !== undefined && !['public', 'private'].includes(input.visibility)) return '그룹 공개 범위를 선택해 주세요.'
  return ''
}

export function normalizeGroupInviteCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

export function isGroupInviteCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{12}$/.test(code)
}
