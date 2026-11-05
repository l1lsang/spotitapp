import assert from 'node:assert/strict'
import test from 'node:test'
import { getExternalMapUrl, isValidLocation } from '../src/lib/mapLocation.ts'
import { clusterPosts } from '../src/lib/mapClusters.ts'
import { getDirectionsUrl, startMapDirections } from '../src/lib/mapDirections.ts'
import { withLocationTimeout } from '../src/lib/locationTimeout.ts'
import { projectMapPoint } from '../src/lib/mapProjection.ts'

test('equator and prime meridian are valid; malformed coordinates are rejected', () => {
  for (const location of [{ lat: 0, lng: 0 }, { lat: 0, lng: 20 }, { lat: 51.5, lng: 0 }]) assert.ok(isValidLocation(location))
  for (const location of [{ lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: 0, lng: Infinity }]) assert.equal(isValidLocation(location), false)
})

const post = (id, lat, lng) => ({ id, lat, lng })
const project = ({ lat, lng }) => ({ x: lng * 1000, y: lat * 1000 })

test('coincident pins remain grouped at any zoom and every post is preserved', () => {
  const posts = [post('a', 37.5, 127), post('b', 37.5, 127), post('c', 36, 127)]
  const groups = clusterPosts(posts, project)
  assert.deepEqual(groups.map((group) => group.posts.map((item) => item.id)), [['a', 'b'], ['c']])
  assert.deepEqual(clusterPosts(posts, () => null).map((group) => group.posts.length), [2, 1])
  assert.equal(posts.length, 3)
})

test('visually overlapping pins group, then separate when zoomed in', () => {
  const posts = [post('a', 37, 127), post('b', 37.03, 127)]
  assert.equal(clusterPosts(posts, project).length, 1)
  assert.equal(clusterPosts(posts, (location) => { const p = project(location); return { x: p.x * 2, y: p.y * 2 } }).length, 2)
})

test('overlap across neighboring groups is combined without losing entries', () => {
  const groups = clusterPosts([post('a', 0, 0), post('b', 0, 0.06), post('bridge', 0, 0.03)], project)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].posts.length, 3)
})

test('invalid coordinates never reach SDK projection', () => {
  const posts = [post('bad', NaN, 127), post('outside', 90.1, 0), post('valid', 0, 0)]
  const groups = clusterPosts(posts, (location) => { assert.ok(isValidLocation(location)); return project(location) })
  assert.deepEqual(groups[0].posts.map((item) => item.id), ['valid'])
  assert.deepEqual(clusterPosts([], project), [])
})

test('every external map link uses Google with exact pin coordinates', () => {
  for (const location of [{ lat: 37.5, lng: 127 }, { lat: 48.85, lng: 2.35 }, { lat: 0, lng: 0 }]) {
    const url = new URL(getExternalMapUrl(location))
    assert.equal(url.origin, 'https://www.google.com')
    assert.equal(url.pathname, '/maps/search/')
    assert.equal(url.searchParams.get('query'), `${location.lat},${location.lng}`)
  }
  assert.throws(() => getExternalMapUrl({ lat: NaN, lng: 127 }))
})

test('native Mercator projection separates nearby pins at higher zoom and wraps the date line', () => {
  const center = { lat: 37.5, lng: 127 }
  const posts = [post('one', 37.5, 127), post('two', 37.5005, 127)]
  assert.equal(clusterPosts(posts, point => projectMapPoint(point, center, 15)).length, 1)
  assert.equal(clusterPosts(posts, point => projectMapPoint(point, center, 18)).length, 2)
  const edge = projectMapPoint({ lat: 0, lng: -179.999 }, { lat: 0, lng: 179.999 }, 10)
  assert.ok(Math.abs(edge.x) < 2)
  assert.equal(edge.y, 0)
  assert.ok(Number.isFinite(projectMapPoint({ lat: 90, lng: 0 }, center, 15).y))
})

test('directions explicitly carry current origin, selected destination and travel mode', () => {
  const origin = { lat: 37.5, lng: 127 }
  const destination = { lat: 37.54, lng: 127.03 }
  for (const mode of ['transit', 'walking', 'driving']) {
    const url = new URL(getDirectionsUrl(origin, destination, mode))
    assert.equal(url.origin, 'https://www.google.com')
    assert.equal(url.pathname, '/maps/dir/')
    assert.equal(url.searchParams.get('api'), '1')
    assert.equal(url.searchParams.get('origin'), '37.5,127')
    assert.equal(url.searchParams.get('destination'), '37.54,127.03')
    assert.equal(url.searchParams.get('travelmode'), mode)
  }
  assert.equal(new URL(getDirectionsUrl({ lat: 0, lng: 0 }, destination)).searchParams.get('travelmode'), 'transit')
  assert.throws(() => getDirectionsUrl(origin, destination, 'flying'))
  assert.throws(() => getDirectionsUrl(origin, { lat: 91, lng: 0 }))
})

test('missing or invalid current location never opens directions or guesses an origin', async () => {
  for (const origin of [null, undefined, { lat: NaN, lng: 127 }, { lat: 91, lng: 0 }]) {
    await assert.rejects(startMapDirections({ lat: 37.5, lng: 127 }, 'transit', {
      getCurrentLocation: async () => origin,
      openUrl: async () => assert.fail('Must not open without a current location'),
      isCancelled: () => false,
    }), /현재 위치를 확인할 수 없어/)
  }
})

test('directions use fresh GPS and report launch failure without claiming no route exists', async () => {
  const events = []
  const actions = {
    getCurrentLocation: async () => { events.push('gps'); return { lat: 0, lng: 0 } },
    openUrl: async url => { events.push('open'); assert.equal(new URL(url).searchParams.get('origin'), '0,0') },
    isCancelled: () => false,
  }
  assert.equal(await startMapDirections({ lat: 37.5, lng: 127 }, 'transit', actions), true)
  assert.deepEqual(events, ['gps', 'open'])
  await assert.rejects(startMapDirections({ lat: 37.5, lng: 127 }, 'transit', { ...actions, openUrl: async () => { throw new Error('unavailable') } }), /Google 지도를 열지 못해/)
})

test('closing the dialog while GPS is pending prevents a late map launch', async () => {
  let resolveLocation
  let cancelled = false
  const result = startMapDirections({ lat: 37.5, lng: 127 }, 'transit', {
    getCurrentLocation: () => new Promise(resolve => { resolveLocation = resolve }),
    openUrl: async () => assert.fail('Closed dialog must not open maps'),
    isCancelled: () => cancelled,
  })
  cancelled = true
  resolveLocation({ lat: 37.54, lng: 127.03 })
  assert.equal(await result, false)
})

test('GPS wait is bounded and preserves successful results and errors', async () => {
  await assert.rejects(withLocationTimeout(new Promise(() => {}), 5), /현재 위치를 확인하는 데 시간이 오래/)
  const point = { lat: 37.5, lng: 127 }
  assert.equal(await withLocationTimeout(Promise.resolve(point), 100), point)
  await assert.rejects(withLocationTimeout(Promise.reject(new Error('GPS off')), 100), /GPS off/)
})
