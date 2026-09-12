import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(root, 'src/data/openSourceLicenses.json')
const projects = [
  { directory: '', runtime: 'app', lockfile: 'package-lock.json' },
  { directory: 'backend/functions', runtime: 'server', lockfile: 'backend/functions/package-lock.json' },
]
const hash = value => createHash('sha256').update(value).digest('hex')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const cachePath = join(root, '.verification.local/license-partial.json')
const offline = process.argv.includes('--offline')
const previous = process.argv.includes('--resume') && existsSync(cachePath) ? readJson(cachePath)
  : existsSync(outputPath) ? readJson(outputPath) : null
const sources = {}
const dependencies = new Map()

for (const project of projects) {
  const lock = readJson(join(root, project.lockfile))
  sources[project.lockfile] = hash(JSON.stringify(lock))
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue
    const name = entry.name || path.split('node_modules/').at(-1)
    const key = `${name}@${entry.version}`
    const scope = entry.dev ? 'development' : project.runtime
    const direct = Object.hasOwn(lock.packages[''].dependencies || {}, name)
      || Object.hasOwn(lock.packages[''].devDependencies || {}, name)
    const dependency = dependencies.get(key) || {
      name, version: entry.version, license: entry.license,
      integrity: entry.integrity, scopes: new Set(), direct: false, directories: [],
    }
    dependency.scopes.add(scope)
    dependency.direct ||= direct
    dependency.directories.push(join(root, project.directory, path))
    dependencies.set(key, dependency)
  }
}

function validate(data) {
  const regenerate = 'node scripts/generate-open-source-licenses.mjs를 실행하고 src/data/openSourceLicenses.json을 잠금 파일과 함께 커밋해 주세요.'
  if (!data || !Array.isArray(data.packages) || !data.texts) {
    throw new Error(`라이선스 목록이 없거나 올바르지 않습니다. ${regenerate}`)
  }
  // sources records the lockfiles used during generation. npm can rewrite peer
  // flags and other metadata without changing any packages, so validate the
  // actual inventory and notices instead of requiring whole-file hashes to match.
  const indexed = new Map(data.packages.map(entry => [`${entry.name}@${entry.version}`, entry]))
  if (indexed.size !== data.packages.length) throw new Error(`라이선스 목록에 중복이 있습니다. ${regenerate}`)
  const missing = [...dependencies.keys()].filter(key => !indexed.has(key))
  const extra = [...indexed.keys()].filter(key => !dependencies.has(key))
  if (missing.length || extra.length) {
    throw new Error(`라이선스 목록이 의존성과 다릅니다. 누락: ${missing.join(', ') || '없음'}. 불필요: ${extra.join(', ') || '없음'}. ${regenerate}`)
  }
  for (const [key, dependency] of dependencies) {
    const entry = indexed.get(key)
    if (!entry?.license || entry.integrity !== dependency.integrity
      || (dependency.license && entry.license !== dependency.license)
      || JSON.stringify(entry.scopes) !== JSON.stringify([...dependency.scopes].sort(compare))
      || entry.direct !== dependency.direct || !Array.isArray(entry.documents) || !entry.documents.length) {
      throw new Error(`${key}: 라이선스 정보가 누락되었거나 오래되었습니다. ${regenerate}`)
    }
    for (const document of entry.documents) {
      const text = data.texts[document.textId]
      if (!text?.trim() || hash(text) !== document.textId || !document.source) {
        throw new Error(`${key}: 라이선스 원문을 확인해 주세요.`)
      }
    }
  }
}

if (process.argv.includes('--check')) {
  validate(previous)
  const declared = previous.packages.filter(entry => entry.noticeBasis === 'installed-declaration-and-source-headers').length
  const platforms = previous.packages.filter(entry => entry.noticeBasis === 'same-release-platform-notice').length
  console.log(`License inventory and stored text hashes verified: ${previous.packages.length} packages, both lockfiles covered. ${declared} use installed declarations/source headers plus separately attributed standard terms; ${platforms} optional binaries use same-release parent notices. This is not an independent legal-compliance determination.`)
  process.exit(0)
}

const texts = {}
const packages = []
const failures = []
const remoteCache = new Map()

async function getText(url) {
  if (!remoteCache.has(url)) {
    remoteCache.set(url, (async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`${response.status}: ${url}`)
      return response.text()
    })())
  }
  return remoteCache.get(url)
}

function repositoryUrl(repository) {
  const url = typeof repository === 'string' ? repository : repository?.url || ''
  return url.replace(/^git\+ssh:\/\/git@github\.com\//, 'https://github.com/').replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '')
}

// Several published monorepo packages omit a standalone LICENSE while retaining
// their license declaration and source copyright headers. Keep those exact
// installed notices; standard terms below are explicitly separate from attribution.
function installedAttribution(directory, metadata) {
  const documents = [{
    title: 'Published package license declaration and attribution',
    source: `${metadata.name}@${metadata.version}/package.json`,
    text: JSON.stringify({ name: metadata.name, version: metadata.version, license: metadata.license,
      author: metadata.author, contributors: metadata.contributors, repository: metadata.repository }, null, 2),
  }]
  const files = []
  function walk(prefix = '', depth = 0) {
    for (const entry of readdirSync(join(directory, prefix), { withFileTypes: true })) {
      if (files.length >= 100) return
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory() && depth < 3 && !['node_modules', '.git'].includes(entry.name)) walk(path, depth + 1)
      else if (entry.isFile() && /(?:\.[cm]?[jt]sx?|\.flow)$/i.test(entry.name)) files.push(path)
    }
  }
  walk()
  const found = new Set()
  for (const file of files) {
    const contents = readFileSync(join(directory, file), 'utf8').slice(0, 131072)
    for (const match of contents.matchAll(/\/\*[\s\S]*?\*\//g)) {
      const text = match[0].trim()
      if (!/copyright|licensed under|SPDX-License-Identifier/i.test(text) || found.has(text)) continue
      found.add(text)
      documents.push({ title: `${file} (published copyright/license notice)`, text,
        source: `${metadata.name}@${metadata.version}/${file}` })
    }
  }
  return documents
}

function standardLicenseDocuments(license) {
  const ids = license === '(MIT OR Apache-2.0)' ? ['MIT', 'Apache-2.0'] : [license]
  const starts = { MIT: /Permission is hereby granted/i, 'BSD-3-Clause': /Redistribution and use in source and binary forms/i,
    ISC: /Permission to use, copy, modify, and\/or distribute/i, 'Apache-2.0': /Apache License\s+Version 2\.0/,
    Unlicense: /This is free and unencumbered software/, 'MPL-2.0': /Mozilla Public License Version 2\.0/ }
  if (ids.some(id => !starts[id])) return []
  return ids.map(id => {
    for (const entry of previous?.packages || []) {
      if (entry.license !== id) continue
      for (const document of entry.documents) {
        const original = previous.texts[document.textId]
        const match = starts[id].exec(original || '')
        if (!match) continue
        // MIT, BSD and ISC publisher attributions precede their permission terms;
        // exclude that other package's attribution instead of assigning it here.
        return { title: `${id} standard terms (this package's attribution is shown separately)`,
          source: document.source, text: original.slice(match.index).trim() }
      }
    }
    return null
  }).filter(Boolean)
}

function documentFiles(directory, prefix = '', depth = 0) {
  const result = []
  for (const entry of readdirSync(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory() && depth < 4 && !['node_modules', '.git'].includes(entry.name)) {
      result.push(...documentFiles(directory, path, depth + 1))
    } else if (entry.isFile() && /(?:^|[._-])(licen[cs]e|notice|copying|copyright)(?:[._-]|$)/i.test(entry.name)
      && !/\.(?:js|ts|map|json|html)$/i.test(entry.name)) {
      result.push(path)
    }
  }
  return result.sort(compare)
}

function localDocuments(directory, metadata) {
  const files = documentFiles(directory)
  if (files.length) return files.map(path => ({
    title: path, text: readFileSync(join(directory, path), 'utf8'),
    source: `${metadata.name}@${metadata.version}/${path}`,
  }))
  // Some published packages keep their complete license inside a README or source header.
  const candidates = readdirSync(directory).filter(path => /^readme(?:\.|$)/i.test(path) && statSync(join(directory, path)).isFile())
  if (metadata.main && existsSync(join(directory, metadata.main)) && statSync(join(directory, metadata.main)).isFile()) candidates.push(metadata.main)
  for (const path of candidates) {
    const contents = readFileSync(join(directory, path), 'utf8')
    const match = /(?:^|\n)(?:#{1,6}\s*)?Licen[cs]e[^\n]*\n/i.exec(contents)
    const section = match ? contents.slice(match.index).trimStart().split(/\n#{1,6} /)[0] : contents.match(/^\/\*[\s\S]*?\*\//)?.[0]
    if (section && /(?:permission is hereby granted|redistribution and use)/i.test(section)
      && /(?:SOFTWARE|DAMAGE)/.test(section)) {
      return [{ title: `${path} (license)`, text: section.trim(), source: `${metadata.name}@${metadata.version}/${path}` }]
    }
  }
  return []
}

async function upstreamDocuments(metadata, registry) {
  // This release's publishing tree contains no separate license file.
  if (metadata.name === 'tr46' && metadata.version === '0.0.3') return []
  const repository = repositoryUrl(registry.repository || metadata.repository)
  const githubPath = /^https:\/\/github\.com\/([^/]+\/[^/#]+)/.exec(repository)?.[1]
  if (!githubPath) return []
  // The registry's publishing commit anchors the notice to the installed version.
  const refs = registry.gitHead ? [registry.gitHead] : [`v${metadata.version}`, metadata.version]
  const subdirectory = registry.repository?.directory || metadata.repository?.directory
  const directories = subdirectory ? [subdirectory, '']
    : metadata.name === '@humanfs/types' ? ['packages/core', ''] : ['']
  for (const ref of refs) {
    for (const directory of directories) {
      const base = `https://raw.githubusercontent.com/${githubPath}/${ref}/${directory ? `${directory}/` : ''}`
      for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'LICENCE', 'COPYING']) {
        const source = base + file
        const text = await getText(source)
        if (text?.trim()) {
          const result = [{ title: file, text, source }]
          for (const notice of ['NOTICE', 'NOTICE.txt']) {
            const noticeText = await getText(base + notice)
            if (noticeText?.trim()) result.push({ title: notice, text: noticeText, source: base + notice })
          }
          return result
        }
      }
    }
  }
  return []
}

async function collect(dependency) {
  const key = `${dependency.name}@${dependency.version}`
  const cached = previous?.packages.find(item => `${item.name}@${item.version}` === key && item.integrity === dependency.integrity
    && (!dependency.license || item.license === dependency.license))
  if (cached) {
    for (const document of cached.documents) texts[document.textId] = previous.texts[document.textId]
    packages.push({ ...cached, scopes: [...dependency.scopes].sort(compare), direct: dependency.direct })
    return
  }
  let metadata
  let documents = []
  for (const directory of dependency.directories) {
    if (!existsSync(join(directory, 'package.json'))) continue
    const installed = readJson(join(directory, 'package.json'))
    if (installed.version !== dependency.version || installed.name !== dependency.name) continue
    metadata = installed
    documents = localDocuments(directory, metadata)
    if (documents.length) break
  }
  let registry
  if (metadata && !documents.length) {
    const standard = standardLicenseDocuments(dependency.license || metadata.license)
    const directory = dependency.directories.find(path => existsSync(join(path, 'package.json'))
      && readJson(join(path, 'package.json')).version === metadata.version)
    if (directory && standard.length) documents = [...installedAttribution(directory, metadata), ...standard]
  }
  // npm omits foreign-platform binaries locally. These packages are explicitly
  // declared by the installed lightningcss release and use its same MPL terms.
  if (!metadata && dependency.name.startsWith('lightningcss-')) {
    const directory = join(root, 'node_modules/lightningcss')
    const parentPath = join(directory, 'package.json')
    if (existsSync(parentPath)) {
      const parent = readJson(parentPath)
      if (parent.version === dependency.version && parent.optionalDependencies?.[dependency.name] === dependency.version && dependency.license === parent.license) {
        metadata = { name: dependency.name, version: dependency.version, license: dependency.license, repository: parent.repository }
        documents = [{ title: 'Same-release platform dependency declaration',
          source: `lightningcss@${parent.version}/package.json`,
          text: JSON.stringify({ name: parent.name, version: parent.version, license: parent.license, repository: parent.repository,
            optionalDependencies: { [dependency.name]: parent.optionalDependencies[dependency.name] } }, null, 2) }, ...localDocuments(directory, parent)]
      }
    }
  }
  if (!metadata || !documents.length) {
    if (offline) throw new Error('No complete installed or previously verified license source. Run without --offline to fetch the publishing source.')
    registry = JSON.parse(await getText(`https://registry.npmjs.org/${encodeURIComponent(dependency.name)}/${dependency.version}`))
    metadata ||= registry
  }
  const license = dependency.license || metadata.license || metadata.licenses?.map(item => item.type).join(' OR ')
  if (!documents.length) documents = await upstreamDocuments(metadata, registry)
  if (!documents.length && license === 'MIT') {
    // A few publishers declare MIT but ship no license file, including at their publishing commit.
    // Preserve their actual attribution separately; never invent a copyright owner or year.
    const source = `https://registry.npmjs.org/${encodeURIComponent(dependency.name)}/${dependency.version}`
    documents.push({
      title: 'Package license declaration and attribution', source,
      text: JSON.stringify({ name: metadata.name, version: metadata.version, license,
        author: metadata.author, contributors: metadata.contributors, repository: metadata.repository }, null, 2),
    })
    for (const directory of dependency.directories) {
      if (!existsSync(join(directory, 'package.json'))) continue
      for (const file of readdirSync(directory).filter(path => /^readme(?:\.|$)/i.test(path) && statSync(join(directory, path)).isFile())) {
        const contents = readFileSync(join(directory, file), 'utf8')
        const match = /(?:^|\n)(?:#{1,6}\s*)?Licen[cs]e[^\n]*\n/i.exec(contents)
        if (match) documents.push({ title: `${file} (license declaration)`,
          text: contents.slice(match.index).trimStart().split(/\n#{1,6} /)[0],
          source: `${metadata.name}@${metadata.version}/${file}` })
      }
      break
    }
    const standardSource = 'https://raw.githubusercontent.com/spdx/license-list-data/v3.26.0/json/details/MIT.json'
    const standard = JSON.parse(await getText(standardSource)).licenseText
    // SPDX's copyright line is a placeholder, not an attribution for these packages.
    documents.push({ title: 'MIT standard license terms (attribution above)', source: standardSource,
      text: standard.slice(standard.indexOf('Permission is hereby granted')) })
  }
  if (!license || !documents.length) throw new Error(`${key}: license/notice missing (gitHead: ${registry?.gitHead || 'none'})`)
  const uniqueDocuments = new Map()
  for (const document of documents) {
    const text = document.text.replace(/\r\n/g, '\n').trim()
    const textId = hash(text)
    texts[textId] = text
    uniqueDocuments.set(textId, { title: document.title, textId, source: document.source })
  }
  packages.push({
    name: dependency.name, version: dependency.version, license,
    integrity: dependency.integrity, scopes: [...dependency.scopes].sort(compare),
    direct: dependency.direct, repository: repositoryUrl(metadata.repository),
    documents: [...uniqueDocuments.values()],
  })
}

const queue = [...dependencies.values()]
await Promise.all(Array.from({ length: 6 }, async () => {
  for (;;) {
    const dependency = queue.shift()
    if (!dependency) break
    try { await collect(dependency) } catch (error) {
      const failure = `${dependency.name}@${dependency.version}: ${String(error)}`
      failures.push(failure); console.error(failure)
    }
  }
}))
if (failures.length) {
  // Keep successful collection in an ignored cache for troubleshooting, never publish incomplete notices.
  mkdirSync(join(root, '.verification.local'), { recursive: true })
  writeFileSync(join(root, '.verification.local/license-partial.json'), JSON.stringify({ sources, packages, texts }))
  throw new Error(`Failed to collect ${failures.length} licenses. No published file was changed.`)
}
for (const entry of packages) {
  const declared = entry.documents.some(document => document.title.includes('standard terms (this package'))
  const platform = entry.documents.some(document => document.title === 'Same-release platform dependency declaration')
  if (!declared && !platform) continue
  entry.noticeBasis = declared ? 'installed-declaration-and-source-headers' : 'same-release-platform-notice'
  const text = declared
    ? `Source coverage: the installed package declares ${entry.license} in package.json but includes no standalone LICENSE document. Available copyright/license headers found in the installed source files are reproduced separately, when present. Standard license terms are included separately and their source is identified; the other source package's copyright owner/year is not assigned to this package. No copyright owner or year is inferred. The upstream version-specific LICENSE/NOTICE was not independently retrieved.`
    : `Source coverage: this optional platform binary is not installed on this host. Its exact version is declared by the same-release installed lightningcss parent and recorded in the lockfile. The same-release parent license and dependency declaration are reproduced. The optional binary package contents were not independently inspected.`
  const textId = hash(text)
  texts[textId] = text
  entry.documents = entry.documents.filter(document => document.title !== 'Notice source and coverage')
  entry.documents.unshift({ title: 'Notice source and coverage', textId, source: declared ? `${entry.name}@${entry.version}/package.json` : `lightningcss@${entry.version}/package.json` })
}
packages.sort((a, b) => Number(b.direct) - Number(a.direct) || compare(a.name, b.name) || compare(a.version, b.version))
const data = { sources, packages, texts: Object.fromEntries(Object.entries(texts).sort(([a], [b]) => compare(a, b))) }
validate(data)
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`)
console.log(`Generated ${packages.length} packages and ${Object.keys(texts).length} license/notice texts. Coverage limitations are recorded per package where upstream notices were unavailable.`)
