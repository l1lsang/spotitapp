const { createHash, randomBytes, timingSafeEqual } = require('node:crypto')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')
const { Timestamp, FieldPath } = require('firebase-admin/firestore')

const password = defineSecret('SPOTIT_ADMIN_PASSWORD')
const db = admin.firestore()
const stamp = () => Timestamp.now()
const hash = value => createHash('sha256').update(value).digest('hex')
const options = { region: 'us-central1', maxInstances: 10 }
const reasons = ['spam', 'sexual', 'violence', 'harassment', 'privacy', 'false_place', 'other']

function text(value, label, max, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new HttpsError('invalid-argument', `${label}을(를) 확인해 주세요. (최대 ${max}자)`)
  }
  return value.trim()
}
function id(value) {
  const result = text(value, '대상 ID', 200)
  if (result.includes('/')) throw new HttpsError('invalid-argument', '올바르지 않은 ID입니다.')
  return result
}
function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인 후 이용해 주세요.')
  return request.auth.uid
}
async function rateLimit(key, max, windowMs) {
  const ref = db.doc(`moderationLimits/${hash(key)}`)
  await db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data()
    const now = Date.now()
    const active = data?.until > now
    if (active && data.count >= max) throw new HttpsError('resource-exhausted', '요청이 많습니다. 잠시 후 다시 시도해 주세요.')
    tx.set(ref, { count: active ? data.count + 1 : 1, until: active ? data.until : now + windowMs,
      expiresAt: Timestamp.fromMillis(now + windowMs) })
  })
}
async function session(request) {
  const token = request.data?.sessionToken
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new HttpsError('unauthenticated', '관리자 로그인이 필요합니다.')
  const ref = db.doc(`adminSessions/${hash(token)}`)
  const data = (await ref.get()).data()
  if (!data || data.expiresAt.toMillis() <= Date.now()) throw new HttpsError('unauthenticated', '관리자 세션이 만료되었습니다. 다시 로그인해 주세요.')
  return ref
}
function serialize(value) {
  if (value?.toMillis) return value.toMillis()
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]))
  return value
}

exports.adminLogin = onCall({ ...options, secrets: [password] }, async request => {
  await rateLimit(`login:${request.rawRequest.ip || 'unknown'}`, 8, 15 * 60_000)
  const submitted = text(request.data?.password, '비밀번호', 200)
  const expected = password.value()
  if (!expected) throw new HttpsError('failed-precondition', '관리자 비밀번호 설정이 필요합니다.')
  if (!timingSafeEqual(Buffer.from(hash(submitted)), Buffer.from(hash(expected)))) throw new HttpsError('permission-denied', '비밀번호가 올바르지 않습니다.')
  const token = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + 4 * 60 * 60_000
  await db.doc(`adminSessions/${hash(token)}`).set({ createdAt: stamp(), expiresAt: Timestamp.fromMillis(expiresAt) })
  return { token, expiresAt }
})
exports.adminLogout = onCall(options, async request => {
  const ref = await session(request)
  await ref.delete()
  return { ok: true }
})

exports.submitModerationCase = onCall(options, async request => {
  const reporterUid = uid(request)
  const data = request.data || {}
  const kind = data.kind
  if (!['pin', 'user', 'chat', 'photo', 'inquiry'].includes(kind)) throw new HttpsError('invalid-argument', '접수 유형을 확인해 주세요.')
  const sourceKind = kind === 'photo' ? data.sourceKind : kind
  if (kind === 'photo' && !['pin', 'user', 'chat'].includes(sourceKind)) throw new HttpsError('invalid-argument', '사진이 포함된 콘텐츠를 확인해 주세요.')
  const photoUrl = kind === 'photo' ? text(data.photoUrl, '사진 주소', 4096) : ''
  if (kind === 'photo' && !/^https?:\/\//i.test(photoUrl)) throw new HttpsError('invalid-argument', '사진 주소를 확인해 주세요.')
  if (kind === 'photo' && sourceKind === 'chat' && !data.messageId) throw new HttpsError('invalid-argument', '사진 메시지를 선택해 주세요.')
  if (kind !== 'inquiry' && (await db.doc(`moderationUsers/${reporterUid}`).get()).data()?.suspended) throw new HttpsError('permission-denied', '이용 정지된 계정입니다. 문의를 통해 이의를 제기할 수 있습니다.')
  const details = text(data.details || '', '내용', 2000, kind === 'inquiry')
  const reason = kind === 'inquiry' ? 'inquiry' : data.reason
  if (kind !== 'inquiry' && !reasons.includes(reason)) throw new HttpsError('invalid-argument', '신고 사유를 선택해 주세요.')
  if (reason === 'other' && !details) throw new HttpsError('invalid-argument', '기타 사유를 입력해 주세요.')
  await rateLimit(`submit:${reporterUid}`, 10, 60 * 60_000)
  let targetId = kind === 'inquiry' ? '' : id(data.targetId)
  let targetUid = ''
  let title = kind === 'inquiry' ? text(data.title, '제목', 100) : ''
  let evidence = {}
  let messageId = ''
  if (sourceKind === 'pin') {
    const post = (await db.doc(`posts/${targetId}`).get()).data()
    if (!post) throw new HttpsError('not-found', '핀을 찾을 수 없습니다.')
    const follows = post.visibility === 'followers' && (await db.doc(`users/${post.uid}/followers/${reporterUid}`).get()).exists
    const groupMember = post.visibility === 'group' && post.groupId && (await db.doc(`groups/${post.groupId}/members/${reporterUid}`).get()).exists
    if (post.uid !== reporterUid && post.visibility !== 'public' && !follows && !groupMember) throw new HttpsError('permission-denied', '볼 수 있는 핀만 신고할 수 있습니다.')
    targetUid = post.uid
    title = post.title || post.placeName || '핀 신고'
    evidence = { title, content: post.content || '', placeName: post.placeName || '', address: post.address || '', photoUrls: post.photoUrls || [], authorNickname: post.authorNickname || '', uid: post.uid }
  } else if (sourceKind === 'user') {
    const user = (await db.doc(`users/${targetId}`).get()).data()
    if (!user) throw new HttpsError('not-found', '사용자를 찾을 수 없습니다.')
    if (targetId === reporterUid) throw new HttpsError('invalid-argument', '본인은 신고할 수 없습니다.')
    targetUid = targetId
    title = user.nickname || '사용자 신고'
    evidence = { nickname: user.nickname || '', username: user.username || '', bio: user.bio || '', photoUrls: user.photoURL ? [user.photoURL] : [] }
  } else if (sourceKind === 'chat') {
    const chat = (await db.doc(`chats/${targetId}`).get()).data()
    if (!chat?.participantIds?.includes(reporterUid)) throw new HttpsError('permission-denied', '참여 중인 채팅만 신고할 수 있습니다.')
    title = chat.name || '채팅 신고'
    if (data.messageId) {
      messageId = id(data.messageId)
      const message = (await db.doc(`chats/${targetId}/messages/${messageId}`).get()).data()
      if (!message) throw new HttpsError('not-found', '메시지를 찾을 수 없습니다.')
      if (kind === 'photo' && message.uid === 'deleted-user') throw new HttpsError('not-found', '삭제된 메시지의 사진은 신고할 수 없습니다.')
      if (message.uid === reporterUid) throw new HttpsError('invalid-argument', '본인의 메시지는 신고할 수 없습니다.')
      targetUid = message.uid
      evidence = { content: message.content || '', authorNickname: message.authorNickname || '', photoUrls: message.photoUrl ? [message.photoUrl] : [], messageId }
    } else {
      // Room reports contain only the most recent 20 messages; no unrelated rooms are read.
      const messages = await db.collection(`chats/${targetId}/messages`).orderBy('createdAt', 'desc').limit(20).get()
      evidence = { messages: messages.docs.reverse().map(doc => ({ id: doc.id, uid: doc.data().uid, authorNickname: doc.data().authorNickname || '', content: doc.data().content || '', photoUrl: doc.data().photoUrl || '' })) }
    }
  }
  if (kind === 'photo') {
    if (targetUid === reporterUid) throw new HttpsError('invalid-argument', '본인의 사진은 신고할 수 없습니다.')
    // Only accept a photo currently attached to the authorized server-side source.
    // Never fetch the submitted URL or trust client-provided evidence/author fields.
    if (!Array.isArray(evidence.photoUrls) || !evidence.photoUrls.includes(photoUrl)) throw new HttpsError('not-found', '해당 콘텐츠에서 사진을 찾을 수 없습니다. 새로고침 후 다시 확인해 주세요.')
    const authorNickname = evidence.authorNickname || evidence.nickname || ''
    evidence = { photoUrls: [photoUrl], authorNickname, sourceKind, ...(messageId ? { messageId } : {}) }
    const sourceLabel = sourceKind === 'pin' ? '기록' : sourceKind === 'user' ? '프로필' : '채팅'
    title = `${sourceLabel} 사진 신고 · ${title}`
  }
  const reporter = (await db.doc(`users/${reporterUid}`).get()).data()
  const dedupe = kind === 'inquiry' ? id(data.requestId)
    : kind === 'photo' ? hash(JSON.stringify([reporterUid, kind, sourceKind, targetId, messageId, photoUrl]))
    : hash(`${reporterUid}:${kind}:${targetId}:${messageId}`)
  const ref = db.doc(`moderationCases/${kind === 'inquiry' ? hash(reporterUid + ':' + dedupe) : dedupe}`)
  return db.runTransaction(async tx => {
    if ((await tx.get(ref)).exists) return { id: ref.id, duplicate: true }
    tx.create(ref, { kind, ...(kind === 'photo' ? { sourceKind } : {}), targetId, targetUid, messageId, title, reason, details, evidence, reporterUid,
      reporterName: reporter?.nickname || '사용자', status: 'open', reply: '', note: '', createdAt: stamp(), updatedAt: stamp() })
    return { id: ref.id, duplicate: false }
  })
})

exports.listMyModerationCases = onCall(options, async request => {
  const reporterUid = uid(request)
  const snapshot = await db.collection('moderationCases').where('reporterUid', '==', reporterUid).get()
  return { cases: snapshot.docs.map(doc => {
    const { kind, sourceKind, title, details, reason, status, reply, createdAt, updatedAt } = doc.data()
    return serialize({ id: doc.id, kind, ...(sourceKind ? { sourceKind } : {}), title, details, reason, status, reply, createdAt, updatedAt })
  }).sort((a, b) => b.createdAt - a.createdAt) }
})

exports.adminListCases = onCall(options, async request => {
  await session(request)
  const kind = request.data?.kind || 'all'
  const status = request.data?.status || 'all'
  if (!['all', 'pin', 'user', 'chat', 'photo', 'inquiry', 'auto'].includes(kind) || !['all', 'open', 'reviewing', 'resolved', 'dismissed'].includes(status)) throw new HttpsError('invalid-argument', '필터를 확인해 주세요.')
  let query = db.collection('moderationCases')
  if (kind !== 'all') query = query.where('kind', '==', kind)
  if (status !== 'all') query = query.where('status', '==', status)
  query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc')
  const cursor = request.data?.cursor
  if (cursor) {
    const snapshot = await db.doc(`moderationCases/${id(cursor)}`).get()
    if (snapshot.exists) query = query.startAfter(snapshot)
  }
  const snapshot = await query.limit(31).get()
  const docs = snapshot.docs.slice(0, 30)
  return { cases: docs.map(doc => serialize({ ...doc.data(), id: doc.id })), nextCursor: snapshot.size > 30 ? docs.at(-1).id : null }
})

exports.adminReviewCase = onCall(options, async request => {
  const adminSession = await session(request)
  const data = request.data || {}
  const caseId = id(data.caseId)
  const status = data.status
  if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) throw new HttpsError('invalid-argument', '처리 상태를 확인해 주세요.')
  const note = text(data.note || '', '관리 메모', 2000, false)
  const reply = text(data.reply || '', '답변', 2000, false)
  const action = data.action || 'save'
  if (!['save', 'hide', 'restore'].includes(action)) throw new HttpsError('invalid-argument', '작업을 확인해 주세요.')
  await db.runTransaction(async tx => {
    const ref = db.doc(`moderationCases/${caseId}`)
    const item = (await tx.get(ref)).data()
    if (!item) throw new HttpsError('not-found', '접수 내역을 찾을 수 없습니다.')
    if (action !== 'save') {
      if (!['pin', 'auto'].includes(item.kind) && !(item.kind === 'photo' && item.sourceKind === 'pin')) throw new HttpsError('invalid-argument', '핀 또는 핀 사진 신고에서만 연결된 핀을 숨길 수 있습니다.')
      const postRef = db.doc(`posts/${item.targetId}`)
      const hiddenRef = db.doc(`moderationPosts/${item.targetId}`)
      const [post, hidden] = await Promise.all([tx.get(postRef), tx.get(hiddenRef)])
      if (action === 'hide') {
        if (!post.exists && !hidden.exists) throw new HttpsError('not-found', '이미 삭제된 핀입니다.')
        if (post.exists) {
          tx.set(hiddenRef, { post: post.data(), hiddenAt: stamp(), caseId })
          tx.delete(postRef)
        }
      } else {
        if (!hidden.exists) throw new HttpsError('failed-precondition', '현재 숨겨진 핀이 아닙니다.')
        if (post.exists) throw new HttpsError('failed-precondition', '같은 ID의 핀이 이미 존재합니다.')
        tx.create(postRef, hidden.data().post)
        tx.delete(hiddenRef)
      }
    }
    tx.update(ref, { status, note, reply, updatedAt: stamp(), lastAction: action })
    tx.create(db.collection('moderationAudit').doc(), { caseId, sessionId: adminSession.id, status, action, note, reply, createdAt: stamp() })
  })
  return { ok: true }
})

// Conservative keyword screening queues evidence for review. It never deletes on keyword matches.
const signals = [
  ['불법 촬영물 의심', /몰카\s*(판매|공유|구매)|불법\s*촬영\s*(판매|공유)/i],
  ['불법 거래 의심', /마약\s*(판매|구매|팝니다)|대포\s*통장\s*(판매|구매)/i],
  ['도배·광고 의심', /(?:https?:\/\/\S+\s*){4,}/i],
]
exports.screenPin = onDocumentWritten({ ...options, document: 'posts/{postId}' }, async event => {
  if (!event.data?.after.exists) return
  const post = event.data.after.data()
  const content = `${post.title || ''}\n${post.content || ''}\n${post.placeName || ''}`.normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g, '')
  const matches = signals.filter(([, pattern]) => pattern.test(content)).map(([label]) => label)
  if (!matches.length) return
  const ref = db.doc(`moderationCases/auto_${hash(event.params.postId + ':' + content)}`)
  try {
    await ref.create({ kind: 'auto', targetId: event.params.postId, targetUid: post.uid, title: post.title || '자동 검토 핀', reason: 'auto',
      details: matches.join(', '), evidence: { content: post.content || '', title: post.title || '', placeName: post.placeName || '', photoUrls: post.photoUrls || [], authorNickname: post.authorNickname || '' },
      reporterUid: 'system', reporterName: '자동 필터', status: 'open', reply: '', note: '', createdAt: stamp(), updatedAt: stamp() })
  } catch (error) { if (error.code !== 6) throw error }
})

exports.adminStats = onCall(options, async request => {
  await session(request)
  const since = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60_000)
  const queries = {
    users: db.collection('users'), posts: db.collection('posts'), chats: db.collection('chats'),
    openCases: db.collection('moderationCases').where('status', 'in', ['open', 'reviewing']),
    newUsers: db.collection('users').where('createdAt', '>=', since),
    newPosts: db.collection('posts').where('createdAt', '>=', since),
    suspendedUsers: db.collection('moderationUsers').where('suspended', '==', true),
  }
  return Object.fromEntries(await Promise.all(Object.entries(queries).map(async ([key, query]) => [key, (await query.count().get()).data().count])))
})

exports.adminSearchUsers = onCall(options, async request => {
  await session(request)
  const field = request.data?.field || 'nickname'
  let search = text(request.data?.search || '', '검색어', 200, false)
  if (!['nickname', 'username', 'email', 'uid'].includes(field)) throw new HttpsError('invalid-argument', '검색 항목을 확인해 주세요.')
  if (field === 'username') search = search.replace(/^@/, '').toLowerCase()
  let query = db.collection('users')
  if (search) {
    if (field === 'uid' || field === 'email') query = query.where(field, '==', search).orderBy(FieldPath.documentId())
    else query = query.orderBy(field).orderBy(FieldPath.documentId()).startAt(search).endAt(search + '\uf8ff')
  } else query = query.orderBy(FieldPath.documentId())
  if (request.data?.cursor) {
    const cursor = await db.doc(`users/${id(request.data.cursor)}`).get()
    if (cursor.exists) query = query.startAfter(cursor)
  }
  const snapshot = await query.limit(26).get()
  const docs = snapshot.docs.slice(0, 25)
  const states = docs.length ? await db.getAll(...docs.map(doc => db.doc(`moderationUsers/${doc.id}`))) : []
  return { users: docs.map((doc, index) => {
    const user = doc.data()
    const state = states[index].data()
    return serialize({ uid: doc.id, nickname: user.nickname || '', username: user.username || '', email: user.email || '', bio: user.bio || '', photoURL: user.photoURL || '', createdAt: user.createdAt || null, suspended: state?.suspended === true, suspensionReason: state?.reason || '' })
  }), nextCursor: snapshot.size > 25 ? docs.at(-1).id : null }
})

exports.adminManageUser = onCall(options, async request => {
  const adminSession = await session(request)
  const targetUid = id(request.data?.targetUid)
  const suspended = request.data?.suspended
  if (typeof suspended !== 'boolean') throw new HttpsError('invalid-argument', '이용 상태를 확인해 주세요.')
  const reason = text(request.data?.reason || '', '처리 사유', 500)
  if (!(await db.doc(`users/${targetUid}`).get()).exists) throw new HttpsError('not-found', '사용자를 찾을 수 없습니다.')
  // Firestore gate takes effect before disabling Auth, including already issued ID tokens.
  const ref = db.doc(`moderationUsers/${targetUid}`)
  await ref.set({ suspended: true, reason, updatedAt: stamp(), authSyncPending: true }, { merge: true })
  try {
    await admin.auth().updateUser(targetUid, { disabled: suspended })
    if (suspended) await admin.auth().revokeRefreshTokens(targetUid)
  } catch (error) {
    // Keep the account gated on partial failure; retrying the same action reconciles Auth.
    throw new HttpsError('unavailable', '계정 인증 상태를 동기화하지 못했습니다. 같은 작업을 다시 시도해 주세요.')
  }
  const batch = db.batch()
  batch.set(ref, { suspended, reason, updatedAt: stamp(), authSyncPending: false })
  batch.create(db.collection('moderationAudit').doc(), { targetUid, action: suspended ? 'suspend_user' : 'restore_user', reason, sessionId: adminSession.id, createdAt: stamp() })
  await batch.commit()
  return { ok: true }
})
