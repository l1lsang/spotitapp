import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch,
  type DocumentData, type Timestamp,
} from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import type { BookDraft, BookPage, BookSummary } from '../types/book'
import { BOOK_DRAFT_SCHEMA_VERSION, readBookMeta, readImageRef, readPage } from '../lib/book/draft'
import { bookMetaOf, pageContentOf, type SyncPlan } from '../lib/book/sync'
import type { ServerBook } from '../lib/book/bookSession'

// Book drafts on the server: books/{bookId} holds the title, cover and page order;
// books/{bookId}/pages/{pageId} holds one page each. Every write is one batch that
// raises the book's revision by one, which the security rules check.

const booksRef = () => collection(requireDb(), 'books')
const bookRef = (bookId: string) => doc(requireDb(), 'books', bookId)
const pagesRef = (bookId: string) => collection(requireDb(), 'books', bookId, 'pages')

/** A new id for a book the user is about to create. */
export function newBookId(): string {
  return doc(booksRef()).id
}

const toMillis = (value: unknown) => (value && typeof (value as Timestamp).toMillis === 'function' ? (value as Timestamp).toMillis() : 0)

function toSummary(id: string, data: DocumentData): BookSummary | null {
  const meta = readBookMeta(data)
  if (!meta || !Array.isArray(data.pageIds)) return null
  return {
    id, title: meta.title, specId: meta.specId, coverStyle: meta.coverStyle, coverPhoto: meta.coverPhoto,
    pageCount: data.pageIds.length, recordCount: meta.sourcePostIds.length, updatedAtMs: toMillis(data.updatedAt),
  }
}

/** The signed-in user's books, most recently edited first. */
export async function listMyBooks(uid: string): Promise<BookSummary[]> {
  const snapshot = await getDocs(query(booksRef(), where('uid', '==', uid)))
  return snapshot.docs
    .map(item => toSummary(item.id, item.data()))
    .filter((item): item is BookSummary => item !== null)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

function bookFields(draft: BookDraft) {
  const meta = bookMetaOf(draft)
  return { ...meta, coverPhoto: meta.coverPhoto ? { ...meta.coverPhoto } : null, schemaVersion: BOOK_DRAFT_SCHEMA_VERSION, status: 'draft' as const }
}

/** Plain objects only: Firestore rejects `undefined` and class instances. */
const pageData = (page: BookPage) => JSON.parse(JSON.stringify(pageContentOf(page))) as DocumentData

/** Creates the book with all its first pages in one write. Returns its revision (1). */
export async function createBook(uid: string, draft: BookDraft): Promise<number> {
  const batch = writeBatch(requireDb())
  batch.set(bookRef(draft.id), { uid, ...bookFields(draft), revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  for (const page of draft.pages) batch.set(doc(pagesRef(draft.id), page.id), pageData(page))
  await batch.commit()
  return 1
}

/** Reads a book and its pages. Pages missing on the server open as blank pages. */
export async function loadBook(uid: string, bookId: string): Promise<ServerBook> {
  const snapshot = await getDoc(bookRef(bookId))
  if (!snapshot.exists()) return { kind: 'missing' }
  const data = snapshot.data()
  if (data.uid !== uid) return { kind: 'missing' }
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion > BOOK_DRAFT_SCHEMA_VERSION) return { kind: 'newer' }
  const meta = readBookMeta(data)
  const pageIds: unknown[] = Array.isArray(data.pageIds) ? data.pageIds : []
  if (!meta || !Number.isInteger(data.revision) || !pageIds.length) return { kind: 'missing' }
  const stored = await getDocs(pagesRef(bookId))
  const byId = new Map(stored.docs.map(item => [item.id, readPage(item.data(), item.id)]))
  const pages = pageIds
    .filter((id): id is string => typeof id === 'string')
    .map(id => byId.get(id) ?? { id, background: { color: '#F7F2E8' }, elements: [] })
  const updated = toMillis(data.updatedAt)
  return {
    kind: 'ok', revision: data.revision,
    draft: {
      schemaVersion: BOOK_DRAFT_SCHEMA_VERSION, id: bookId, ...meta, coverPhoto: readImageRef(data.coverPhoto), pages,
      updatedAt: new Date(updated || Date.now()).toISOString(),
    },
  }
}

/** Sends the changed pages and the book document as one write on top of `plan.baseRevision`. */
export async function writeBookChanges(bookId: string, draft: BookDraft, plan: SyncPlan): Promise<void> {
  const batch = writeBatch(requireDb())
  batch.update(bookRef(bookId), { ...bookFields(draft), revision: plan.baseRevision + 1, updatedAt: serverTimestamp() })
  for (const page of plan.upserts) batch.set(doc(pagesRef(bookId), page.id), pageData(page))
  for (const pageId of plan.deletes) batch.delete(doc(pagesRef(bookId), pageId))
  await batch.commit()
}

/** Deletes a draft book and all of its pages. */
export async function deleteBook(bookId: string): Promise<void> {
  const pages = await getDocs(pagesRef(bookId))
  const batch = writeBatch(requireDb())
  for (const page of pages.docs) batch.delete(page.ref)
  batch.delete(bookRef(bookId))
  await batch.commit()
}

/** The server said no (rules), as opposed to not answering. */
export function isRefusal(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'permission-denied' || code === 'failed-precondition' || code === 'not-found'
}
