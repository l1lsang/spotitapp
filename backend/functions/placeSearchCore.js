const validPoint = point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180

// Older APKs may send a provider; every accepted request now uses Google.
function validateSearch(data) {
  if (!data || typeof data.keyword !== 'string' || !data.keyword.trim() || data.keyword.trim().length > 100 || !validPoint(data.center) || (data.provider !== undefined && !['kakao', 'google'].includes(data.provider))) {
    throw new Error('INVALID_SEARCH')
  }
  return { keyword: data.keyword.trim(), center: { lat: data.center.lat, lng: data.center.lng } }
}

async function searchPlaces(input, keys, request = fetch) {
  const { keyword, center } = validateSearch(input)
  if (!keys.google) throw new Error('MISSING_KEY')
  const response = await request('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': keys.google, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location' },
    body: JSON.stringify({ textQuery: keyword, languageCode: 'ko', pageSize: 10, locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 50000 } } }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('PROVIDER_ERROR')
  const data = await response.json()
  return (data.places || []).flatMap(place => {
    const location = { lat: place.location?.latitude, lng: place.location?.longitude }
    return validPoint(location) && place.id ? [{ id: 'google:' + place.id, name: place.displayName?.text || keyword, address: place.formattedAddress || '', location, provider: 'google' }] : []
  })
}
// Photo records suggest names within a short walk of where the photo was taken.
const NEARBY_RADIUS_METERS = 200
// Districts and streets are addresses, not names someone would give a visit.
const AREA_PLACE_TYPES = new Set([
  'political', 'locality', 'sublocality', 'neighborhood', 'route', 'country', 'postal_code',
  'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3', 'administrative_area_level_4',
])

function validateNearby(data) {
  if (!data || !validPoint(data.center)) throw new Error('INVALID_SEARCH')
  return { center: { lat: data.center.lat, lng: data.center.lng } }
}

async function searchNearbyPlaces(input, keys, request = fetch) {
  const { center } = validateNearby(input)
  if (!keys.google) throw new Error('MISSING_KEY')
  const response = await request('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': keys.google, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types' },
    body: JSON.stringify({ languageCode: 'ko', maxResultCount: 10, rankPreference: 'DISTANCE', locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: NEARBY_RADIUS_METERS } } }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('PROVIDER_ERROR')
  const data = await response.json()
  return (data.places || []).flatMap(place => {
    const location = { lat: place.location?.latitude, lng: place.location?.longitude }
    const name = place.displayName?.text
    return validPoint(location) && place.id && name && !(place.types || []).some(type => AREA_PLACE_TYPES.has(type))
      ? [{ id: 'google:' + place.id, name, address: place.formattedAddress || '', location, provider: 'google' }] : []
  })
}
module.exports = { searchPlaces, validateSearch, searchNearbyPlaces, validateNearby }
