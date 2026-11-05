import { Linking } from 'react-native'

export async function openDirectionsUrl(url: string): Promise<void> {
  await Linking.openURL(url)
}
