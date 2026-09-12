export function getGroupMapUrl(groupId = ''): string {
  return groupId ? `/map?${new URLSearchParams({ group: groupId })}` : '/map'
}

export function isMapSection(pathname: string): boolean {
  return pathname === '/map' || pathname.startsWith('/map/')
    || pathname === '/groups' || pathname.startsWith('/groups/')
}
