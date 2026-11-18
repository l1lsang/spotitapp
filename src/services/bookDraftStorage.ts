import AsyncStorage from '@react-native-async-storage/async-storage'
import type { BookDraft } from '../types/book'
import { draftStorageKey, isDraftStorageKey, readStoredDraft, serializeDraft, syncStorageKey, type StoredDraft } from '../lib/book/draft'
import { readSyncState, type SyncState } from '../lib/book/sync'

// This device's copy of each open book: the draft as last edited here, and what the
// server last confirmed. It lets the editor reopen offline and resend unsaved edits.

export async function loadBookLocal(uid: string, bookId: string): Promise<{ draft: StoredDraft; sync: SyncState | null }> {
  const [[, draft], [, sync]] = await AsyncStorage.multiGet([draftStorageKey(uid, bookId), syncStorageKey(uid, bookId)])
  return { draft: readStoredDraft(draft), sync: readSyncState(sync) }
}

export async function saveBookDraft(uid: string, draft: BookDraft): Promise<void> {
  await AsyncStorage.setItem(draftStorageKey(uid, draft.id), serializeDraft(draft))
}

export async function saveBookSync(uid: string, bookId: string, state: SyncState): Promise<void> {
  await AsyncStorage.setItem(syncStorageKey(uid, bookId), JSON.stringify(state))
}

/** After the book was deleted (here or on another device). */
export async function removeBookLocal(uid: string, bookId: string): Promise<void> {
  await AsyncStorage.multiRemove([draftStorageKey(uid, bookId), syncStorageKey(uid, bookId)])
}

/** Drafts hold private photos and words: they leave the device's storage on sign-out. */
export async function clearBookDrafts(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter(isDraftStorageKey)
  if (keys.length) await AsyncStorage.multiRemove(keys)
}
