import type { Post } from '../types/post'

export function filterFeedPosts(posts: Post[], keyword: string): Post[] {
  const terms = keyword.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return posts
  return posts.filter(post => {
    const text = [post.title, post.placeName, post.address, post.content, post.authorNickname]
      .join(' ').normalize('NFKC').toLowerCase()
    return terms.every(term => text.includes(term))
  })
}
