import type { Post } from '../types/post'

// Keep identical to backend/functions/postSearchCore.js, which builds the pins' searchTokens.
export function getFeedSearchTerms(keyword: string): string[] {
  return keyword.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean)
}

// The first one or two characters of the longest query word: a searchTokens entry of every pin containing that word.
export function getFeedSearchProbe(terms: string[]): string {
  const longest = terms.reduce((best, term) => Array.from(term).length > Array.from(best).length ? term : best, '')
  return Array.from(longest).slice(0, 2).join('')
}

export function filterFeedPosts(posts: Post[], keyword: string): Post[] {
  const terms = getFeedSearchTerms(keyword)
  if (!terms.length) return posts
  return posts.filter(post => {
    const text = [post.title, post.placeName, post.address, post.content, post.authorNickname]
      .join(' ').normalize('NFKC').toLowerCase()
    return terms.every(term => text.includes(term))
  })
}

// Matches among the loaded pages plus the server's matches, each once, newest first.
export function mergeFeedSearchResults(loaded: Post[], found: Post[]): Post[] {
  const posts = new Map([...found, ...loaded].map(post => [post.id, post]))
  const time = (post: Post) => typeof post.createdAt?.toMillis === 'function' ? post.createdAt.toMillis() : 0
  return [...posts.values()].sort((a, b) => time(b) - time(a))
}
