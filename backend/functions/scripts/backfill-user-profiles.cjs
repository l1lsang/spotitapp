// One-off after deploying syncUserProfile: removes the sign-in email from every
// existing profile and builds the search index for profiles nobody has written since.
// Dry run by default. Uses Application Default Credentials for the given project.
//
//   node scripts/backfill-user-profiles.cjs --project naran-235a6
//   node scripts/backfill-user-profiles.cjs --project naran-235a6 --apply
const admin = require('firebase-admin')
const { FieldPath, FieldValue } = require('firebase-admin/firestore')
const { buildUserSearchTokens, sameTokens } = require('../userSearchCore')

const args = process.argv.slice(2)
const project = args[args.indexOf('--project') + 1]
const apply = args.includes('--apply')
if (!args.includes('--project') || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project || '')) {
  console.error('Usage: node scripts/backfill-user-profiles.cjs --project <firebase-project-id> [--apply]')
  process.exit(1)
}

admin.initializeApp({ projectId: project })
const db = admin.firestore()

async function main() {
  const writer = db.bulkWriter()
  // A profile changed since it was read is skipped: syncUserProfile handles that write itself.
  writer.onWriteError(error => error.code !== 5 && error.code !== 9 && error.failedAttempts < 5)
  let scanned = 0
  let changed = 0
  let emails = 0
  let last = null
  for (;;) {
    let page = db.collection('users').orderBy(FieldPath.documentId()).limit(500)
    if (last) page = page.startAfter(last)
    const snapshot = await page.get()
    if (snapshot.empty) break
    for (const profile of snapshot.docs) {
      scanned++
      const user = profile.data()
      const tokens = buildUserSearchTokens(user)
      const patch = {}
      if (!sameTokens(user.searchTokens, tokens)) patch.searchTokens = tokens
      if ('email' in user) { patch.email = FieldValue.delete(); emails++ }
      if (!Object.keys(patch).length) continue
      changed++
      if (apply) void writer.update(profile.ref, patch, { lastUpdateTime: profile.updateTime }).catch(() => {})
    }
    last = snapshot.docs.at(-1)
  }
  await writer.close()
  console.log(`${apply ? 'Updated' : 'Dry run: would update'} ${changed} of ${scanned} profiles (${emails} with a stored email).`)
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
