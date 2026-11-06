import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { emulatorHost, firebaseApp } from '../lib/firebase'
import type { AdminUser, CaseStatus, ModerationCase, ReportTarget } from '../types/moderation'

let instance: Functions | undefined
export function functionsClient() {
  if (!firebaseApp) throw new Error('Firebase 연결 설정을 확인해 주세요.')
  if (!instance) {
    instance = getFunctions(firebaseApp, 'us-central1')
    if (__DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true') connectFunctionsEmulator(instance, emulatorHost, 5001)
  }
  return instance
}
export async function moderationCall<T>(name: string, data: object = {}): Promise<T> {
  try { return (await httpsCallable<object, T>(functionsClient(), name)(data)).data }
  catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'functions/internal' || code === 'functions/unavailable' || code === 'functions/not-found') throw new Error('관리 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', { cause: error })
    throw error
  }
}
export const loginAdmin = (password: string) => moderationCall<{ token: string; expiresAt: number }>('adminLogin', { password })
export const logoutAdmin = (sessionToken: string) => moderationCall('adminLogout', { sessionToken })
export const submitReport = (target: ReportTarget, reason: string, details: string) => moderationCall<{ id: string; duplicate: boolean }>('submitModerationCase', { ...target, reason, details })
export const submitInquiry = (title: string, details: string, requestId: string) => moderationCall<{ id: string }>('submitModerationCase', { kind: 'inquiry', title, details, requestId })
export const listMyCases = () => moderationCall<{ cases: ModerationCase[] }>('listMyModerationCases')
export const listAdminCases = (sessionToken: string, kind: string, status: string, cursor?: string) => moderationCall<{ cases: ModerationCase[]; nextCursor: string | null }>('adminListCases', { sessionToken, kind, status, ...(cursor ? { cursor } : {}) })
export const reviewCase = (sessionToken: string, caseId: string, status: CaseStatus, note: string, reply: string, action: 'save' | 'hide' | 'restore') => moderationCall('adminReviewCase', { sessionToken, caseId, status, note, reply, action })
export interface AdminStats { users: number; posts: number; chats: number; openCases: number; newUsers: number; newPosts: number; suspendedUsers: number }
export const getAdminStats = (sessionToken: string) => moderationCall<AdminStats>('adminStats', { sessionToken })
export const searchAdminUsers = (sessionToken: string, field: string, search: string, cursor?: string) => moderationCall<{ users: AdminUser[]; nextCursor: string | null }>('adminSearchUsers', { sessionToken, field, search, ...(cursor ? { cursor } : {}) })
export const manageAdminUser = (sessionToken: string, targetUid: string, suspended: boolean, reason: string) => moderationCall('adminManageUser', { sessionToken, targetUid, suspended, reason })
