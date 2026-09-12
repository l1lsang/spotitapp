import type { Post } from '../types/post'
import { isValidLocation, type LatLng } from './mapLocation'

export interface MapPoint { x: number; y: number }
export interface PostCluster { location: LatLng; posts: Post[] }

// Group by screen pixels, so nearby pins split again when the map is zoomed in.
export function clusterPosts(
  posts: Post[],
  project: (location: LatLng) => MapPoint | null,
  radius = 44,
): PostCluster[] {
  const entries = posts.filter(isValidLocation).map((post) => ({ post, point: project(post) }))
  const parents = entries.map((_, index) => index)
  function root(index: number): number {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]]
      index = parents[index]
    }
    return index
  }
  entries.forEach((entry, index) => {
    for (let other = 0; other < index; other++) {
      const point = entries[other].point
      const sameLocation = entry.post.lat === entries[other].post.lat && entry.post.lng === entries[other].post.lng
      if (sameLocation || (entry.point && point &&
        Math.hypot(entry.point.x - point.x, entry.point.y - point.y) < radius)) {
        parents[root(index)] = root(other)
      }
    }
  })
  const groups = new Map<number, PostCluster>()
  entries.forEach(({ post }, index) => {
    const key = root(index)
    const group = groups.get(key)
    if (group) group.posts.push(post)
    else groups.set(key, { location: { lat: post.lat, lng: post.lng }, posts: [post] })
  })
  return [...groups.values()]
}
