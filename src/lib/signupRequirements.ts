export const SIGNUP_POLICY_VERSION = '2026-09-09.2'
export const UNDERAGE_MESSAGE = '만 14세 미만은 가입할 수 없습니다.'

export interface SignupRequirements {
  birthDate: string
  termsAccepted: boolean
  privacyAccepted: boolean
  locationAccepted: boolean
}

// Use the same Korean calendar date in the browser and Firestore rules.
export function koreaToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function getBirthDateError(birthDate: string, now = new Date()): string {
  if (!birthDate) return '생년월일을 입력해 주세요.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return '올바른 생년월일을 입력해 주세요.'
  const date = new Date(`${birthDate}T00:00:00Z`)
  const today = koreaToday(now)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate
    || birthDate < '1900-01-01' || birthDate > today) return '올바른 생년월일을 입력해 주세요.'
  const age = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4))
    - (today.slice(5) < birthDate.slice(5) ? 1 : 0)
  return age < 14 ? UNDERAGE_MESSAGE : ''
}

export function getSignupRequirementsError(input: SignupRequirements, now = new Date()): string {
  return getBirthDateError(input.birthDate, now)
    || (!input.termsAccepted ? '필수 이용약관에 동의해 주세요.' : '')
    || (!input.privacyAccepted ? '필수 개인정보 처리 관련 동의가 필요합니다.' : '')
}
