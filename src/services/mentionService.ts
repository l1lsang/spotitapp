import { collection, doc, endAt, getDocs, limit, orderBy, query, startAt, type DocumentData, type Transaction } from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import { getMentionUsernames, MAX_COMMENT_MENTIONS } from '../lib/commentMentions'
import type { Post } from '../types/post'

export interface MentionUser { uid: string; username: string; nickname: string; photoURL: string }

export async function searchMentionUsers(value: string): Promise<MentionUser[]> {
  const prefix = value.toLowerCase()
  if (!/^[a-z0-9._]{0,30}$/.test(prefix)) return []
  const users = collection(requireDb(), 'users')
  const snapshot = await getDocs(query(users, orderBy('username'), startAt(prefix), endAt(`${prefix}\uf8ff`), limit(6)))
  return snapshot.docs.flatMap(item => {
    const data = item.data()
    return data.username && data.onboardingComplete !== false
      ? [{ uid: item.id, username: data.username, nickname: data.nickname || data.username, photoURL: data.photoURL || '' }] : []
  })
}

type MentionPost = Pick<Post, 'uid' | 'visibility' | 'groupId'>

export async function resolveCommentMentions(transaction: Transaction, content: string, post: MentionPost, actorUid: string) {
  const usernames = getMentionUsernames(content)
  if (usernames.length > MAX_COMMENT_MENTIONS) throw new Error(`멘션은 댓글 하나에 최대 ${MAX_COMMENT_MENTIONS}명까지 할 수 있습니다.`)
  const db = requireDb()
  const mentions: Record<string, string> = {}
  const recipients: MentionUser[] = []
  let actorInGroup: boolean | undefined
  for (const username of usernames) {
    const handle = await transaction.get(doc(db, 'usernames', `@${username}`))
    const uid = handle.data()?.uid as string | undefined
    if (!uid) continue
    const user = (await transaction.get(doc(db, 'users', uid))).data()
    if (!user || user.onboardingComplete === false || user.username !== username) continue
    // Persist UID bindings so existing mentions still open the same profile after a rename.
    mentions[`@${username}`] = uid
    if (uid === actorUid) continue
    let canRead = post.uid === uid || post.visibility === 'public'
    if (!canRead && post.visibility === 'followers') {
      canRead = (await transaction.get(doc(db, 'users', post.uid, 'followers', uid))).exists()
    }
    if (!canRead && post.visibility === 'group' && post.groupId) {
      if (actorInGroup === undefined) actorInGroup = (await transaction.get(doc(db, 'groups', post.groupId, 'members', actorUid))).exists()
      if (actorInGroup) canRead = (await transaction.get(doc(db, 'groups', post.groupId, 'members', uid))).exists()
    }
    if (canRead) recipients.push(toMentionUser(uid, username, user))
  }
  return { mentions, recipients }
}

function toMentionUser(uid: string, username: string, user: DocumentData): MentionUser {
  return { uid, username, nickname: user.nickname || username, photoURL: user.photoURL || '' }
}
