// One-off after deploying syncPostSearchTokens: builds the feed search index for
// pins nobody has written since. Dry run by default. Uses Application Default
// Credentials for the given project.
//
//   node scripts/backfill-post-search.cjs --project naran-235a6
//   node scripts/backfill-post-search.cjs --project naran-235a6 --apply
const admin = require('firebase-admin')
const { FieldPath } = require('firebase-admin/firestore')
const { buildPostSearchTokens } = require('../postSearchCore')
const { sameTokens } = require('../userSearchCore')

const args = process.argv.slice(2)
const project = args[args.indexOf('--project') + 1]
const apply = args.includes('--apply')
if (!args.includes('--project') || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project || '')) {
  console.error('Usage: node scripts/backfill-post-search.cjs --project <firebase-project-id> [--apply]')
  process.exit(1)
}

admin.initializeApp({ projectId: project })
const db = admin.firestore()

async function main() {
  const writer = db.bulkWriter()
  // A pin changed since it was read is skipped: syncPostSearchTokens handles that write itself.
  writer.onWriteError(error => error.code !== 5 && error.code !== 9 && error.failedAttempts < 5)
  let scanned = 0
  let changed = 0
  let last = null
  for (;;) {
    let page = db.collection('posts').orderBy(FieldPath.documentId()).limit(500)
    if (last) page = page.startAfter(last)
    const snapshot = await page.get()
    if (snapshot.empty) break
    for (const pin of snapshot.docs) {
      scanned++
      const tokens = buildPostSearchTokens(pin.data())
      if (sameTokens(pin.data().searchTokens, tokens)) continue
      changed++
      if (apply) void writer.update(pin.ref, { searchTokens: tokens }, { lastUpdateTime: pin.updateTime }).catch(() => {})
    }
    last = snapshot.docs.at(-1)
  }
  await writer.close()
  console.log(`${apply ? 'Updated' : 'Dry run: would update'} ${changed} of ${scanned} pins.`)
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
