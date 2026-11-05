const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { searchPlaces, validateSearch, searchNearbyPlaces, validateNearby } = require('./placeSearchCore')
const googleKey = defineSecret('GOOGLE_PLACES_SERVER_API_KEY')
const windows = new Map()

function limitRequests(request) {
  const now = Date.now()
  const identity = request.auth?.uid || request.rawRequest.ip || 'anonymous'
  const previous = windows.get(identity)
  const window = previous && previous.until > now ? previous : { count: 0, until: now + 60000 }
  if (++window.count > 30) throw new HttpsError('resource-exhausted', '잠시 후 다시 검색해 주세요.')
  windows.set(identity, window)
  if (windows.size > 2000) for (const [key, value] of windows) if (value.until <= now) windows.delete(key)
}

// Search is available before login, as on the web. Bound anonymous traffic and
// server concurrency; provider credentials never travel to the application.
exports.searchMapPlaces = onCall({ region: 'us-central1', timeoutSeconds: 25, maxInstances: 4, secrets: [googleKey] }, async request => {
  try { validateSearch(request.data) } catch { throw new HttpsError('invalid-argument', '검색어와 지도 위치를 확인해 주세요.') }
  limitRequests(request)
  try {
    return { places: await searchPlaces(request.data, { google: googleKey.value() }) }
  } catch {
    // Do not expose provider responses or API credentials in callable errors.
    throw new HttpsError('unavailable', '장소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.')
  }
})

// Place names near a photo's position. Only signed-in users record photos.
exports.searchNearbyMapPlaces = onCall({ region: 'us-central1', timeoutSeconds: 25, maxInstances: 4, secrets: [googleKey] }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인 후 이용해 주세요.')
  try { validateNearby(request.data) } catch { throw new HttpsError('invalid-argument', '지도 위치를 확인해 주세요.') }
  limitRequests(request)
  try {
    return { places: await searchNearbyPlaces(request.data, { google: googleKey.value() }) }
  } catch {
    throw new HttpsError('unavailable', '주변 장소를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.')
  }
})
