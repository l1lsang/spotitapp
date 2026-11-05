export async function openDirectionsUrl(url: string): Promise<void> {
  // GPS permission is asynchronous; same-tab navigation avoids popup blockers.
  window.location.assign(url)
}
