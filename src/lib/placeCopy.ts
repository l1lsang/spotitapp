// What "주소 복사" on a pin's place panel puts on the clipboard: the place name, then
// its address on the next line when the address adds anything. Pasting it into a
// message or a map app search keeps both the name people recognise and the address.
import type { Post } from '../types/post'

const tidy = (value: string | undefined) => (value || '').replace(/\s+/g, ' ').trim()

export function getPlaceCopyText(place: Pick<Post, 'placeName' | 'address'>): string {
  const name = tidy(place.placeName)
  const address = tidy(place.address)
  if (!address || address === name) return name
  if (!name) return address
  return `${name}\n${address}`
}
