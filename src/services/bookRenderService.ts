import { doc, getDoc, getDocFromServer } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { requireDb } from '../lib/firebase'
import { readRenderResult, readRenderSummary, type RenderResult, type RenderSummary } from '../lib/book/render'
import { functionsClient } from './moderationService'

// Print files are made by the renderBookPdf function and kept in private Storage;
// bookRenders/{bookId} holds the latest result, readable by the author only.

/** A 200-page book takes about a minute on the server; the function may run nine. */
const RENDER_TIMEOUT_MS = 10 * 60 * 1000

/** The revision the server holds now, read past the local cache. Null if the book is gone. */
export async function serverBookRevision(bookId: string): Promise<number | null> {
  const snapshot = await getDocFromServer(doc(requireDb(), 'books', bookId))
  const revision = snapshot.exists() ? snapshot.get('revision') : null
  return Number.isInteger(revision) ? revision : null
}

/** The last finished print file of this book, if any. */
export async function lastBookRender(bookId: string): Promise<RenderSummary | null> {
  try {
    const snapshot = await getDoc(doc(requireDb(), 'bookRenders', bookId))
    return snapshot.exists() && snapshot.get('status') === 'done' ? readRenderSummary(snapshot.get('summary')) : null
  } catch {
    // The rules answer a book that was never rendered with permission-denied (no document to own).
    return null
  }
}

export async function requestBookRender(bookId: string, revision: number): Promise<RenderResult> {
  try {
    const call = httpsCallable<{ bookId: string; revision: number }, unknown>(functionsClient(), 'renderBookPdf', { timeout: RENDER_TIMEOUT_MS })
    const result = readRenderResult((await call({ bookId, revision })).data)
    if (!result) throw new Error('인쇄 파일 결과를 읽지 못했어요.')
    return result
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'functions/deadline-exceeded') throw new Error('인쇄 파일을 만드는 데 시간이 오래 걸리고 있어요. 잠시 뒤 다시 확인해 주세요.', { cause: error })
    if (code === 'functions/unavailable' || code === 'functions/not-found') throw new Error('서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.', { cause: error })
    // The function's own messages (precondition, not found, internal) are written for people.
    throw error
  }
}
