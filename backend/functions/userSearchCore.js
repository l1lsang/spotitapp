// Keep identical to src/lib/userSearch.ts: the app builds its query the same way.
function normalizeUserSearch(value) {
  return typeof value === 'string' ? value.normalize('NFKC').toLowerCase().trim().replace(/^@/, '') : ''
}

// Every one- and two-character piece of the nickname and username. One
// array-contains lookup on a query's first piece then finds the name wherever
// the query appears in it, and the app keeps only the names that contain it all.
function buildUserSearchTokens(user) {
  if (!user || user.onboardingComplete === false) return []
  const tokens = new Set()
  for (const text of [user.nickname, user.username].map(normalizeUserSearch)) {
    const chars = Array.from(text)
    chars.forEach((char, index) => {
      tokens.add(char)
      if (index + 1 < chars.length) tokens.add(char + chars[index + 1])
    })
  }
  return [...tokens].sort()
}

function sameTokens(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((token, index) => token === right[index])
}

module.exports = { normalizeUserSearch, buildUserSearchTokens, sameTokens }
