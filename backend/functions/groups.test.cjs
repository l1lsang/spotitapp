const assert = require('node:assert/strict')
const test = require('node:test')
const { groupChatId, groupRole, canManage, canRemoveMember, validateGroupEdit, sortMembers, postAfterGroupDeleted, banRecord, sortBans } = require('./groupsCore')

test('each group has one fixed chat room id', () => {
  assert.equal(groupChatId('abc'), 'group_abc')
})

test('roles come from the owner and the co-admin list', () => {
  const group = { ownerUid: 'o', adminUids: ['a'] }
  assert.equal(groupRole(group, 'o'), 'owner')
  assert.equal(groupRole(group, 'a'), 'admin')
  assert.equal(groupRole(group, 'm'), 'member')
  assert.equal(groupRole({ ownerUid: 'o' }, 'm'), 'member')
  assert.equal(canManage('owner'), true)
  assert.equal(canManage('admin'), true)
  assert.equal(canManage('member'), false)
})

test('co-admins remove members only; nobody removes the owner', () => {
  assert.equal(canRemoveMember('owner', 'admin'), true)
  assert.equal(canRemoveMember('owner', 'member'), true)
  assert.equal(canRemoveMember('admin', 'member'), true)
  assert.equal(canRemoveMember('admin', 'admin'), false)
  assert.equal(canRemoveMember('admin', 'owner'), false)
  assert.equal(canRemoveMember('owner', 'owner'), false)
  assert.equal(canRemoveMember('member', 'member'), false)
})

test('group edits are trimmed and length-checked', () => {
  assert.deepEqual(validateGroupEdit({ name: '  책방 모임 ', description: ' 소개 ' }), { value: { name: '책방 모임', description: '소개' } })
  assert.ok(validateGroupEdit({ name: 'a', description: '' }).error)
  assert.ok(validateGroupEdit({ name: '책방', description: 'x'.repeat(241) }).error)
  assert.ok(validateGroupEdit(null).error)
})

test('members list owner first, then co-admins, then by join time', () => {
  const sorted = sortMembers([
    { uid: 'm2', role: 'member', joinedAt: 3, nickname: '다' },
    { uid: 'a', role: 'admin', joinedAt: 5, nickname: '나' },
    { uid: 'm1', role: 'member', joinedAt: 2, nickname: '라' },
    { uid: 'o', role: 'owner', joinedAt: 1, nickname: '가' },
  ])
  assert.deepEqual(sorted.map(member => member.uid), ['o', 'a', 'm1', 'm2'])
})

test('pins survive their group: private-group pins become private', () => {
  assert.deepEqual(postAfterGroupDeleted({ visibility: 'group', groupId: 'g' }), { groupId: '', visibility: 'private' })
  assert.deepEqual(postAfterGroupDeleted({ visibility: 'public', groupId: 'g' }), { groupId: '', visibility: 'public' })
})

test('ban records keep the name and who banned; newest first', () => {
  assert.deepEqual(banRecord({ uid: 'x', nickname: '', photoURL: undefined }, 'o'), { uid: 'x', nickname: '멤버', photoURL: '', bannedBy: 'o' })
  const sorted = sortBans([{ uid: 'a', nickname: '가', bannedAt: 1 }, { uid: 'b', nickname: '나', bannedAt: 5 }, { uid: 'c', nickname: '다', bannedAt: 0 }])
  assert.deepEqual(sorted.map(item => item.uid), ['b', 'a', 'c'])
})
