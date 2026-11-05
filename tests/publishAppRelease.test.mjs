import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertReleaseDoesNotDowngrade, buildReleaseDocument, parsePublishArgs, writeReleaseDocument } from '../scripts/publish-app-release.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = ['--platform', 'android', '--project', 'demo-spotit-release', '--url', 'https://releases.example.test/app.apk']
const release = buildReleaseDocument('1.0.2', parsePublishArgs(args))

test('publish command requires an explicit platform, project and URL without accepting credential flags', () => {
  assert.equal(parsePublishArgs(args).platform, 'android')
  assert.equal(parsePublishArgs(['--help']).help, true)
  for (const invalid of [[], args.slice(2), args.slice(0, 2).concat(args.slice(4)), args.slice(0, -2), [...args, '--token', 'not-a-secret'], [...args, '--project', 'another-project'], [...args, '--dry-run', 'false']]) {
    assert.throws(() => parsePublishArgs(invalid))
  }
})

test('publish validation shares app constraints for stable versions, URLs and messages', () => {
  assert.deepEqual(buildReleaseDocument('1.0.2', { url: release.url, message: '  새 기능을 만나보세요.  ' }), { ...release, message: '새 기능을 만나보세요.' })
  for (const version of ['1.0', '01.0.2', '1.0.2-beta', '1.0.2+build', '9007199254740992.0.0']) {
    assert.throws(() => buildReleaseDocument(version, { url: release.url }))
  }
  for (const url of ['http://releases.example.test/app.apk', 'https://name:password@releases.example.test/app.apk', 'javascript:alert(1)', 'https://releases.example.test/\napp.apk']) {
    assert.throws(() => buildReleaseDocument('1.0.2', { url }))
  }
  assert.throws(() => buildReleaseDocument('1.0.2', { url: release.url, message: 'a'.repeat(501) }))
})

test('publication allows first and same-version updates but blocks downgrade or an invalid previous version', () => {
  assert.doesNotThrow(() => assertReleaseDoesNotDowngrade(undefined, release))
  assert.doesNotThrow(() => assertReleaseDoesNotDowngrade({ version: '1.0.2', enabled: false }, release))
  assert.doesNotThrow(() => assertReleaseDoesNotDowngrade({ version: '1.0.1' }, release))
  assert.throws(() => assertReleaseDoesNotDowngrade({ version: '1.0.10' }, release))
  assert.throws(() => assertReleaseDoesNotDowngrade({ version: '2.0.0' }, release))
  assert.throws(() => assertReleaseDoesNotDowngrade({ version: 'invalid' }, release))
})

test('transaction checks the existing platform document before writing only that document', async () => {
  const reference = { path: 'appReleases/android' }
  let stored = { version: '1.0.1' }
  let writes = 0
  const db = {
    doc(path) { assert.equal(path, reference.path); return reference },
    async runTransaction(callback) {
      return callback({
        async get(ref) { assert.equal(ref, reference); return { exists: true, data: () => stored } },
        set(ref, data) { assert.equal(ref, reference); stored = data; writes += 1 },
      })
    },
  }
  await writeReleaseDocument(db, reference.path, release)
  assert.deepEqual(stored, release)
  assert.equal(writes, 1)
  stored = { version: '1.0.10' }
  await assert.rejects(writeReleaseDocument(db, reference.path, release))
  assert.equal(writes, 1)
})

test('dry-run prints only publication metadata without requiring usable Firebase credentials', () => {
  const child = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/publish-app-release.mjs', ...args, '--dry-run'], {
    cwd: root,
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: resolve(root, 'nonexistent-release-test-credentials.json'), FIRESTORE_EMULATOR_HOST: 'invalid-emulator-host' },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
  })
  assert.equal(child.status, 0, child.stderr)
  const output = JSON.parse(child.stdout)
  assert.deepEqual(Object.keys(output).sort(), ['document', 'enabled', 'project', 'url', 'version'])
  assert.equal(output.document, 'appReleases/android')
  assert.equal(output.project, 'demo-spotit-release')
  assert.equal(output.url, release.url)
  assert.match(output.version, /^\d+\.\d+\.\d+$/)
})
