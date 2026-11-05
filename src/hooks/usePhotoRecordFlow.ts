import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { File as NativeFile } from 'expo-file-system'
import type { ImagePickerAsset } from 'expo-image-picker'
import type { LatLng, PlaceSearchResult } from '../lib/mapLocation'
import {
  EMPTY_PHOTO_METADATA,
  getDistanceMeters,
  parseExifObject,
  parsePhotoMetadata,
  summarizePhotoMetadata,
  type PhotoMetadata,
  type PhotoSelectionSummary,
} from '../lib/photoMetadata'
import type { PhotoRecordPrefill } from '../lib/photoRecordBridge'
import { readLibraryLocations } from '../lib/photoLibraryLocation'
import { findNearbyPlaces } from '../lib/placeSearch'
import type { UploadPhoto } from '../services/storageService'

export const PHOTO_RECORD_MAX_FILES = 10
const PHOTO_MAX_BYTES = 20 * 1024 * 1024
// Reading takes milliseconds; a short floor keeps the progress sheet from flashing.
const MIN_READING_MS = 450

export interface PhotoRecordItem {
  id: string
  photo: UploadPhoto
  metadata: PhotoMetadata | null
}

export type PhotoRecordStep = 'reading' | 'confirm' | 'locate'
export type PhotoLocateReason = 'missing' | 'adjust'

export interface PhotoRecordFlowState {
  step: PhotoRecordStep
  // The representative photo (the one that places the pin) comes first once reading ends.
  items: PhotoRecordItem[]
  summary: PhotoSelectionSummary | null
  locateReason: PhotoLocateReason
  searchedPlace: PlaceSearchResult | null
}

// The picker's EXIF object on phones; the file bytes on the web or when no EXIF came back.
async function readAssetMetadata(asset: ImagePickerAsset): Promise<PhotoMetadata> {
  try {
    if (Platform.OS !== 'web' && asset.exif) return parseExifObject(asset.exif)
    const bytes = Platform.OS === 'web'
      ? new Uint8Array(await (asset.file ? asset.file.arrayBuffer() : (await fetch(asset.uri)).arrayBuffer()))
      : await new NativeFile(asset.uri).bytes()
    return parsePhotoMetadata(bytes)
  } catch {
    // Unreadable metadata never blocks a record; the user fills in the details.
    return EMPTY_PHOTO_METADATA
  }
}

export function toUploadPhoto(asset: ImagePickerAsset): UploadPhoto {
  return { uri: asset.uri, width: asset.width, height: asset.height, mimeType: asset.mimeType, name: asset.fileName || undefined, size: asset.fileSize }
}

export function usePhotoRecordFlow(focusMap: (location: LatLng) => void) {
  const [flow, setFlow] = useState<PhotoRecordFlowState | null>(null)
  const [error, setError] = useState('')
  const runRef = useRef(0)

  useEffect(() => () => { runRef.current += 1 }, [])

  const close = useCallback(() => {
    runRef.current += 1
    setFlow(null)
    setError('')
  }, [])

  const start = useCallback(async (selected: ImagePickerAsset[]) => {
    const tooLarge = selected.find((asset) => (asset.fileSize || 0) > PHOTO_MAX_BYTES)
    const valid = selected.filter((asset) => (asset.fileSize || 0) <= PHOTO_MAX_BYTES).slice(0, PHOTO_RECORD_MAX_FILES)
    setError(tooLarge
      ? `${tooLarge.fileName || '선택한 사진'}: 사진은 20MB 이하로 선택해 주세요.`
      : selected.length > PHOTO_RECORD_MAX_FILES ? `사진은 한 번에 ${PHOTO_RECORD_MAX_FILES}장까지 올릴 수 있어요.` : '')
    if (!valid.length) return

    const run = ++runRef.current
    const items: PhotoRecordItem[] = valid.map((asset, index) => ({ id: `${index}-${asset.assetId || asset.uri}`, photo: toUploadPhoto(asset), metadata: null }))
    setFlow({ step: 'reading', items, summary: null, locateReason: 'missing', searchedPlace: null })

    const startedAt = Date.now()
    const metadata = await Promise.all(valid.map(async (asset, index) => {
      const result = await readAssetMetadata(asset)
      if (run === runRef.current) {
        setFlow((previous) => previous && {
          ...previous,
          items: previous.items.map((entry) => entry.id === items[index].id ? { ...entry, metadata: result } : entry),
        })
      }
      return result
    }))
    // iOS: photos whose picked copy lost GPS get it from the photo library asset.
    const missing = metadata.map((item, index) => !item.location && Platform.OS === 'ios' ? valid[index].assetId : null)
    if (missing.some(Boolean)) {
      const recovered = await readLibraryLocations(missing)
      recovered.forEach((location, index) => { if (location) metadata[index] = { ...metadata[index], location } })
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, MIN_READING_MS - (Date.now() - startedAt))))
    if (run !== runRef.current) return

    const summary = summarizePhotoMetadata(metadata)
    const read = items.map((item, index) => ({ ...item, metadata: metadata[index] }))
    const ordered = summary.locationIndex > 0
      ? [read[summary.locationIndex], ...read.filter((_, index) => index !== summary.locationIndex)]
      : read
    setFlow({ step: summary.location ? 'confirm' : 'locate', items: ordered, summary, locateReason: 'missing', searchedPlace: null })
    if (summary.location) focusMap(summary.location)
  }, [focusMap])

  const locate = useCallback((reason: PhotoLocateReason) => {
    setFlow((previous) => previous && { ...previous, step: 'locate', locateReason: reason })
  }, [])

  const returnToPhotoLocation = useCallback(() => {
    const location = flow?.summary?.location
    if (!location) return
    focusMap(location)
    setFlow((previous) => previous && { ...previous, step: 'confirm', searchedPlace: null })
  }, [flow?.summary?.location, focusMap])

  const selectSearchedPlace = useCallback((place: PlaceSearchResult) => {
    focusMap(place.location)
    setFlow((previous) => previous && { ...previous, searchedPlace: place })
  }, [focusMap])

  const buildPrefill = useCallback((location: LatLng, source: PhotoRecordPrefill['source']): PhotoRecordPrefill | null => {
    if (!flow) return null
    // A searched place names the pin only while the pin still sits on it.
    const place = flow.searchedPlace && getDistanceMeters(flow.searchedPlace.location, location) <= 100 ? flow.searchedPlace : null
    return {
      files: flow.items.map((item) => item.photo),
      filesWithoutLocation: flow.items.filter((item) => !item.metadata?.location).map((item) => item.photo),
      location,
      source,
      takenAt: flow.summary?.takenAt ?? null,
      place,
    }
  }, [flow])

  return { flow, error, setError, start, close, locate, returnToPhotoLocation, selectSearchedPlace, buildPrefill }
}

export function useNearbyPlaces(location: LatLng | null) {
  const lat = location?.lat
  const lng = location?.lng
  const key = lat === undefined || lng === undefined ? '' : `${lat},${lng}`
  const [result, setResult] = useState<{ key: string; places: PlaceSearchResult[] } | null>(null)

  useEffect(() => {
    if (lat === undefined || lng === undefined) return
    let active = true
    findNearbyPlaces({ lat, lng }).then(
      (places) => { if (active) setResult({ key: `${lat},${lng}`, places }) },
      // Suggestions are optional; the user can always type the place name.
      () => { if (active) setResult({ key: `${lat},${lng}`, places: [] }) },
    )
    return () => { active = false }
  }, [lat, lng])

  const ready = Boolean(key) && result?.key === key
  return { loading: Boolean(key) && !ready, places: ready && result ? result.places : [] }
}
