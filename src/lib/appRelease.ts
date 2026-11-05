export type AppPlatform = 'android' | 'ios'

export interface AppRelease {
  version: string
  url: string
  message?: string
}

// Store releases use stable major.minor.patch versions, without leading zeros.
function versionParts(version: unknown): number[] | null {
  if (typeof version !== 'string' || version.trim() !== version
    || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return null
  const parts = version.split('.').map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}

export function isNewerAppVersion(latest: string, current: string): boolean {
  const latestParts = versionParts(latest)
  const currentParts = versionParts(current)
  if (!latestParts || !currentParts) return false

  for (let index = 0; index < 3; index += 1) {
    if (latestParts[index] !== currentParts[index]) return latestParts[index] > currentParts[index]
  }
  return false
}

export function parseAppRelease(data: unknown): AppRelease | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const value = data as Record<string, unknown>
  if (value.enabled !== undefined && value.enabled !== true) return null
  if (!versionParts(value.version)) return null
  if (typeof value.url !== 'string' || value.url.length > 2048
    || !/^https:\/\//i.test(value.url) || /[\s\u0000-\u001f\u007f\\]/.test(value.url)) return null

  let url: URL
  try {
    url = new URL(value.url)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
  if (value.message !== undefined && (typeof value.message !== 'string' || value.message.length > 500)) return null
  const message = typeof value.message === 'string' ? value.message.trim() : ''
  return { version: value.version as string, url: url.href, ...(message ? { message } : {}) }
}
