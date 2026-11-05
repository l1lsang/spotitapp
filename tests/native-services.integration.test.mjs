import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, webcrypto, createHash } from 'node:crypto'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import ts from 'typescript'
import { initializeApp, deleteApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'
import * as authSdk from 'firebase/auth'
import * as storageSdk from 'firebase/storage'
import searchIndex from '../backend/functions/userSearchCore.js'
import postSearchIndex from '../backend/functions/postSearchCore.js'

// Fail before creating a client unless the dedicated local emulator runner set
// both endpoints. This suite never reads the app's .env or production config.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-spotit-native', 'Run only through the dedicated emulator command')
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8281')
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9291')
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9391')
firestore.setLogLevel('silent')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apps = []
const denied = error => error.code === 'permission-denied'
const requirements = { birthDate: '2000-01-01', termsAccepted: true, privacyAccepted: true, locationAccepted: true }
after(async () => { await Promise.all(apps.map(deleteApp)) })

async function account(nickname, complete = true) {
  const app = initializeApp({ projectId: 'demo-spotit-native', apiKey: 'demo-native-key', storageBucket: 'demo-spotit-native.appspot.com' }, randomUUID())
  apps.push(app)
  const auth = authSdk.getAuth(app)
  const db = firestore.getFirestore(app)
  authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9291', { disableWarnings: true })
  firestore.connectFirestoreEmulator(db, '127.0.0.1', 8281)
  const storage = storageSdk.getStorage(app)
  storageSdk.connectStorageEmulator(storage, '127.0.0.1', 9391)
  const modules = new Map()
  const stubs = {
    'firebase/auth': authSdk,
    'firebase/firestore': firestore,
    'expo-constants': { default: { appOwnership: 'expo' } },
    'react-native': { Platform: { OS: 'android' } },
    'expo-crypto': { randomUUID, getRandomValues: data => webcrypto.getRandomValues(data), CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async (_algorithm, value) => createHash('sha256').update(value).digest('hex') },
    [resolve(root, 'src/lib/firebase.ts')]: { requireAuth: () => auth, requireDb: () => db, requireStorage: () => { throw new Error('Native uploads are not exercised by this emulator suite') } },
    [resolve(root, 'src/services/storageService.ts')]: { uploadPostPhotosWithThumbnails: () => { throw new Error('No image uploads in this test') } },
    [resolve(root, 'src/services/pushNotificationService.ts')]: { disablePushNotifications: async () => {} },
  }
  async function load(id) {
    if (modules.has(id)) return modules.get(id)
    const exports = stubs[id]
    const module = exports ? new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
    }, { identifier: id }) : new SourceTextModule(ts.transpileModule(await readFile(id, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    }).outputText, { identifier: id })
    modules.set(id, module)
    return module
  }
  async function service(name) {
    const module = await load(resolve(root, `src/services/${name}Service.ts`))
    if (module.status === 'unlinked') await module.link((specifier, parent) => load(specifier.startsWith('.') ? resolve(dirname(parent.identifier), `${specifier}.ts`) : specifier))
    if (module.status !== 'evaluated') await module.evaluate()
    return module.namespace
  }
  const session = await service('auth')
  const users = await service('user')
  const email = `${randomUUID()}@native.example.test`
  const user = await session.signupWithEmail(email, 'native-test-password', requirements)
  await users.upsertUserProfile(user)
  const actor = { uid: user.uid, nickname, photoURL: '' }
  if (complete) await users.updateUserProfileDetails(user.uid, { nickname, username: randomUUID().replaceAll('-', '').slice(0, 24), bio: '네이티브 앱 에뮬레이터 테스트' }, requirements)
  return { app, db, auth, storage, uid: user.uid, user, email, actor, users, session, service }
}

const input = (groupId = '') => ({ groupId, title: '함께 기억하는 장소', content: '앱 데이터 저장 테스트', placeName: '서울숲', address: '서울 성동구', lat: 37.5445, lng: 127.0374, dateKey: '2026-09-13', visibility: 'followers', pinColor: '#356f68' })
const postRef = (client, id) => firestore.doc(client.db, 'posts', id)
function observe(subscribe, predicate) {
  return new Promise((resolve, reject) => {
    let stop = () => {}
    const timer = setTimeout(() => { stop(); reject(new Error('Realtime subscription timed out')) }, 15000)
    stop = subscribe(value => { if (predicate(value)) { clearTimeout(timer); stop(); resolve(value) } }, error => { clearTimeout(timer); stop(); reject(error) })
  })
}

test('native email signup enforces onboarding and persists an account that can log in again', { timeout: 60000 }, async () => {
  const client = await account('새 회원', false)
  assert.equal((await client.users.getUserProfile(client.uid, true)).onboardingComplete, false)
  const posts = await client.service('post')
  await assert.rejects(posts.getVisiblePostPage(client.uid), denied)
  await assert.rejects(posts.createPost(input(), [], client.actor), denied)
  await assert.rejects(client.session.signupWithEmail('underage@example.test', 'native-test-password', { ...requirements, birthDate: '2020-01-01' }), /14세/)
  await client.users.updateUserProfileDetails(client.uid, { username: randomUUID().replaceAll('-', '').slice(0, 24), nickname: client.actor.nickname, bio: '' }, requirements)
  const profile = await client.users.getUserProfile(client.uid, true)
  assert.equal(profile.onboardingComplete, true)
  assert.deepEqual((await posts.getVisiblePostPage(client.uid)).posts, [])
  await client.session.logout()
  assert.equal(client.auth.currentUser, null)
  assert.equal((await client.session.loginWithEmail(client.email, 'native-test-password')).uid, client.uid)
})

test('release notices are public before login, update live and cannot be published by app clients', { timeout: 60000 }, async () => {
  const client = await account('업데이트 확인', false)
  const releases = await client.service('appRelease')
  const android = firestore.doc(client.db, 'appReleases', 'android')
  const ios = firestore.doc(client.db, 'appReleases', 'ios')
  const initial = { version: '1.10.0', url: 'https://downloads.example.test/spotit.apk', message: '새로운 앱 버전이 나왔습니다.' }

  // The owner bypass is accepted only by this dedicated demo emulator.
  async function publish(platform, data) {
    const url = `http://127.0.0.1:8281/v1/projects/demo-spotit-native/databases/(default)/documents/appReleases/${platform}`
    const response = await fetch(url, {
      method: data ? 'PATCH' : 'DELETE',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value }])) }) } : {}),
    })
    assert.equal(response.status, 200)
  }
  await publish('android', initial)
  assert.deepEqual((await firestore.getDocFromServer(android)).data(), initial)

  async function assertReadOnly() {
    await assert.rejects(firestore.setDoc(ios, initial), denied)
    await assert.rejects(firestore.updateDoc(android, { version: '99.0.0' }), denied)
    await assert.rejects(firestore.deleteDoc(android), denied)
    await assert.rejects(firestore.getDocs(firestore.collection(client.db, 'appReleases')), denied)
    await assert.rejects(firestore.getDocs(firestore.query(firestore.collection(client.db, 'appReleases'), firestore.where(firestore.documentId(), '==', 'android'))), denied)
    await assert.rejects(firestore.getDocFromServer(firestore.doc(client.db, 'appReleases', 'web')), denied)
    await assert.rejects(firestore.getDocFromServer(firestore.doc(client.db, 'appReleases', 'android', 'private', 'details')), denied)
  }
  await assertReadOnly()
  await client.session.logout()
  assert.equal(client.auth.currentUser, null)
  assert.deepEqual((await firestore.getDocFromServer(android)).data(), initial)
  assert.deepEqual(await observe((next, fail) => releases.subscribeToAppRelease('android', next, fail), value => value?.version === initial.version), initial)
  assert.equal(await observe((next, fail) => releases.subscribeToAppRelease('ios', next, fail), value => value === null), null)
  await assertReadOnly()
  await assert.rejects(firestore.getDocFromServer(firestore.doc(client.db, 'users', client.uid)), denied)
  await assert.rejects(firestore.getDocFromServer(firestore.doc(client.db, 'moderationUsers', client.uid)), denied)

  // An offline cache can retain a notice that the publisher has withdrawn.
  await firestore.disableNetwork(client.db)
  const cachedValues = []
  const cachedErrors = []
  const stopOffline = releases.subscribeToAppRelease('android', value => cachedValues.push(value), error => cachedErrors.push(error))
  try {
    await observe((next, fail) => firestore.onSnapshot(android, { includeMetadataChanges: true }, next, fail), snapshot => snapshot.metadata.fromCache && snapshot.exists())
    assert.deepEqual(cachedValues, [])
    assert.deepEqual(cachedErrors, [])
  } finally {
    stopOffline()
    await firestore.enableNetwork(client.db)
  }

  async function changeAndObserve(data, predicate) {
    const live = observe((next, fail) => releases.subscribeToAppRelease('android', next, fail), predicate)
    void live.catch(() => {})
    await publish('android', data)
    return live
  }
  const newer = { ...initial, version: '1.11.0' }
  assert.deepEqual(await changeAndObserve(newer, value => value?.version === newer.version), newer)
  assert.equal(await changeAndObserve({ ...newer, enabled: false }, value => value === null), null)
  assert.deepEqual(await changeAndObserve(newer, value => value?.version === newer.version), newer)
  assert.equal(await changeAndObserve({ ...newer, url: 'javascript:alert(1)' }, value => value === null), null)
  assert.deepEqual(await changeAndObserve(newer, value => value?.version === newer.version), newer)
  assert.equal(await changeAndObserve(null, value => value === null), null)

  const iosRelease = { ...initial, url: 'https://apps.apple.com/kr/app/id1234567890' }
  await publish('ios', iosRelease)
  assert.deepEqual((await firestore.getDocFromServer(ios)).data(), iosRelease)
  assert.deepEqual(await observe((next, fail) => releases.subscribeToAppRelease('ios', next, fail), value => value?.version === initial.version), iosRelease)
})

test('private groups preserve invite access, private pin isolation, reactions and access revocation', { timeout: 60000 }, async () => {
  const [owner, member, outsider] = await Promise.all(['그룹 작성자', '가입 멤버', '외부 사용자'].map(name => account(name)))
  const groups = await owner.service('group')
  const memberGroups = await member.service('group')
  const ownerPosts = await owner.service('post')
  const memberPosts = await member.service('post')
  const outsiderPosts = await outsider.service('post')
  const groupId = await groups.createGroup({ name: '앱 비공개 그룹', description: '멤버만 보는 장소', visibility: 'private' }, owner.uid)
  const code = await groups.getGroupInviteCode(groupId)
  await assert.rejects(firestore.getDoc(firestore.doc(outsider.db, 'groups', groupId)), denied)
  await assert.rejects(memberGroups.setGroupMembership(groupId, member.uid, true), denied)
  assert.equal(await memberGroups.joinGroupWithCode(code.toLowerCase().match(/.{4}/g).join(' - '), member.uid), groupId)
  const pinId = await ownerPosts.createPost(input(groupId), [], owner.actor)
  assert.equal((await firestore.getDoc(postRef(owner, pinId))).data().visibility, 'group')
  await assert.rejects(firestore.getDoc(postRef(outsider, pinId)), denied)
  assert.equal((await memberPosts.getPostById(pinId, member.uid)).id, pinId)
  assert.ok(!(await outsiderPosts.getVisiblePosts(outsider.uid)).some(post => post.id === pinId))
  const likes = await member.service('like')
  const comments = await member.service('comment')
  assert.equal(await likes.togglePostLike(pinId, member.actor), true)
  await comments.addComment(pinId, member.actor, '앱에서 남긴 댓글')
  const thread = await comments.listComments(pinId)
  assert.equal(thread[0].content, '앱에서 남긴 댓글')
  await comments.addReply(pinId, thread[0].id, member.actor, '앱에서 남긴 답글')
  // replyCount stays 0 here: counts are recounted by server functions, which this suite does not run.
  assert.equal((await comments.listComments(pinId))[0].replies[0].content, '앱에서 남긴 답글')
  assert.ok((await firestore.getDoc(firestore.doc(owner.db, 'posts', pinId, 'likes', member.uid))).exists())
  for (const data of [{ likeCount: 99 }, { commentCount: 99 }, { likeCount: 1, updatedAt: firestore.serverTimestamp() }]) {
    await assert.rejects(firestore.updateDoc(postRef(member, pinId), data), denied)
    await assert.rejects(firestore.updateDoc(postRef(owner, pinId), data), denied)
  }
  const commentRef = client => firestore.doc(client.db, 'posts', pinId, 'comments', thread[0].id)
  await assert.rejects(firestore.updateDoc(commentRef(member), { replyCount: 0 }), denied)
  await assert.rejects(firestore.updateDoc(commentRef(owner), { replyCount: 7 }), denied)
  await comments.deleteComment(pinId, thread[0].id, member.uid)
  const marked = (await firestore.getDoc(commentRef(member))).data()
  assert.equal(marked.deleted, true)
  assert.equal(marked.content, '')
  await assert.rejects(comments.addReply(pinId, thread[0].id, member.actor, '삭제된 댓글에 남긴 답글'), /삭제된 댓글/)
  await memberGroups.setGroupMembership(groupId, member.uid, false)
  await assert.rejects(firestore.getDoc(postRef(member, pinId)), denied)
  await assert.rejects(likes.togglePostLike(pinId, member.actor), denied)
  assert.equal((await firestore.getDoc(firestore.doc(owner.db, 'groups', groupId))).data().memberCount, 1)
})

test('profiles keep no sign-in email and member search reads only the server-built index', { timeout: 60000 }, async () => {
  const [viewer, target] = await Promise.all([account('검색하는 회원'), account('검색될 김지민')])
  const profile = client => firestore.doc(client.db, 'users', target.uid)
  assert.equal('email' in (await firestore.getDoc(profile(viewer))).data(), false)
  await assert.rejects(firestore.updateDoc(profile(target), { searchTokens: ['김'] }), denied)
  // Results are cached per query for 30 seconds, so the indexed search below uses another query.
  assert.deepEqual(await viewer.users.searchUsers('김지민'), [])

  // Only the local emulator accepts this bypass. Store the index as syncUserProfile would.
  const tokens = searchIndex.buildUserSearchTokens((await firestore.getDoc(profile(target))).data())
  const url = `http://127.0.0.1:8281/v1/projects/demo-spotit-native/databases/(default)/documents/users/${target.uid}?updateMask.fieldPaths=searchTokens`
  const response = await fetch(url, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { searchTokens: { arrayValue: { values: tokens.map(stringValue => ({ stringValue })) } } } }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual((await viewer.users.searchUsers('지민')).map(user => user.uid), [target.uid])
  assert.deepEqual((await viewer.users.searchUsers('없는 이름')), [])
  assert.deepEqual((await viewer.users.getUsersByIds([target.uid, target.uid])).map(user => user.uid), [target.uid])
  // The owner's own profile edits keep working with the server field present.
  await target.users.updateUserNickname(target.uid, '검색될 박지민')
})

test('feed search reaches earlier visible pins through the server-built index only', { timeout: 60000 }, async () => {
  const [viewer, author] = await Promise.all([account('피드 검색 회원'), account('검색될 작성자')])
  const follow = await viewer.service('follow')
  await follow.followUser({ ...viewer.actor, isPrivate: false }, { ...author.actor, isPrivate: false })
  const authorPosts = await author.service('post')
  const shared = await authorPosts.createPost({ ...input(), title: '성수 골목 산책', placeName: '성수 카페거리' }, [], author.actor)
  const hidden = await authorPosts.createPost({ ...input(), title: '성수 비밀 장소', visibility: 'private' }, [], author.actor)
  const stored = (await firestore.getDoc(postRef(author, shared))).data()
  const copy = randomUUID()
  await assert.rejects(firestore.setDoc(postRef(author, copy), { ...stored, id: copy, searchTokens: ['성수'] }), denied)
  await assert.rejects(firestore.updateDoc(postRef(author, shared), { searchTokens: ['성수'] }), denied)

  // Only the local emulator accepts this bypass. Store the index as syncPostSearchTokens would.
  for (const id of [shared, hidden]) {
    const tokens = postSearchIndex.buildPostSearchTokens((await firestore.getDoc(postRef(author, id))).data())
    const url = `http://127.0.0.1:8281/v1/projects/demo-spotit-native/databases/(default)/documents/posts/${id}?updateMask.fieldPaths=searchTokens`
    const response = await fetch(url, {
      method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { searchTokens: { arrayValue: { values: tokens.map(stringValue => ({ stringValue })) } } } }),
    })
    assert.equal(response.status, 200)
  }
  const viewerPosts = await viewer.service('post')
  const found = await viewerPosts.searchVisiblePosts(viewer.uid, '성수 산책')
  assert.deepEqual(found.map(post => post.id), [shared])
  assert.equal('searchTokens' in found[0], false)
  assert.deepEqual(await viewerPosts.searchVisiblePosts(viewer.uid, '없는 장소'), [])
  assert.deepEqual((await authorPosts.searchVisiblePosts(author.uid, '성수')).map(post => post.id).toSorted(), [shared, hidden].toSorted())
  // The owner's edits keep working with the server field present, and a whole-pin
  // overwrite may drop it for the function to rebuild.
  await authorPosts.updatePost(shared, { ...input(), title: '성수 골목 산책 다시' }, [], [], author.uid)
  const { searchTokens, ...rest } = (await firestore.getDoc(postRef(author, shared))).data()
  assert.ok(searchTokens.length > 0)
  await firestore.setDoc(postRef(author, shared), rest)
})

test('native direct chat receives messages live and limits pins/read receipts to participants', { timeout: 60000 }, async () => {
  const [sender, recipient, outsider] = await Promise.all(['발신자', '수신자', '다른 사용자'].map(name => account(name)))
  const senderChats = await sender.service('chat')
  const recipientChats = await recipient.service('chat')
  const outsiderChats = await outsider.service('chat')
  const chatId = await senderChats.getOrCreateDirectChat(sender.actor, recipient.actor)
  const live = observe((next, fail) => recipientChats.subscribeToChatMessages(chatId, next, fail), messages => messages.length === 1)
  void live.catch(() => {})
  await senderChats.sendChatMessage(chatId, sender.actor, '앱에서 보낸 실제 서비스 메시지')
  const messages = await live
  assert.equal(messages[0].content, '앱에서 보낸 실제 서비스 메시지')
  await recipientChats.markChatAsRead(chatId, recipient.uid)
  const chat = await recipientChats.getChatById(chatId, recipient.uid)
  assert.ok(chat.readAtBy[recipient.uid].toMillis() >= messages[0].createdAt.toMillis())
  await recipientChats.setChatMessagePinned(chatId, messages[0].id, recipient.uid, true)
  assert.ok((await senderChats.getChatById(chatId, sender.uid)).pinnedMessageIds.includes(messages[0].id))
  await assert.rejects(firestore.getDocs(firestore.collection(outsider.db, 'chats', chatId, 'messages')), denied)
  await assert.rejects(outsiderChats.setChatMessagePinned(chatId, messages[0].id, outsider.uid, true), denied)
})

test('chat emoji reactions update live, preserve other participants and enforce ownership through account deletion', { timeout: 60000 }, async () => {
  const [sender, recipient, teammate, outsider] = await Promise.all(['반응 작성자', '반응 참여자', '반응 동료', '반응 외부인'].map(name => account(name)))
  const [senderChats, recipientChats, teammateChats, outsiderChats] = await Promise.all([sender, recipient, teammate, outsider].map(client => client.service('chat')))
  const chatId = await senderChats.createGroupChat(sender.actor, [recipient.actor, teammate.actor], '메시지 반응 테스트')
  await senderChats.sendChatMessage(chatId, sender.actor, '기본 이모지로 반응하는 메시지')
  const [message] = await observe((next, fail) => recipientChats.subscribeToChatMessages(chatId, next, fail), messages => messages.length === 1)
  const ref = client => firestore.doc(client.db, 'chats', chatId, 'messages', message.id)
  const ownPath = new firestore.FieldPath('reactionsBy', recipient.uid)
  const senderPath = new firestore.FieldPath('reactionsBy', sender.uid)
  const initialChat = await senderChats.getChatById(chatId, sender.uid)
  assert.equal(message.reactionsBy, undefined)

  async function changeAndObserve(action, expected) {
    const live = observe((next, fail) => recipientChats.subscribeToChatMessages(chatId, next, fail), messages => {
      const reactions = messages.find(item => item.id === message.id)?.reactionsBy || {}
      return Object.keys(reactions).length === Object.keys(expected).length
        && Object.entries(expected).every(([uid, emoji]) => reactions[uid] === emoji)
    })
    void live.catch(() => {})
    await action()
    const changed = (await live).find(item => item.id === message.id)
    assert.deepEqual(changed.reactionsBy || {}, expected)
    assert.equal(changed.content, message.content)
    assert.equal(changed.createdAt.toMillis(), message.createdAt.toMillis())
    return changed
  }

  await changeAndObserve(() => recipientChats.toggleChatMessageReaction(chatId, message.id, recipient.uid, '👍'), { [recipient.uid]: '👍' })
  const combined = await changeAndObserve(() => senderChats.toggleChatMessageReaction(chatId, message.id, sender.uid, '👍'), { [recipient.uid]: '👍', [sender.uid]: '👍' })
  assert.equal(Object.values(combined.reactionsBy).filter(emoji => emoji === '👍').length, 2)
  await changeAndObserve(() => recipientChats.toggleChatMessageReaction(chatId, message.id, recipient.uid, '❤️'), { [recipient.uid]: '❤️', [sender.uid]: '👍' })
  await changeAndObserve(() => recipientChats.toggleChatMessageReaction(chatId, message.id, recipient.uid, '❤️'), { [sender.uid]: '👍' })
  await changeAndObserve(() => senderChats.toggleChatMessageReaction(chatId, message.id, sender.uid, '👍'), {})
  const concurrent = await changeAndObserve(() => Promise.all([
    senderChats.toggleChatMessageReaction(chatId, message.id, sender.uid, '❤️'),
    recipientChats.toggleChatMessageReaction(chatId, message.id, recipient.uid, '👍'),
    teammateChats.toggleChatMessageReaction(chatId, message.id, teammate.uid, '👍'),
  ]), { [sender.uid]: '❤️', [recipient.uid]: '👍', [teammate.uid]: '👍' })
  assert.equal(Object.values(concurrent.reactionsBy).filter(emoji => emoji === '👍').length, 2)

  // Every default option is accepted by the deployed rule contract.
  for (const emoji of ['❤️', '😂', '😮', '😢', '🙏']) {
    await changeAndObserve(() => recipientChats.toggleChatMessageReaction(chatId, message.id, recipient.uid, emoji), {
      [sender.uid]: '❤️', [recipient.uid]: emoji, [teammate.uid]: '👍',
    })
  }
  const unchangedChat = await senderChats.getChatById(chatId, sender.uid)
  assert.equal(unchangedChat.updatedAt.toMillis(), initialChat.updatedAt.toMillis())
  assert.equal(unchangedChat.lastMessageAt.toMillis(), initialChat.lastMessageAt.toMillis())
  assert.equal(unchangedChat.lastMessage, initialChat.lastMessage)

  await assert.rejects(outsiderChats.toggleChatMessageReaction(chatId, message.id, outsider.uid, '👍'), denied)
  await assert.rejects(firestore.updateDoc(ref(outsider), new firestore.FieldPath('reactionsBy', outsider.uid), '👍'), denied)
  await assert.rejects(recipientChats.toggleChatMessageReaction(chatId, message.id, sender.uid, '😂'), denied)
  await assert.rejects(firestore.updateDoc(ref(recipient), senderPath, '😂'), denied)
  await assert.rejects(firestore.updateDoc(ref(recipient), senderPath, firestore.deleteField()), denied)
  await assert.rejects(firestore.updateDoc(ref(recipient), { reactionsBy: { [recipient.uid]: '👍' } }), denied)
  await assert.rejects(firestore.updateDoc(ref(recipient), { reactionsBy: firestore.deleteField() }), denied)
  for (const invalid of ['🔥', '', null, 1, ['👍'], { emoji: '👍' }]) {
    await assert.rejects(firestore.updateDoc(ref(recipient), ownPath, invalid), denied)
  }
  for (const invalid of [null, [], '👍']) {
    await assert.rejects(firestore.updateDoc(ref(recipient), { reactionsBy: invalid }), denied)
  }
  for (const [field, value] of [['content', '위조한 내용'], ['uid', recipient.uid], ['authorNickname', '위조 이름'], ['createdAt', firestore.serverTimestamp()], ['photoUrl', 'https://example.test/forged.jpg'], ['extraField', true]]) {
    await assert.rejects(firestore.updateDoc(ref(recipient), ownPath, '😂', field, value), denied)
  }
  await assert.rejects(recipientChats.toggleChatMessageReaction(chatId, message.id, recipient.uid, '🔥'), /지원하지 않는/)
  await assert.rejects(recipientChats.toggleChatMessageReaction(chatId, 'missing-message', recipient.uid, '👍'), /반응할 수 없는/)
  for (const reactionsBy of [{ [sender.uid]: '👍' }, { [recipient.uid]: '👍' }, ['👍'], null]) {
    await assert.rejects(firestore.setDoc(firestore.doc(recipient.db, 'chats', chatId, 'messages', randomUUID()), {
      chatId, uid: recipient.uid, authorNickname: recipient.actor.nickname, content: '위조한 반응', reactionsBy, createdAt: firestore.serverTimestamp(),
    }), denied)
  }

  await recipientChats.sendChatMessage(chatId, recipient.actor, '탈퇴 시 반응도 정리할 메시지')
  const ownMessages = await firestore.getDocs(firestore.query(firestore.collection(recipient.db, 'chats', chatId, 'messages'), firestore.where('uid', '==', recipient.uid)))
  const ownMessageId = ownMessages.docs[0].id
  await senderChats.toggleChatMessageReaction(chatId, ownMessageId, sender.uid, '👍')
  await recipientChats.toggleChatMessageReaction(chatId, ownMessageId, recipient.uid, '❤️')
  await recipient.users.deleteUserAccountData(recipient.uid)
  const preserved = (await firestore.getDoc(ref(sender))).data().reactionsBy
  assert.deepEqual(preserved, { [sender.uid]: '❤️', [teammate.uid]: '👍' })
  const deletedRef = firestore.doc(sender.db, 'chats', chatId, 'messages', ownMessageId)
  const deleted = (await firestore.getDoc(deletedRef)).data()
  assert.equal(deleted.uid, 'deleted-user')
  assert.deepEqual(deleted.reactionsBy, {})
  await assert.rejects(senderChats.toggleChatMessageReaction(chatId, ownMessageId, sender.uid, '👍'), /반응할 수 없는/)
  await assert.rejects(firestore.updateDoc(deletedRef, senderPath, '👍'), denied)
})

test('new native token rules allow only the owner and valid Expo token values', { timeout: 60000 }, async () => {
  const [owner, outsider] = await Promise.all([account('기기 소유자'), account('타인')])
  const path = ['users', owner.uid, 'expoPushTokens', 'device']
  const token = { token: 'ExpoPushToken[emulator-device-token]', platform: 'android' }
  await firestore.setDoc(firestore.doc(owner.db, ...path), token)
  await assert.rejects(firestore.getDoc(firestore.doc(outsider.db, ...path)), denied)
  await assert.rejects(firestore.setDoc(firestore.doc(outsider.db, ...path), token), denied)
  await assert.rejects(firestore.setDoc(firestore.doc(owner.db, ...path), { token: 'not-an-expo-token' }), denied)
  await assert.rejects(firestore.setDoc(firestore.doc(owner.db, 'nativePushQueue', 'forged'), { state: 'pending' }), denied)
  await firestore.deleteDoc(firestore.doc(owner.db, ...path))
  assert.equal((await firestore.getDoc(firestore.doc(owner.db, ...path))).exists(), false)
})

test('first-map queries work for a legacy web profile and multiple following batches', { timeout: 60000 }, async () => {
  const viewer = await account('기존 웹 회원')
  // Only the local emulator accepts this bypass. Model a pre-onboarding web profile.
  const legacyUrl = `http://127.0.0.1:8281/v1/projects/demo-spotit-native/databases/(default)/documents/users/${viewer.uid}?updateMask.fieldPaths=onboardingComplete&updateMask.fieldPaths=registrationRequired`
  const response = await fetch(legacyUrl, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) })
  assert.equal(response.status, 200)
  const profile = await viewer.users.upsertUserProfile(viewer.user)
  assert.equal(profile.onboardingComplete, undefined)
  await viewer.users.saveUserPinTheme(viewer.uid, { id: 'travel', name: '여행', color: '#356f68' })
  const authors = await Promise.all(Array.from({ length: 6 }, (_, i) => account(`친구 ${i + 1}`)))
  const follow = await viewer.service('follow')
  const expected = []
  for (const author of authors) {
    await follow.followUser({ ...viewer.actor, isPrivate: false }, { ...author.actor, isPrivate: false })
    const posts = await author.service('post')
    expected.push(await posts.createPost(input(), [], author.actor))
    await posts.createPost({ ...input(), visibility: 'private' }, [], author.actor)
  }
  const posts = await viewer.service('post')
  expected.push(await posts.createPost({ ...input(), visibility: 'private' }, [], viewer.actor))
  const loaded = []
  let cursor = null
  do {
    const page = await posts.getVisiblePostPage(viewer.uid, cursor, 3)
    loaded.push(...page.posts.map(post => post.id))
    cursor = page.nextCursor
  } while (cursor)
  assert.deepEqual(loaded.toSorted(), expected.toSorted())
  const groups = await viewer.service('group')
  await observe((next, fail) => groups.subscribeGroups(next, fail), Array.isArray)
  assert.deepEqual(await observe((next, fail) => groups.subscribeMyGroupIds(viewer.uid, next, fail), Array.isArray), [])
})

const mediaDenied = error => error.code === 'storage/unauthorized'
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
const mediaRef = (client, path) => storageSdk.ref(client.storage, path)
const upload = (client, path, bytes = jpeg, contentType = 'image/jpeg') => storageSdk.uploadBytes(mediaRef(client, path), bytes, { contentType })

test('shared media rules permit staged uploads and protect private posts and group membership', { timeout: 60000 }, async () => {
  const [owner, member, outsider, onboarding] = await Promise.all([account('사진 주인'), account('사진 멤버'), account('사진 외부'), account('가입 중', false)])
  await upload(onboarding, `profiles/${onboarding.uid}/avatar.jpg`)
  await assert.rejects(upload(onboarding, `posts/${onboarding.uid}/staged/p.jpg`), mediaDenied)
  await assert.rejects(upload(outsider, `profiles/${owner.uid}/avatar.jpg`), mediaDenied)
  await assert.rejects(upload(owner, `profiles/${owner.uid}/large.jpg`, new Uint8Array(5 * 1024 * 1024 + 1)), mediaDenied)
  await assert.rejects(upload(owner, `profiles/${owner.uid}/script.html`, jpeg, 'text/html'), mediaDenied)

  const path = `posts/${owner.uid}/staged/photo.jpg`
  await upload(owner, path)
  assert.ok((await storageSdk.getDownloadURL(mediaRef(owner, path))).startsWith('http://127.0.0.1:9391/'))
  await assert.rejects(storageSdk.getBytes(mediaRef(outsider, path)), mediaDenied)
  await assert.rejects(upload(outsider, path), mediaDenied)
  const posts = await owner.service('post')
  const privateId = await posts.createPost({ ...input(), visibility: 'private' }, [], owner.actor)
  const privatePath = `posts/${owner.uid}/${privateId}/photo.jpg`
  await upload(owner, privatePath)
  assert.equal((await storageSdk.getBytes(mediaRef(owner, privatePath))).byteLength, jpeg.byteLength)
  await assert.rejects(storageSdk.getBytes(mediaRef(outsider, privatePath)), mediaDenied)

  const groups = await owner.service('group')
  const memberGroups = await member.service('group')
  const groupId = await groups.createGroup({ name: '사진 그룹', description: '', visibility: 'private' }, owner.uid)
  await memberGroups.joinGroupWithCode(await groups.getGroupInviteCode(groupId), member.uid)
  const groupPostId = await posts.createPost(input(groupId), [], owner.actor)
  const groupPath = `posts/${owner.uid}/${groupPostId}/photo.jpg`
  await upload(owner, groupPath)
  assert.equal((await storageSdk.getBytes(mediaRef(member, groupPath))).byteLength, jpeg.byteLength)
  await assert.rejects(storageSdk.getBytes(mediaRef(outsider, groupPath)), mediaDenied)
  await memberGroups.setGroupMembership(groupId, member.uid, false)
  await assert.rejects(storageSdk.getBytes(mediaRef(member, groupPath)), mediaDenied)
  const chats = await owner.service('chat')
  const chatId = await chats.getOrCreateDirectChat(owner.actor, member.actor)
  const chatPath = `chats/${chatId}/${owner.uid}/photo.jpg`
  await upload(owner, chatPath)
  assert.equal((await storageSdk.getBytes(mediaRef(member, chatPath))).byteLength, jpeg.byteLength)
  await assert.rejects(upload(outsider, `chats/${chatId}/${outsider.uid}/photo.jpg`), mediaDenied)
  await assert.rejects(storageSdk.getBytes(mediaRef(outsider, chatPath)), mediaDenied)
  await assert.rejects(storageSdk.listAll(storageSdk.ref(owner.storage)), mediaDenied)
})


test('pin sharing writes a readable message, recipient notification and chat preview together', { timeout: 60000 }, async () => {
  const sender = await account('핀을 보내는 사람')
  const recipient = await account('핀을 받는 사람')
  const outsider = await account('다른 사람')
  const senderChats = await sender.service('chat')
  const recipientChats = await recipient.service('chat')
  const chatId = await senderChats.getOrCreateDirectChat(sender.actor, recipient.actor)
  const message = '[피노리 핀]\n함께 가고 싶은 곳\n서울숲\nhttps://www.pinori.kr/posts/share-test-pin'
  await senderChats.sendChatMessage(chatId, sender.actor, message)
  const messages = await observe((next, fail) => recipientChats.subscribeToChatMessages(chatId, next, fail), rows => rows.length === 1)
  assert.equal(messages[0].content, message)
  assert.equal((await recipientChats.getChatById(chatId, recipient.uid)).lastMessage, message)
  const notifications = await firestore.getDocs(firestore.collection(recipient.db, 'users', recipient.uid, 'notifications'))
  assert.ok(notifications.docs.some(doc => doc.data().chatId === chatId && doc.data().message.includes('share-test-pin')))
  const outsiderChats = await outsider.service('chat')
  await assert.rejects(outsiderChats.sendChatMessage(chatId, outsider.actor, message), denied)
  assert.equal((await firestore.getDocs(firestore.collection(recipient.db, 'chats', chatId, 'messages'))).size, 1)
})
