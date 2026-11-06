const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const { FieldPath, FieldValue } = require('firebase-admin/firestore')
const { groupChatId, isValidId, groupRole, canManage, canRemoveMember, validateGroupEdit, sortMembers, postAfterGroupDeleted, banRecord, sortBans } = require('./groupsCore')

const db = admin.firestore()
const options = { region: 'us-central1', maxInstances: 10 }
const ALREADY_EXISTS = 6
const NOT_FOUND = 5

function requireUid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인 후 이용해 주세요.')
  return request.auth.uid
}

function requireId(value, label) {
  if (!isValidId(value)) throw new HttpsError('invalid-argument', `${label}을(를) 확인해 주세요.`)
  return value
}

async function participantOf(uid) {
  const data = (await db.doc(`users/${uid}`).get()).data() || {}
  return { uid, nickname: data.nickname || '멤버', photoURL: data.photoURL || '' }
}

// The room is created from the member list the first time it is needed, which also
// covers groups made before group rooms existed.
async function ensureGroupChat(groupId, group) {
  const ref = db.doc(`chats/${groupChatId(groupId)}`)
  if ((await ref.get()).exists) return ref
  const memberIds = (await db.collection(`groups/${groupId}/members`).get()).docs.map(item => item.id).sort()
  const participants = Object.fromEntries(await Promise.all(memberIds.map(async uid => [uid, await participantOf(uid)])))
  try {
    await ref.create({
      id: ref.id, kind: 'group', groupId, name: group.name, ownerUid: group.ownerUid,
      participantIds: memberIds, participants, lastMessage: '', lastMessageUid: '', lastMessageAt: null,
      readAtBy: {}, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })
  } catch (error) {
    if (error.code !== ALREADY_EXISTS) throw error
  }
  return ref
}

async function addToChat(chatRef, uid) {
  await chatRef.update('participantIds', FieldValue.arrayUnion(uid), new FieldPath('participants', uid), await participantOf(uid))
}

async function removeFromChat(chatRef, uid) {
  try {
    await chatRef.update('participantIds', FieldValue.arrayRemove(uid), new FieldPath('participants', uid), FieldValue.delete(), new FieldPath('readAtBy', uid), FieldValue.delete())
  } catch (error) {
    if (error.code !== NOT_FOUND) throw error
  }
}

// Joining a group joins its room; leaving or being removed leaves it.
exports.syncGroupChatMembership = onDocumentWritten({ ...options, document: 'groups/{groupId}/members/{uid}', retry: true }, async event => {
  const { groupId, uid } = event.params
  const before = event.data?.before?.exists
  const after = event.data?.after?.exists
  if (before === after) return
  const chatRef = db.doc(`chats/${groupChatId(groupId)}`)
  if (!after) { await removeFromChat(chatRef, uid); return }
  const group = await db.doc(`groups/${groupId}`).get()
  // The owner's membership is written in the same batch as the group, so the group exists here;
  // a missing group means it is being deleted.
  if (!group.exists) return
  // Skip events for a membership that has since been removed again.
  if (!(await db.doc(`groups/${groupId}/members/${uid}`).get()).exists) return
  await addToChat(await ensureGroupChat(groupId, group.data()), uid)
})

async function loadGroup(groupId) {
  const snapshot = await db.doc(`groups/${groupId}`).get()
  if (!snapshot.exists) throw new HttpsError('not-found', '그룹을 찾을 수 없습니다.')
  return snapshot.data()
}

async function requireMember(groupId, uid) {
  if (!(await db.doc(`groups/${groupId}/members/${uid}`).get()).exists) throw new HttpsError('permission-denied', '그룹 멤버만 이용할 수 있습니다.')
}

exports.openGroupChat = onCall(options, async request => {
  const uid = requireUid(request)
  const groupId = requireId(request.data?.groupId, '그룹')
  const group = await loadGroup(groupId)
  await requireMember(groupId, uid)
  const chatRef = await ensureGroupChat(groupId, group)
  const chat = (await chatRef.get()).data()
  if (!chat.participantIds.includes(uid)) await addToChat(chatRef, uid)
  return { chatId: chatRef.id }
})

async function deleteGroup(groupId, group) {
  // Pins outlive their group; see postAfterGroupDeleted.
  const posts = await db.collection('posts').where('groupId', '==', groupId).get()
  const writer = db.bulkWriter()
  posts.docs.forEach(post => writer.update(post.ref, postAfterGroupDeleted(post.data())))
  const members = await db.collection(`groups/${groupId}/members`).get()
  members.docs.forEach(member => writer.delete(db.doc(`users/${member.id}/groupMemberships/${groupId}`)))
  const invite = await db.doc(`groups/${groupId}/private/invite`).get()
  if (invite.exists && invite.data().code) writer.delete(db.doc(`groupInvites/${invite.data().code}`))
  await writer.close()
  // The room goes first so membership triggers fired by the group deletion find nothing to update.
  await db.recursiveDelete(db.doc(`chats/${groupChatId(groupId)}`))
  await db.recursiveDelete(db.doc(`groups/${groupId}`))
  logger.info('group deleted', { groupId, ownerUid: group.ownerUid, posts: posts.size, members: members.size })
}

exports.manageGroup = onCall({ ...options, timeoutSeconds: 300 }, async request => {
  const uid = requireUid(request)
  const groupId = requireId(request.data?.groupId, '그룹')
  const action = request.data?.action
  const groupRef = db.doc(`groups/${groupId}`)
  const group = await loadGroup(groupId)
  await requireMember(groupId, uid)
  const role = groupRole(group, uid)
  if (!canManage(role)) throw new HttpsError('permission-denied', '그룹장과 관리자만 그룹을 관리할 수 있습니다.')

  if (action === 'listMembers') {
    const members = await db.collection(`groups/${groupId}/members`).get()
    const list = await Promise.all(members.docs.map(async member => {
      const person = await participantOf(member.id)
      return { ...person, role: groupRole(group, member.id), joinedAt: member.data().joinedAt?.toMillis?.() || 0 }
    }))
    return { members: sortMembers(list), viewerRole: role }
  }

  if (action === 'update') {
    const { value, error } = validateGroupEdit(request.data)
    if (error) throw new HttpsError('invalid-argument', error)
    await groupRef.update(value)
    const chatRef = db.doc(`chats/${groupChatId(groupId)}`)
    if ((await chatRef.get()).exists) await chatRef.update({ name: value.name })
    return { ok: true }
  }

  if (action === 'setAdmin') {
    if (role !== 'owner') throw new HttpsError('permission-denied', '관리자 지정은 그룹장만 할 수 있습니다.')
    const target = requireId(request.data?.uid, '멤버')
    if (target === group.ownerUid) throw new HttpsError('invalid-argument', '그룹장은 이미 모든 권한이 있습니다.')
    await requireMember(groupId, target)
    await groupRef.update({ adminUids: request.data?.admin ? FieldValue.arrayUnion(target) : FieldValue.arrayRemove(target) })
    return { ok: true }
  }

  // With ban: true the person also lands on the group's ban list, which firestore.rules
  // checks on every join, invite code or not.
  if (action === 'removeMember') {
    const target = requireId(request.data?.uid, '멤버')
    const ban = request.data?.ban === true
    if (target === uid) throw new HttpsError('invalid-argument', '나가려면 그룹 탈퇴를 이용해 주세요.')
    if (!canRemoveMember(role, groupRole(group, target))) throw new HttpsError('permission-denied', '이 멤버를 내보낼 권한이 없습니다.')
    const memberRef = db.doc(`groups/${groupId}/members/${target}`)
    const person = ban ? await participantOf(target) : null
    await db.runTransaction(async transaction => {
      const member = await transaction.get(memberRef)
      if (ban) transaction.set(db.doc(`groups/${groupId}/bans/${target}`), { ...banRecord(person, uid), createdAt: FieldValue.serverTimestamp() })
      if (!member.exists) return
      transaction.delete(memberRef)
      transaction.delete(db.doc(`users/${target}/groupMemberships/${groupId}`))
      transaction.update(groupRef, { memberCount: FieldValue.increment(-1), adminUids: FieldValue.arrayRemove(target) })
    })
    return { ok: true }
  }

  if (action === 'listBans') {
    const bans = await db.collection(`groups/${groupId}/bans`).limit(500).get()
    return {
      bans: sortBans(bans.docs.map(item => {
        const data = item.data()
        return { uid: item.id, nickname: data.nickname || '멤버', photoURL: data.photoURL || '', bannedAt: data.createdAt?.toMillis?.() || 0 }
      })),
    }
  }

  if (action === 'unban') {
    const target = requireId(request.data?.uid, '사용자')
    await db.doc(`groups/${groupId}/bans/${target}`).delete()
    return { ok: true }
  }

  if (action === 'delete') {
    if (role !== 'owner') throw new HttpsError('permission-denied', '그룹 삭제는 그룹장만 할 수 있습니다.')
    if (request.data?.confirmName !== group.name) throw new HttpsError('invalid-argument', '확인을 위해 그룹 이름을 정확히 입력해 주세요.')
    await deleteGroup(groupId, group)
    return { ok: true }
  }

  throw new HttpsError('invalid-argument', '지원하지 않는 요청입니다.')
})
