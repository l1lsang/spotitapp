// Lets pdf-lib use upstream fontkit 2 instead of its own fork (@pdf-lib/fontkit, last
// released 2021). The fork cannot parse CID-keyed CFF fonts such as Pretendard's OTF
// ("Not a CFF Font"); fontkit 2 can, but it dropped `encodeStream()`, which pdf-lib's
// subset embedder still calls. This wraps the one call.
import { EventEmitter } from 'node:events'
import * as fontkit from 'fontkit'

function streamOf(subset) {
  const stream = new EventEmitter()
  queueMicrotask(() => {
    try {
      stream.emit('data', new Uint8Array(subset.encode()))
      stream.emit('end')
    } catch (error) {
      stream.emit('error', error)
    }
  })
  return stream
}

export const fontkitAdapter = {
  create(bytes) {
    const font = fontkit.create(Buffer.from(bytes))
    const createSubset = font.createSubset.bind(font)
    font.createSubset = () => {
      const subset = createSubset()
      subset.encodeStream = () => streamOf(subset)
      return subset
    }
    return font
  },
}
