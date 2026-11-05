const assert = require('node:assert/strict')
const test = require('node:test')
const { removedPostPhotoPaths, storagePathFromUrl } = require('./storagePaths')

const bucket = 'naran-235a6.firebasestorage.app'
const url = (path, host = 'https://firebasestorage.googleapis.com', name = bucket) =>
  `${host}/v0/b/${name}/o/${encodeURIComponent(path)}?alt=media&token=secret`

test('download URLs resolve to object paths only within the project bucket', () => {
  assert.equal(storagePathFromUrl(url('posts/u1/p1/a.jpg'), bucket), 'posts/u1/p1/a.jpg')
  assert.equal(storagePathFromUrl(url('posts/u1/p1/a b.jpg', 'http://127.0.0.1:9391'), bucket), 'posts/u1/p1/a b.jpg')
  assert.equal(storagePathFromUrl(url('posts/u1/p1/a.jpg', undefined, 'other-bucket'), bucket), '')
  for (const invalid of ['', 'not a url', 'https://example.test/v0/b/x', null, 42]) {
    assert.equal(storagePathFromUrl(invalid, bucket), '')
  }
})

test('photos removed while editing are deleted, including their thumbnails', () => {
  const before = {
    uid: 'u1',
    photoUrls: [url('posts/u1/p1/a.jpg'), url('posts/u1/p1/b.jpg')],
    photoThumbnailUrls: [url('posts/u1/p1/a-thumb.jpg'), url('posts/u1/p1/b-thumb.jpg')],
  }
  const after = { uid: 'u1', photoUrls: [url('posts/u1/p1/b.jpg')], photoThumbnailUrls: [url('posts/u1/p1/b-thumb.jpg')] }
  assert.deepEqual(removedPostPhotoPaths(before, after, 'p1', bucket).sort(), ['posts/u1/p1/a-thumb.jpg', 'posts/u1/p1/a.jpg'])
  assert.deepEqual(removedPostPhotoPaths(before, before, 'p1', bucket), [])
  // Older pins without thumbnails reuse the photo URL as its own thumbnail.
  assert.deepEqual(removedPostPhotoPaths({ uid: 'u1', photoUrls: [url('posts/u1/p1/a.jpg')], photoThumbnailUrls: [url('posts/u1/p1/a.jpg')] }, { uid: 'u1', photoUrls: [] }, 'p1', bucket), ['posts/u1/p1/a.jpg'])
})

test('a URL pointing outside the pin folder is never deleted', () => {
  const foreign = [url('posts/victim/p9/x.jpg'), url('profiles/u1/me.jpg'), url('posts/u1/p2/other.jpg'), url('posts/u1/p1x/y.jpg')]
  assert.deepEqual(removedPostPhotoPaths({ uid: 'u1', photoUrls: foreign }, { uid: 'u1', photoUrls: [] }, 'p1', bucket), [])
  assert.deepEqual(removedPostPhotoPaths({ uid: 'u/1', photoUrls: [url('posts/u/1/p1/a.jpg')] }, {}, 'p1', bucket), [])
  assert.deepEqual(removedPostPhotoPaths({ uid: 'u1', photoUrls: 'posts/u1/p1/a.jpg' }, {}, 'p1', bucket), [])
  assert.deepEqual(removedPostPhotoPaths(undefined, {}, 'p1', bucket), [])
})
