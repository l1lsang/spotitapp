import { access, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(process.env.SPOTIT_FIREBASE_CLI_ROOT || join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools'), 'lib', 'bin', 'firebase.js')
await access(cli)
const config = join(root, '.verification.local', 'kakao-auth-cli-config')
await mkdir(config, { recursive: true })
const env = { ...process.env, XDG_CONFIG_HOME: config, CI: 'true' }
for (const name of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'DEBUG']) delete env[name]
const child = spawn(process.execPath, [cli, 'emulators:exec', '--non-interactive', '--config', 'backend/firebase.emulators.json', '--only', 'auth', '--project', 'demo-spotit-kakao', 'node --test backend/functions/kakaoAuth.integration.test.cjs'], { cwd: root, env, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
