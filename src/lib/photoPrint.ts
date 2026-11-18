import type { Post, PostPhotoPrint } from '../types/post'

// Record photos are kept in two sizes. The display copy (`photoUrls[i]`) is what feeds,
// pins and the web app load. A larger print copy, stored privately beside it, is what
// books are printed from. Both are encoded once, straight from the photo the user picked.
//   display  posts/{uid}/{postId}/{name}         at most 1600px, JPEG 0.9, readable by viewers
//   print    posts/{uid}/{postId}/print/{name}   at most 4096px, JPEG 0.95, owner and server only
// The print file shares the display file's name, so either can be found from the other
// even when a client that does not know about print copies rewrites the record.

export const DISPLAY_MAX_PX = 1600
export const DISPLAY_QUALITY = 0.9
export const THUMBNAIL_MAX_PX = 480
export const PRINT_MAX_PX = 4096
export const PRINT_QUALITY = 0.95

/** `posts/u/p/a.jpg` -> `posts/u/p/print/a.jpg`; '' for anything that is not a display photo path. */
export function printPathFor(displayPath: string): string {
  const match = /^(posts\/[^/]+\/[^/]+)\/([^/]+)$/.exec(displayPath)
  return match ? `${match[1]}/print/${match[2]}` : ''
}

/** A print copy is only worth keeping when it has more pixels than the display copy. */
export function needsPrintCopy(width: number | undefined, height: number | undefined): boolean {
  return !width || !height || Math.max(width, height) > DISPLAY_MAX_PX
}

/** The print copy size recorded for the photo at `photoIndex`, if there is one. */
export function printSizeOf(post: Pick<Post, 'photoUrls' | 'photoPrints'>, photoIndex: number): { width: number; height: number } | null {
  const url = post.photoUrls[photoIndex]
  const print = url ? post.photoPrints?.find(item => item.url === url) : undefined
  return print && print.width > 0 && print.height > 0 ? { width: print.width, height: print.height } : null
}

/** Book photo fields naming the print copy's size, for `BookImageRef`. */
export function printPxOf(post: Pick<Post, 'photoUrls' | 'photoPrints'>, photoIndex: number): { printPxWidth?: number; printPxHeight?: number } {
  const size = printSizeOf(post, photoIndex)
  return size ? { printPxWidth: size.width, printPxHeight: size.height } : {}
}

/** Print copies of the photos a record still shows, in its new photo order. */
export function keptPhotoPrints(prints: readonly PostPhotoPrint[] | undefined, photoUrls: readonly string[]): PostPhotoPrint[] {
  const byUrl = new Map((prints ?? []).map(print => [print.url, print]))
  return photoUrls.flatMap(url => byUrl.get(url) ?? [])
}
