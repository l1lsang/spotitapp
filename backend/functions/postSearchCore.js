// Characters indexed per field. A memo has no length limit, so only its opening
// is searchable on the server; the caps keep every pin's index small.
const INDEXED_LENGTH = { title: 100, placeName: 100, address: 200, authorNickname: 50, content: 1000 }

// Keep identical to src/lib/feedSearch.ts: the app splits its query the same way.
function postSearchWords(value) {
  return typeof value === 'string' ? value.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean) : []
}

// Every one- and two-character piece of each word of the pin's title, place,
// address, author and memo. One array-contains lookup on a query word's first
// piece then finds the pin wherever that word appears, and the app keeps only
// the pins that contain every word.
function buildPostSearchTokens(post) {
  if (!post) return []
  const tokens = new Set()
  for (const [field, length] of Object.entries(INDEXED_LENGTH)) {
    const text = typeof post[field] === 'string' ? Array.from(post[field].normalize('NFKC').toLowerCase()).slice(0, length).join('') : ''
    for (const word of postSearchWords(text)) {
      const chars = Array.from(word)
      chars.forEach((char, index) => {
        tokens.add(char)
        if (index + 1 < chars.length) tokens.add(char + chars[index + 1])
      })
    }
  }
  return [...tokens].sort()
}

module.exports = { INDEXED_LENGTH, postSearchWords, buildPostSearchTokens }
