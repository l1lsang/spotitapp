const assert = require('node:assert/strict')
const test = require('node:test')
const { searchPlaces, validateSearch } = require('./placeSearchCore')
const input = { keyword: ' 서울숲 ', center: { lat: 37.5, lng: 127 } }
const ok = data => ({ ok: true, json: async () => data })

test('search validates keywords and coordinates before requests', async () => {
  for (const value of [null, { ...input, keyword: ' ' }, { ...input, keyword: 'x'.repeat(101) }, { ...input, provider: 'unknown' }, { ...input, center: { lat: 91, lng: 0 } }, { ...input, center: { lat: NaN, lng: 0 } }]) {
    assert.throws(() => validateSearch(value), /INVALID_SEARCH/)
  }
  assert.deepEqual(validateSearch(input), { ...input, keyword: '서울숲' })
  await assert.rejects(searchPlaces(input, {}, () => assert.fail('No key must not send a request')), /MISSING_KEY/)
})

test('all clients, including older APKs, search only Google with compatible IDs', async () => {
  for (const provider of [undefined, 'google', 'kakao']) {
    let calls = 0
    const result = await searchPlaces({ ...input, provider }, { google: 'test-key' }, async (url, options) => {
      calls++
      assert.equal(url, 'https://places.googleapis.com/v1/places:searchText')
      assert.equal(options.headers['X-Goog-Api-Key'], 'test-key')
      const body = JSON.parse(options.body)
      assert.equal(body.textQuery, '서울숲')
      assert.equal(body.locationBias.circle.center.longitude, 127)
      assert.equal(body.languageCode, 'ko')
      return ok({ places: [
        { id: 'ChIJ_test', displayName: { text: '서울숲' }, formattedAddress: '서울', location: { latitude: 37.54, longitude: 127.03 } },
        { id: 'bad', location: { latitude: 91, longitude: 0 } },
        { id: 'missing' },
      ] })
    })
    assert.equal(calls, 1)
    assert.deepEqual(result, [{ id: 'google:ChIJ_test', name: '서울숲', address: '서울', location: { lat: 37.54, lng: 127.03 }, provider: 'google' }])
  }
})

test('empty results are distinct from provider failures; error bodies stay private', async () => {
  assert.deepEqual(await searchPlaces(input, { google: 'test-key' }, async () => ok({})), [])
  await assert.rejects(searchPlaces(input, { google: 'test-key' }, async () => ({ ok: false, json: () => assert.fail('Do not expose provider errors') })), /PROVIDER_ERROR/)
})

const { searchNearbyPlaces, validateNearby } = require('./placeSearchCore')

test('nearby search validates the photo position before requests', async () => {
  for (const value of [null, {}, { center: { lat: 91, lng: 0 } }, { center: { lat: NaN, lng: 0 } }]) {
    assert.throws(() => validateNearby(value), /INVALID_SEARCH/)
  }
  await assert.rejects(searchNearbyPlaces({ center: input.center }, {}, () => assert.fail('No key must not send a request')), /MISSING_KEY/)
})

test('nearby search ranks by distance within a short walk and drops districts and streets', async () => {
  let calls = 0
  const result = await searchNearbyPlaces({ center: input.center }, { google: 'test-key' }, async (url, options) => {
    calls++
    assert.equal(url, 'https://places.googleapis.com/v1/places:searchNearby')
    assert.match(options.headers['X-Goog-FieldMask'], /places\.types/)
    const body = JSON.parse(options.body)
    assert.equal(body.rankPreference, 'DISTANCE')
    assert.equal(body.locationRestriction.circle.radius, 200)
    assert.equal(body.locationRestriction.circle.center.latitude, 37.5)
    return ok({ places: [
      { id: 'cafe', displayName: { text: '서울숲 카페' }, formattedAddress: '대한민국 서울', location: { latitude: 37.5001, longitude: 127.0001 }, types: ['cafe'] },
      { id: 'district', displayName: { text: '성동구' }, location: { latitude: 37.5, longitude: 127 }, types: ['political', 'sublocality'] },
      { id: 'unnamed', location: { latitude: 37.5, longitude: 127 } },
    ] })
  })
  assert.equal(calls, 1)
  assert.deepEqual(result, [{ id: 'google:cafe', name: '서울숲 카페', address: '대한민국 서울', location: { lat: 37.5001, lng: 127.0001 }, provider: 'google' }])
  await assert.rejects(searchNearbyPlaces({ center: input.center }, { google: 'test-key' }, async () => ({ ok: false })), /PROVIDER_ERROR/)
})
