export type ProfilePinAccess = 'owner' | 'following' | 'public' | 'locked'

export function getProfilePinAccess(ownerUid: string, viewerUid: string | undefined, isPrivate: boolean, followsOwner: boolean): ProfilePinAccess {
  if (!viewerUid) return 'locked'
  if (viewerUid === ownerUid) return 'owner'
  if (followsOwner) return 'following'
  return isPrivate ? 'locked' : 'public'
}
