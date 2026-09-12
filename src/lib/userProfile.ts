import { randomUUID } from 'expo-crypto'
export const USERNAME_MAX_LENGTH = 30
export const NICKNAME_MAX_LENGTH = 24
export const BIO_MAX_LENGTH = 150
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export function getUsernameError(value: string): string {
  const username = normalizeUsername(value)
  if (!username) return '사용자 이름을 입력해 주세요.'
  if (username.length > USERNAME_MAX_LENGTH) return '사용자 이름은 30자 이내로 입력해 주세요.'
  if (!/^[a-z0-9._]+$/.test(username)) return '영어, 숫자, 밑줄(_), 점(.)만 사용할 수 있습니다.'
  return ''
}

export function createRandomUsername(): string {
  return `user_${randomUUID().replaceAll('-', '').slice(0, 20)}`
}

export function getProfilePhotoError(file: {type:string;size:number}): string {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    return 'JPG, PNG, WebP, GIF 이미지를 선택해 주세요.'
  }
  if (file.size > PROFILE_PHOTO_MAX_BYTES) return '프로필 사진은 5MB 이하로 선택해 주세요.'
  return ''
}
