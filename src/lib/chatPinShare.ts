import type { Post } from '../types/post'

const marker = '[피노리 핀]'
// Messages sent before the rename still carry the old marker.
const markers = new Set([marker, '[스팟잇 핀]'])
const webUrl = process.env.EXPO_PUBLIC_WEB_URL || 'https://www.pinori.kr'
const cleanLine = (value: string) => value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200)
const validId = (value: string) => /^[\w-]{1,128}$/.test(value)

export function createPinShareMessage(post: Pick<Post, 'id' | 'title' | 'placeName'>): string {
  if (!validId(post.id)) throw new Error('공유할 핀을 확인해 주세요.')
  const origin = new URL(webUrl).origin
  if (!origin.startsWith('https://')) throw new Error('공유 링크를 만들 수 없습니다.')
  return [marker, cleanLine(post.title) || '장소 기록', cleanLine(post.placeName) || '선택한 장소', `${origin}/posts/${encodeURIComponent(post.id)}`].join('\n')
}

// Plain text keeps older app versions compatible. Only our own exact pin-link
// format becomes an in-app action; arbitrary links never control navigation.
export function getSharedPinFromMessage(content: string): { postId: string; title: string; placeName: string } | null {
  const lines = content.trim().split('\n')
  if (lines.length !== 4 || !markers.has(lines[0]) || !lines[1] || !lines[2]) return null
  try {
    const url = new URL(lines[3])
    // Pins shared before the domain change still point at spotitmap.kr.
    const origins = new Set(['https://pinori.kr', 'https://www.pinori.kr', 'https://spotitmap.kr', 'https://www.spotitmap.kr', new URL(webUrl).origin])
    if (url.protocol !== 'https:' || !origins.has(url.origin) || url.username || url.password || url.search || url.hash) return null
    const match = /^\/posts\/([\w-]{1,128})$/.exec(url.pathname)
    return match ? { postId: match[1], title: lines[1], placeName: lines[2] } : null
  } catch { return null }
}

const groupMarker = '[피노리 그룹]'
const groupOrigins = () => new Set(['https://pinori.kr', 'https://www.pinori.kr', new URL(webUrl).origin])

export function getShareUrl(kind: 'posts' | 'groups', id: string): string {
  if (!validId(id)) throw new Error('공유할 대상을 확인해 주세요.')
  return `${new URL(webUrl).origin}/${kind}/${encodeURIComponent(id)}`
}

// A private group travels with its invite code so the recipient can join from the chat.
export function createGroupShareMessage(group: { id: string; name: string; visibility: 'public' | 'private' }, inviteCode = ''): string {
  const code = inviteCode.replace(/[\s-]/g, '').toUpperCase()
  if (group.visibility === 'private' && !/^[A-HJ-NP-Z2-9]{12}$/.test(code)) throw new Error('초대코드를 불러온 뒤 다시 시도해 주세요.')
  const detail = group.visibility === 'private' ? `비공개 그룹 · 초대코드 ${code.match(/.{4}/g)!.join('-')}` : '공개 그룹'
  return [groupMarker, cleanLine(group.name) || '그룹', detail, getShareUrl('groups', group.id)].join('\n')
}

export function getSharedGroupFromMessage(content: string): { groupId: string; name: string; detail: string; inviteCode: string } | null {
  const lines = content.trim().split('\n')
  if (lines.length !== 4 || lines[0] !== groupMarker || !lines[1] || !lines[2]) return null
  try {
    const url = new URL(lines[3])
    if (url.protocol !== 'https:' || !groupOrigins().has(url.origin) || url.username || url.password || url.search || url.hash) return null
    const match = /^\/groups\/([\w-]{1,128})$/.exec(url.pathname)
    if (!match) return null
    const code = /초대코드 ([A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4})$/.exec(lines[2])?.[1].replaceAll('-', '') || ''
    return { groupId: match[1], name: lines[1], detail: lines[2], inviteCode: code }
  } catch { return null }
}
