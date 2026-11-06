// Pure rules for group management, shared by the callable functions and their tests.

const GROUP_CHAT_PREFIX = 'group_'

function groupChatId(groupId) {
  return `${GROUP_CHAT_PREFIX}${groupId}`
}

function isValidId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/')
}

/** 'owner' | 'admin' | 'member' for someone who is in the group. */
function groupRole(group, uid) {
  if (group.ownerUid === uid) return 'owner'
  if (Array.isArray(group.adminUids) && group.adminUids.includes(uid)) return 'admin'
  return 'member'
}

function canManage(role) {
  return role === 'owner' || role === 'admin'
}

// Owners can remove anyone but themselves; co-admins can remove ordinary members only.
function canRemoveMember(actorRole, targetRole) {
  if (targetRole === 'owner') return false
  if (actorRole === 'owner') return true
  return actorRole === 'admin' && targetRole === 'member'
}

/** Returns the trimmed fields or an error message in Korean. */
function validateGroupEdit(input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  const description = typeof input?.description === 'string' ? input.description.trim() : ''
  if (name.length < 2 || name.length > 40) return { error: '그룹 이름은 2~40자로 입력해 주세요.' }
  if (description.length > 240) return { error: '그룹 소개는 240자 이내로 입력해 주세요.' }
  return { value: { name, description } }
}

const roleOrder = { owner: 0, admin: 1, member: 2 }

function sortMembers(members) {
  return [...members].sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || (a.joinedAt || 0) - (b.joinedAt || 0) || a.nickname.localeCompare(b.nickname, 'ko'))
}

// What a pin keeps when its group disappears: private-group pins become the author's own,
// public-group pins stay public. Either way the group link is cleared.
function postAfterGroupDeleted(post) {
  return { groupId: '', visibility: post.visibility === 'group' ? 'private' : post.visibility }
}

// A ban keeps who it was and who decided, so the list still reads well if the profile changes later.
function banRecord(person, bannedBy) {
  return { uid: person.uid, nickname: person.nickname || '멤버', photoURL: person.photoURL || '', bannedBy }
}

function sortBans(bans) {
  return [...bans].sort((a, b) => (b.bannedAt || 0) - (a.bannedAt || 0) || a.nickname.localeCompare(b.nickname, 'ko'))
}

module.exports = { GROUP_CHAT_PREFIX, groupChatId, isValidId, groupRole, canManage, canRemoveMember, validateGroupEdit, sortMembers, postAfterGroupDeleted, banRecord, sortBans }
