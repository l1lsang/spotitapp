import { Image } from 'react-native'

/** A photo's pixel size, read from the image itself (records do not store it). */
export function measurePhoto(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => Image.getSize(url, (width, height) => resolve({ width, height }), reject))
}

/**
 * Measures many photos a few at a time. A photo that cannot be read gives null, so one
 * broken image does not stop a whole book.
 */
export async function measurePhotos(urls: readonly string[], onProgress?: (done: number) => void, concurrency = 4): Promise<({ width: number; height: number } | null)[]> {
  const results: ({ width: number; height: number } | null)[] = new Array(urls.length).fill(null)
  let next = 0
  let done = 0
  async function worker() {
    while (next < urls.length) {
      const index = next++
      results[index] = await measurePhoto(urls[index]).catch(() => null)
      onProgress?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker))
  return results
}
