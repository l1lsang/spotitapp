export type CaseKind = 'pin' | 'user' | 'chat' | 'photo' | 'inquiry' | 'auto'
export type CaseStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed'
export const CASE_LABELS: Record<CaseKind, string> = { pin: '핀 신고', user: '유저 신고', chat: '채팅 신고', photo: '사진 신고', inquiry: '문의', auto: '자동 검토' }
export const STATUS_LABELS: Record<CaseStatus, string> = { open: '접수', reviewing: '검토 중', resolved: '처리 완료', dismissed: '기각' }
export const REPORT_REASONS = [
  { id: 'spam', label: '스팸·광고·사기' }, { id: 'sexual', label: '음란·성적 콘텐츠' },
  { id: 'violence', label: '폭력·위험한 행위' }, { id: 'harassment', label: '욕설·괴롭힘·혐오' },
  { id: 'privacy', label: '개인정보 노출·사생활 침해' }, { id: 'false_place', label: '허위 장소·잘못된 위치' }, { id: 'other', label: '기타' },
] as const
export type PhotoSourceKind = 'pin' | 'user' | 'chat'
export type ReportTarget = { targetId: string; label: string; messageId?: string } & (
  | { kind: 'pin' | 'user' | 'chat' }
  | { kind: 'photo'; sourceKind: PhotoSourceKind; photoUrl: string }
)
export interface ModerationCase {
  id: string; kind: CaseKind; title: string; reason: string; details: string; status: CaseStatus
  reply: string; note?: string; reporterName?: string; reporterUid?: string; targetId?: string; targetUid?: string
  createdAt: number; updatedAt: number; lastAction?: string
  sourceKind?: PhotoSourceKind
  evidence?: { content?: string; title?: string; placeName?: string; address?: string; authorNickname?: string; nickname?: string; username?: string; bio?: string; photoUrls?: string[]; messages?: { id: string; authorNickname: string; content: string; photoUrl?: string }[] }
}
export interface AdminUser {
  uid: string; nickname: string; username: string; email: string; bio: string; photoURL: string
  createdAt: number; suspended: boolean; suspensionReason: string
}
