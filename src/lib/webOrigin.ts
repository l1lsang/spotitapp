const DEFAULT_WEB_ORIGIN = 'https://www.pinori.kr'

/**
 * Turns the configured site address into "https://host". Builds have shipped with values
 * such as "www.pinori.kr" (no scheme), which React Native's URL rejects, so this reads the
 * text directly: a missing scheme becomes https, and anything unusable falls back to the public site.
 */
export function normalizeWebOrigin(value: string | undefined): string {
  const text = (value || '').trim()
  if (!text) return DEFAULT_WEB_ORIGIN
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`
  const match = /^https:\/\/([a-z\d.-]+(?::\d{1,5})?)(?:[/?#]|$)/i.exec(withScheme)
  return match && match[1].includes('.') ? `https://${match[1].toLowerCase()}` : DEFAULT_WEB_ORIGIN
}

export const WEB_ORIGIN = normalizeWebOrigin(process.env.EXPO_PUBLIC_WEB_URL)
