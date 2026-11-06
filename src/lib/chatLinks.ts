export interface LinkSegment {
  text: string
  /** Normalized https/http address when this piece of text is a link. */
  url?: string
}

// Only explicit web addresses become links: "https://…", "http://…" or "www.…".
// URL characters are ASCII, so Korean text written right after a link is not swallowed.
const LINK = /(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi
const TRAILING = /[.,!?;:'"\]]+$/

function trimTrailing(raw: string): string {
  let value = raw.replace(TRAILING, '')
  // Drop a closing parenthesis that belongs to the sentence, e.g. "(https://a.kr)".
  while (value.endsWith(')') && (value.match(/\(/g)?.length || 0) < (value.match(/\)/g)?.length || 0)) value = value.slice(0, -1).replace(TRAILING, '')
  return value
}

export function normalizeChatLink(raw: string): string | null {
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch { return null }
}

export function getLinkSegments(text: string): LinkSegment[] {
  const segments: LinkSegment[] = []
  let last = 0
  for (const match of text.matchAll(LINK)) {
    const start = match.index ?? 0
    // A link must start a word, so "abc.www.x" or "xhttps://" stay plain text.
    if (start > 0 && /[A-Za-z0-9]/.test(text[start - 1])) continue
    const raw = trimTrailing(match[0])
    const url = normalizeChatLink(raw)
    if (!url) continue
    if (start > last) segments.push({ text: text.slice(last, start) })
    segments.push({ text: raw, url })
    last = start + raw.length
  }
  if (last < text.length) segments.push({ text: text.slice(last) })
  return segments.length ? segments : [{ text }]
}
