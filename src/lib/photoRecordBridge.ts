import type { LatLng, PlaceSearchResult } from './mapLocation'
import type { PhotoTakenAt } from './photoMetadata'
import type { UploadPhoto } from '../services/storageService'

export interface PhotoRecordPrefill {
  files: UploadPhoto[]
  filesWithoutLocation: UploadPhoto[]
  location: LatLng
  source: 'photo' | 'manual'
  takenAt: PhotoTakenAt | null
  place: PlaceSearchResult | null
}

export type MapRecordEvent =
  | { kind: 'created'; location: LatLng; groupId: string; photo: boolean }
  | { kind: 'change-location' }

// The record form is its own screen on phones. The map stays mounted underneath,
// so the selected photos and the flow step survive a trip to the form and back.
let prefill: PhotoRecordPrefill | null = null
const listeners = new Set<(event: MapRecordEvent) => void>()

export function setPhotoRecordPrefill(next: PhotoRecordPrefill | null) {
  prefill = next
}

export function readPhotoRecordPrefill(): PhotoRecordPrefill | null {
  return prefill
}

export function emitMapRecordEvent(event: MapRecordEvent) {
  listeners.forEach(listener => listener(event))
}

export function subscribeMapRecordEvents(listener: (event: MapRecordEvent) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
