import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isNewerAppVersion, parseAppRelease } from '../src/lib/appRelease.ts'

const release = { version: '1.10.0', url: 'https://play.google.com/store/apps/details?id=com.spotit.app' }

test('release versions compare all three numeric components', () => {
  for (const [latest, current] of [['1.10.0', '1.9.9'], ['2.0.0', '1.99.99'], ['1.0.11', '1.0.9'], ['0.1.0', '0.0.9']]) {
    assert.equal(isNewerAppVersion(latest, current), true)
    assert.equal(isNewerAppVersion(current, latest), false)
  }
  assert.equal(isNewerAppVersion('1.10.0', '1.10.0'), false)
})

test('malformed, prerelease and imprecise versions never trigger an update', () => {
  for (const invalid of ['', '1', '1.0', '1.0.0.1', 'v1.0.0', '01.0.0', '1.00.0', '1.0.01', '-1.0.0', '1.0.0-beta.1', '1.0.0+build', '1.0.0 ', '1.0.0\n', '9007199254740992.0.0', null, 100]) {
    assert.equal(isNewerAppVersion(invalid, '0.0.0'), false, String(invalid))
    assert.equal(isNewerAppVersion('99.99.99', invalid), false, String(invalid))
    assert.equal(parseAppRelease({ ...release, version: invalid }), null, String(invalid))
  }
})

test('valid release data permits a store or download HTTPS address and optional notice', () => {
  assert.deepEqual(parseAppRelease(release), release)
  assert.deepEqual(parseAppRelease({ ...release, enabled: true, message: '  새로운 앱 버전이 나왔습니다.  ', publishedAt: 1 }), {
    ...release, message: '새로운 앱 버전이 나왔습니다.',
  })
  assert.deepEqual(parseAppRelease({ ...release, message: '  ' }), release)
  assert.equal(parseAppRelease({ ...release, url: 'https://downloads.example.test/app.apk?version=1.10.0' }).url, 'https://downloads.example.test/app.apk?version=1.10.0')
  assert.equal(parseAppRelease({ ...release, message: '가'.repeat(500) }).message.length, 500)
})

test('disabled, missing and malformed release documents fail closed', () => {
  for (const value of [null, undefined, [], '1.0.0', {}, { version: '1.0.0' }, { ...release, enabled: false }, { ...release, enabled: 'true' }, { ...release, enabled: null }, { ...release, message: 1 }, { ...release, message: null }, { ...release, message: '가'.repeat(501) }]) {
    assert.equal(parseAppRelease(value), null)
  }
})

test('update URLs reject unsafe schemes, credentials, malformed addresses and control characters', () => {
  for (const url of ['', null, 1, 'http://example.test/app.apk', 'javascript:alert(1)', 'intent://app', 'market://details?id=com.spotit.app', 'file:///tmp/app.apk', '//example.test/app.apk', 'https:example.test', 'https://', 'https://user:pass@example.test/app.apk', 'https://user@example.test/app.apk', 'https://example.test/\napp.apk', 'https://example.test/a b.apk', 'https://example.test/\u0000app.apk', 'https://example.test/\\app.apk', `https://example.test/${'a'.repeat(2048)}`]) {
    assert.equal(parseAppRelease({ ...release, url }), null, String(url))
  }
})
