import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { parseAppRelease, type AppPlatform, type AppRelease } from '../lib/appRelease'
import { requireDb } from '../lib/firebase'

export function subscribeToAppRelease(
  platform: AppPlatform,
  onChange: (release: AppRelease | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(requireDb(), 'appReleases', platform),
    { includeMetadataChanges: true },
    snapshot => {
      // A cached notice may have been withdrawn or replaced while offline.
      if (!snapshot.metadata.fromCache) onChange(parseAppRelease(snapshot.data()))
    },
    onError,
  )
}
