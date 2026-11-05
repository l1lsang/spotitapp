import type { Post } from '../types/post'

// Session memory only: the detail feed continues exactly what the grid showed.
let session: { uid: string; posts: Post[] } | null = null

export function rememberFeedPosts(uid: string, posts: Post[]) {
  session = { uid, posts }
}

export function readFeedPostsFrom(uid: string, postId: string): Post[] | null {
  if (session?.uid !== uid) return null
  const index = session.posts.findIndex(post => post.id === postId)
  return index >= 0 ? session.posts.slice(index) : null
}

const TONES = ['tone-primary', 'tone-olive', 'tone-coral'] as const
export type FeedTone = (typeof TONES)[number]

// Records without photos get a stable soft colour so the grid does not shuffle.
export function getFeedTone(post: Pick<Post, 'id'>): FeedTone {
  let hash = 0
  for (const char of post.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TONES[hash % TONES.length]
}

export function formatFeedDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return year && month && day ? `${year}년 ${month}월 ${day}일` : dateKey
}
