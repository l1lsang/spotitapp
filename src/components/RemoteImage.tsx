import { Image, type ImageProps } from 'expo-image'

// Uploads always get a new file name, so a photo never changes behind its URL:
// keep it in memory and on disk instead of downloading it again on every screen.
export function RemoteImage({ uri, ...props }: Omit<ImageProps, 'source'> & { uri?: string }) {
  return <Image source={uri ? { uri } : null} cachePolicy="memory-disk" {...props} />
}

// Cached photos can be private to the signed-in account; drop them when it changes.
export function clearRemoteImageCache(): Promise<unknown> {
  return Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]).catch(() => undefined)
}
