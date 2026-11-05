// Download URLs name the bucket and object as /v0/b/<bucket>/o/<encoded path>,
// on the production host and the emulator alike.
function storagePathFromUrl(url, bucket) {
  if (typeof url !== 'string') return ''
  try {
    const match = new URL(url).pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/)
    return match && decodeURIComponent(match[1]) === bucket ? decodeURIComponent(match[2]) : ''
  } catch {
    return ''
  }
}

function photoPaths(post, bucket) {
  const urls = [post?.photoUrls, post?.photoThumbnailUrls].flatMap(list => Array.isArray(list) ? list : [])
  return urls.map(url => storagePathFromUrl(url, bucket)).filter(Boolean)
}

// Photo URLs are written by clients, so only files inside the pin's own folder are
// eligible: a URL copied from someone else's pin can never get their file deleted.
function removedPostPhotoPaths(before, after, postId, bucket) {
  if (typeof before?.uid !== 'string' || !before.uid || before.uid.includes('/')) return []
  const folder = `posts/${before.uid}/${postId}/`
  const kept = new Set(photoPaths(after, bucket))
  return [...new Set(photoPaths(before, bucket))].filter(path => path.startsWith(folder) && !kept.has(path))
}

module.exports = { storagePathFromUrl, removedPostPhotoPaths }
