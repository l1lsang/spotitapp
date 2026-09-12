import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import {
  isLivePlaceStatusKey,
  type LivePlaceStatusInput,
  type LivePlaceStatusUpdate,
} from '../types/mapFeature'

interface AuthorInfo {
  uid: string
  nickname: string
}

interface TimestampLike {
  toMillis: () => number
}

function hasToMillis(value: unknown): value is TimestampLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  )
}

function toLivePlaceStatusUpdate(
  snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>,
): LivePlaceStatusUpdate | null {
  const data = snapshot.data()

  if (!data) {
    return null
  }

  const status = data as Omit<LivePlaceStatusUpdate, 'id' | 'tags'> & {
    id?: string
    tags?: unknown[]
  }
  const tags = Array.isArray(status.tags)
    ? status.tags.filter((tag): tag is LivePlaceStatusUpdate['tags'][number] =>
        typeof tag === 'string' && isLivePlaceStatusKey(tag),
      )
    : []

  return {
    ...status,
    id: status.id || snapshot.id,
    tags,
    note: status.note || '',
  }
}

function sortLiveStatusUpdates(updates: LivePlaceStatusUpdate[]): LivePlaceStatusUpdate[] {
  return [...updates].sort((left, right) => {
    const leftMillis = hasToMillis(left.createdAt) ? left.createdAt.toMillis() : 0
    const rightMillis = hasToMillis(right.createdAt) ? right.createdAt.toMillis() : 0

    return rightMillis - leftMillis
  })
}

export async function createLivePlaceStatus(
  input: LivePlaceStatusInput,
  author: AuthorInfo,
): Promise<string> {
  const db = requireDb()
  const statusRef = doc(collection(db, 'livePlaceStatusUpdates'))
  const tags = input.tags.filter(isLivePlaceStatusKey)

  if (tags.length === 0) {
    throw new Error('장소 상태를 하나 이상 선택해 주세요.')
  }

  await setDoc(statusRef, {
    id: statusRef.id,
    ...input,
    tags,
    note: input.note.trim(),
    uid: author.uid,
    authorNickname: author.nickname,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return statusRef.id
}

export function subscribePlaceStatusUpdates(
  placeId: string,
  onChange: (updates: LivePlaceStatusUpdate[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const statusQuery = query(
    collection(requireDb(), 'livePlaceStatusUpdates'),
    where('placeId', '==', placeId),
  )

  return onSnapshot(
    statusQuery,
    (snapshot) => {
      const updates = snapshot.docs
        .map(toLivePlaceStatusUpdate)
        .filter((update): update is LivePlaceStatusUpdate => Boolean(update))

      onChange(sortLiveStatusUpdates(updates))
    },
    onError,
  )
}
