import { PermissionsAndroid, Platform } from 'react-native'

// Android 10+ strips GPS from the EXIF of picked photos unless the app holds
// ACCESS_MEDIA_LOCATION, so the photo record flow asks for it before picking.
// https://developer.android.com/training/data-storage/shared/media#media-location-permission
export type MediaLocationAccess = 'granted' | 'denied' | 'not-needed'

let lastAccess: MediaLocationAccess = 'not-needed'

export async function ensureMediaLocationAccess(): Promise<MediaLocationAccess> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 29) return (lastAccess = 'not-needed')
  const permission = PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION
  try {
    if (await PermissionsAndroid.check(permission)) return (lastAccess = 'granted')
    const result = await PermissionsAndroid.request(permission, {
      title: '사진 위치 정보 사용',
      message: '사진에 저장된 촬영 위치로 핀을 자동으로 찍기 위해 사진의 위치 정보에 접근합니다.',
      buttonPositive: '허용',
      buttonNegative: '허용 안 함',
    })
    return (lastAccess = result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied')
  } catch {
    return (lastAccess = 'denied')
  }
}

// Whether the last pick ran without the permission, so a missing location may be ours, not the photo's.
export function wasMediaLocationDenied(): boolean {
  return lastAccess === 'denied'
}
