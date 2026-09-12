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

// Fail before creating a client unless the dedicated local emulator runner set
// both endpoints. This suite never reads the app's .env or production config.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-spotit-native', 'Run only through the dedicated emulator command')
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8281')
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9291')
firestore.setLogLevel('silent')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apps = []
const denied = error => error.code === 'permission-denied'
const requirements = { birthDate: '2000-01-01', termsAccepted: true, privacyAccepted: true, locationAccepted: true }
after(async () => { await Promise.all(apps.map(deleteApp)) })

async function account(nickname, complete = true) {
  const app = initializeApp({ projectId: 'demo-spotit-native', apiKey: 'demo-native-key' }, randomUUID())
  apps.push(app)
  const auth = authSdk.getAuth(app)
  const db = firestore.getFirestore(app)
  authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9291', { disableWarnings: true })
  firestore.connectFirestoreEmulator(db, '127.0.0.1', 8281)
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
  return { app, db, auth, uid: user.uid, user, email, actor, users, session, service }
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
  await assert.rejects(posts.createPost(input(), [], client.actor), denied)
  await assert.rejects(client.session.signupWithEmail('underage@example.test', 'native-test-password', { ...requirements, birthDate: '2020-01-01' }), /14세/)
  await client.users.updateUserProfileDetails(client.uid, { username: randomUUID().replaceAll('-', '').slice(0, 24), nickname: client.actor.nickname, bio: '' }, requirements)
  const profile = await client.users.getUserProfile(client.uid, true)
  assert.equal(profile.onboardingComplete, true)
  await client.session.logout()
  assert.equal(client.auth.currentUser, null)
  assert.equal((await client.session.loginWithEmail(client.email, 'native-test-password')).uid, client.uid)
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
  assert.equal((await comments.listComments(pinId))[0].replies[0].content, '앱에서 남긴 답글')
  assert.equal((await firestore.getDoc(postRef(owner, pinId))).data().likeCount, 1)
  await memberGroups.setGroupMembership(groupId, member.uid, false)
  await assert.rejects(firestore.getDoc(postRef(member, pinId)), denied)
  await assert.rejects(likes.togglePostLike(pinId, member.actor), denied)
  assert.equal((await firestore.getDoc(firestore.doc(owner.db, 'groups', groupId))).data().memberCount, 1)
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
