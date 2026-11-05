import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isNewerAppVersion, parseAppRelease } from '../src/lib/appRelease.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

class ReleaseInputError extends Error {}

export function parsePublishArgs(argv) {
  const options = {}
  const allowed = new Set(['platform', 'url', 'project', 'message', 'dry-run', 'help'])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const key = argument.startsWith('--') ? argument.slice(2) : ''
    if (!allowed.has(key) || Object.hasOwn(options, key)) {
      throw new ReleaseInputError('알 수 없거나 중복된 옵션입니다. --help로 사용법을 확인하세요.')
    }
    if (key === 'dry-run' || key === 'help') {
      options[key] = true
      continue
    }
    const value = argv[++index]
    if (value === undefined || value.startsWith('--')) {
      throw new ReleaseInputError('옵션 값이 누락되었습니다. --help로 사용법을 확인하세요.')
    }
    options[key] = value
  }
  if (options.help && Object.keys(options).length === 1) return options
  if (options.help) throw new ReleaseInputError('--help는 다른 옵션 없이 사용하세요.')
  if (!['android', 'ios'].includes(options.platform)) {
    throw new ReleaseInputError('--platform android 또는 --platform ios를 지정하세요.')
  }
  if (typeof options.project !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(options.project)) {
    throw new ReleaseInputError('--project에 Firebase 프로젝트 ID를 지정하세요. EAS 프로젝트 UUID는 사용할 수 없습니다.')
  }
  if (!options.url) throw new ReleaseInputError('--url에 실제 배포된 앱의 HTTPS 주소를 지정하세요.')
  return options
}

export function buildReleaseDocument(version, options) {
  const release = parseAppRelease({ version, url: options.url, message: options.message, enabled: true })
  if (!release) {
    throw new ReleaseInputError('앱 version은 숫자 세 부분의 안정 버전(예: 1.0.2), URL은 로그인 정보가 없는 HTTPS 주소(최대 2048자), 메시지는 최대 500자여야 합니다.')
  }
  return { ...release, enabled: true }
}

export function assertReleaseDoesNotDowngrade(previous, next) {
  if (previous === undefined) return
  // Validate the previous version independently of a previously disabled notice.
  if (!previous || !parseAppRelease({ ...next, version: previous.version })) {
    throw new ReleaseInputError('기존 출시 문서의 version이 올바르지 않습니다. Firebase 콘솔에서 문서를 확인하세요.')
  }
  if (isNewerAppVersion(previous.version, next.version)) {
    throw new ReleaseInputError('이미 게시된 버전보다 낮은 버전은 게시할 수 없습니다. app.config.ts의 version을 확인하세요.')
  }
}

export async function writeReleaseDocument(db, documentPath, release) {
  const reference = db.doc(documentPath)
  await db.runTransaction(async transaction => {
    const previous = await transaction.get(reference)
    assertReleaseDoesNotDowngrade(previous.exists ? previous.data() : undefined, release)
    transaction.set(reference, release)
  })
}

export async function main(argv = process.argv.slice(2)) {
  const options = parsePublishArgs(argv)
  if (options.help) {
    console.log('npm run release:publish -- --platform android|ios --project FIREBASE_PROJECT_ID --url HTTPS_URL [--message "안내 문구"] [--dry-run]\n\n--dry-run: 게시할 문서만 출력합니다. 생략하면 Application Default Credentials로 해당 플랫폼의 출시 알림을 게시합니다.')
    return
  }
  let version
  try {
    const { getConfig } = require('@expo/config')
    version = getConfig(root).exp.version
  } catch {
    throw new ReleaseInputError('Expo 앱 설정을 읽을 수 없습니다. 의존성 설치와 app.config.ts를 확인하세요.')
  }
  const release = buildReleaseDocument(version, options)
  const documentPath = `appReleases/${options.platform}`
  const output = { project: options.project, document: documentPath, ...release }
  if (options['dry-run']) {
    console.log(JSON.stringify(output, null, 2))
    return
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new ReleaseInputError('FIRESTORE_EMULATOR_HOST가 설정되어 있습니다. 실제 출시 알림 게시 전 해제하세요.')
  }
  const backendRequire = createRequire(resolve(root, 'backend/functions/package.json'))
  const { applicationDefault, deleteApp, initializeApp } = backendRequire('firebase-admin/app')
  const { getFirestore } = backendRequire('firebase-admin/firestore')
  const app = initializeApp({ projectId: options.project, credential: applicationDefault() })
  try {
    await writeReleaseDocument(getFirestore(app), documentPath, release)
    console.log(JSON.stringify(output, null, 2))
  } finally {
    await deleteApp(app)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    // SDK/config errors may contain credential paths or other private details.
    console.error(error instanceof ReleaseInputError ? error.message : '출시 알림 게시에 실패했습니다. 백엔드 의존성, Firebase 프로젝트, Application Default Credentials와 Firestore 권한을 확인하세요.')
    process.exitCode = 1
  })
}
