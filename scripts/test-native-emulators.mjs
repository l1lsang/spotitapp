import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

// Supported configuration overrides, not a read or modification of the user's
// Firebase config: configstore honors XDG_CONFIG_HOME, and firebase-tools honors
// FIREBASE_EMULATORS_PATH. Demo projects skip CLI authentication entirely.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cliRoot = process.env.SPOTIT_FIREBASE_CLI_ROOT || join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools')
const javaHome = process.env.SPOTIT_JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr'
const workspaceConfig = join(root, '.verification.local', 'firebase-config')
const workspaceCache = join(root, '.verification.local', 'firebase-emulators')
const cli = join(cliRoot, 'lib', 'bin', 'firebase.js')
await access(cli)
await access(join(javaHome, 'bin', 'java.exe'))
const metadata = JSON.parse(await readFile(join(cliRoot, 'lib', 'emulator', 'downloadableEmulatorInfo.json'), 'utf8')).firestore
assert.equal(metadata.version, '1.20.2', 'Review the installed emulator version before changing this runner')
const sourceJar = join(homedir(), '.cache', 'firebase', 'emulators', metadata.downloadPathRelativeToCacheDir)
// Use the already cached, checksum-verified binary; do not download anything.
const digest = createHash('sha256')
for await (const chunk of createReadStream(sourceJar)) digest.update(chunk)
assert.equal(digest.digest('hex'), metadata.expectedChecksumSHA256, 'Cached emulator checksum does not match the installed Firebase CLI manifest')
await mkdir(workspaceConfig, { recursive: true })
await mkdir(workspaceCache, { recursive: true })
await copyFile(sourceJar, join(workspaceCache, metadata.downloadPathRelativeToCacheDir))

const childEnv = {
  ...process.env,
  XDG_CONFIG_HOME: workspaceConfig,
  XDG_CACHE_HOME: join(root, '.verification.local', 'xdg-cache'),
  FIREBASE_EMULATORS_PATH: workspaceCache,
  JAVA_HOME: javaHome,
  PATH: `${join(javaHome, 'bin')};${process.env.PATH || ''}`,
  CI: 'true',
};
// Never pass an inherited production authentication context into this runner.
delete childEnv.GOOGLE_APPLICATION_CREDENTIALS
delete childEnv.FIREBASE_TOKEN
delete childEnv.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE
delete childEnv.GCLOUD_PROJECT
delete childEnv.GOOGLE_CLOUD_PROJECT
// Firebase treats any DEBUG value as verbose mode and logs the entire child
// environment; do not inherit the editor's unrelated DEBUG setting.
delete childEnv.DEBUG

console.log('Running demo-spotit-native with workspace-only CLI config and cached emulator.')
const child = spawn(process.execPath, [
  cli, 'emulators:exec', '--non-interactive', '--config', 'backend/firebase.emulators.json',
  '--only', 'auth,firestore', '--project', 'demo-spotit-native',
  'node --experimental-vm-modules --test tests/native-services.integration.test.mjs',
], { cwd: root, env: childEnv, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
