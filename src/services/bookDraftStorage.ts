import AsyncStorage from '@react-native-async-storage/async-storage'
import type { BookDraft } from '../types/book'
import { draftStorageKey, isDraftStorageKey, readStoredDraft, serializeDraft, type StoredDraft } from '../lib/book/draft'

// Book drafts on this device. Milestone 1 and 2 keep them only here; the server copy
// arrives with Milestone 3, and this store then becomes its offline journal.

export async function loadBookDraft(uid: string, bookId: string): Promise<StoredDraft> {
  return readStoredDraft(await AsyncStorage.getItem(draftStorageKey(uid, bookId)))
}

export async function saveBookDraft(uid: string, draft: BookDraft): Promise<void> {
  await AsyncStorage.setItem(draftStorageKey(uid, draft.id), serializeDraft(draft))
}

/** Only after the user agreed to drop a draft that cannot be read. */
export async function removeBookDraft(uid: string, bookId: string): Promise<void> {
  await AsyncStorage.removeItem(draftStorageKey(uid, bookId))
}

/** Drafts hold private photos and words: they leave the device's storage on sign-out. */
export async function clearBookDrafts(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter(isDraftStorageKey)
  if (keys.length) await AsyncStorage.multiRemove(keys)
}
