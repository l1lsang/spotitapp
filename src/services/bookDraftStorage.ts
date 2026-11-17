import AsyncStorage from '@react-native-async-storage/async-storage'
import type { BookDraft } from '../types/book'
import { draftStorageKey, isDraftStorageKey, parseDraft, serializeDraft } from '../lib/book/draft'

// Book drafts on this device. Milestone 1 keeps them only here; the server copy
// arrives with Milestone 3, and this store then becomes its offline journal.

export async function loadBookDraft(uid: string, bookId: string): Promise<BookDraft | null> {
  return parseDraft(await AsyncStorage.getItem(draftStorageKey(uid, bookId)))
}

export async function saveBookDraft(uid: string, draft: BookDraft): Promise<void> {
  await AsyncStorage.setItem(draftStorageKey(uid, draft.id), serializeDraft(draft))
}

/** Drafts hold private photos and words: they leave the device's storage on sign-out. */
export async function clearBookDrafts(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter(isDraftStorageKey)
  if (keys.length) await AsyncStorage.multiRemove(keys)
}
