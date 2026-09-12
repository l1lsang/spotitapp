export const policyNavigation = [
  { id: 'terms', title: '이용약관', description: '서비스 이용과 회원의 권리·의무' },
  { id: 'privacy', title: '개인정보처리방침', description: '개인정보의 수집·이용·보관과 권리 행사' },
  { id: 'community', title: '운영정책', description: '안전한 소통을 위한 기준과 신고 절차' },
  { id: 'youth', title: '청소년보호정책', description: '아동·청소년 보호와 법정대리인의 권리' },
  { id: 'location', title: '위치기반서비스 이용약관', description: '위치정보의 이용·공유와 동의 철회' },
] as const

export type PolicyId = typeof policyNavigation[number]['id']

export function isPublicPolicyPath(pathname: string): boolean {
  return pathname === '/policies' || pathname.startsWith('/policies/')
}
