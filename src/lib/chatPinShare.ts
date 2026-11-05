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
