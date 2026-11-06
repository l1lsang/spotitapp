import AsyncStorage from '@react-native-async-storage/async-storage'
import { ActionSheetIOS, Linking, Platform } from 'react-native'
import { getExternalMapUrl, mapAppLabels, type LatLng, type MapApp } from './mapLocation'

const STORAGE_KEY = 'pinori.preferredMapApp'

// Apple Maps is offered where its app is installed by default; other platforms keep Google Maps.
export const canChooseMapApp = Platform.OS === 'ios'

export async function loadPreferredMapApp(): Promise<MapApp> {
  if (!canChooseMapApp) return 'google'
  try { return (await AsyncStorage.getItem(STORAGE_KEY)) === 'google' ? 'google' : 'apple' }
  catch { return 'apple' }
}

export function savePreferredMapApp(app: MapApp): void {
  if (canChooseMapApp) AsyncStorage.setItem(STORAGE_KEY, app).catch(() => undefined)
}

/** Opens a pin in an external map. On iOS the user picks Apple or Google Maps first. */
export function openLocationInMaps(location: LatLng, label: string | undefined, onError: (message: string) => void): void {
  const open = (app: MapApp) => {
    let url: string
    try { url = getExternalMapUrl(location, app, label) }
    catch (error) { onError(error instanceof Error ? error.message : '지도를 열지 못했어요.'); return }
    Linking.openURL(url).catch(() => onError(`${mapAppLabels[app]}를 열지 못했어요.`))
  }
  if (!canChooseMapApp) { open('google'); return }
  void loadPreferredMapApp().then(preferred => {
    const apps: MapApp[] = preferred === 'google' ? ['google', 'apple'] : ['apple', 'google']
    ActionSheetIOS.showActionSheetWithOptions({
      title: '어떤 지도로 열까요?',
      options: [...apps.map(app => mapAppLabels[app]), '취소'],
      cancelButtonIndex: apps.length,
    }, index => {
      const app = apps[index]
      if (!app) return
      savePreferredMapApp(app)
      open(app)
    })
  })
}
