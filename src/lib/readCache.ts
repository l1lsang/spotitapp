// Session memory only: never persist private data across accounts or reloads.
export function createReadCache(maxEntries = 128, now = () => Date.now()) {
  const entries = new Map<string, { promise: Promise<unknown>; expires: number }>()
  return {
    read<T>(key: string, loader: () => Promise<T>, ttlMs = 30_000): Promise<T> {
      const existing = entries.get(key)
      if (existing && existing.expires > now()) return existing.promise as Promise<T>
      const entry = { promise: Promise.resolve().then(loader) as Promise<unknown>, expires: Infinity }
      entries.delete(key)
      entries.set(key, entry)
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value!)
      entry.promise.then(() => {
        entry.expires = now() + ttlMs
      }, () => {
        if (entries.get(key) === entry) entries.delete(key)
      })
      return entry.promise as Promise<T>
    },
    clear() { entries.clear() },
  }
}

export const appReadCache = createReadCache()
export const invalidateAppReads = () => appReadCache.clear()
