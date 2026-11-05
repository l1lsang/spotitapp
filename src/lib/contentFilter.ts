// Blocks severe profanity, slurs and sexual abuse terms before a pin, comment or
// chat message is saved. Kept short and specific so ordinary words still pass;
// the operator queue (reports, blocks and the server keyword screen) covers the rest.
const BLOCKED_TERMS = [
  '씨발', '시발', '씨바', '씌발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '좆', '존나', 'ㅈㄴ', '개새끼', '개색기', '개새기',
  '니애미', '니미럴', '느금마', '느그엄마', '엠창', '애미뒤진', '애비뒤진', '창녀', '걸레년', '섹스하자', '몸캠',
  '한남충', '김치녀', '틀딱', '장애새끼', '짱깨', '쪽바리', '흑형새끼',
  'fuck', 'nigger', 'nigga', 'faggot',
]
// Ordinary words that contain a blocked term once spaces are removed.
const ALLOWED_TERMS = ['시발점', '시발역', '시발택시', '씨바리']

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[​-‍﻿]/g, '')
    // Separators placed between letters to dodge the filter (씨.발, f u c k).
    .replace(/[\s._\-*~!@#$%^&+=|/\\,'"`?<>()[\]{}:;0-9]+/g, '')
}
// NFKC rewrites compatibility jamo (ㅅㅂ), so the lists go through the same step.
const blocked = BLOCKED_TERMS.map(normalize)
const allowed = ALLOWED_TERMS.map(normalize)

export function findBlockedTerm(...values: (string | undefined)[]): string | null {
  let text = normalize(values.filter(Boolean).join(' '))
  for (const term of allowed) text = text.split(term).join('')
  const index = blocked.findIndex(term => text.includes(term))
  return index >= 0 ? BLOCKED_TERMS[index] : null
}

export const BLOCKED_CONTENT_MESSAGE = '욕설이나 혐오 표현이 포함되어 있어 등록할 수 없어요. 내용을 수정해 주세요.'

export function assertCleanContent(...values: (string | undefined)[]): void {
  if (findBlockedTerm(...values)) throw new Error(BLOCKED_CONTENT_MESSAGE)
}
