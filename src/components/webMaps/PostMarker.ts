import { getPostMarkerColor, type PinTheme, type Post } from '../../types/post'

export function createPostMarkerContent(
  posts: Post[],
  currentUserUid: string | undefined,
  selectedPostId: string | undefined,
  onClick: () => void,
  preventMap?: () => void,
  pinThemes?: PinTheme[],
): HTMLButtonElement {
  const post = posts[0]
  const isMine = Boolean(currentUserUid && post.uid === currentUserUid)
  const isCluster = posts.length > 1
  const selected = posts.some((item) => item.id === selectedPostId)
  const marker = document.createElement('button')
  marker.type = 'button'
  marker.className = `daymark-map-pin ${isMine ? 'mine' : 'other'}${isCluster ? ' cluster' : ''}${selected ? ' selected' : ''}`
  marker.style.setProperty('--post-pin-color', getPostMarkerColor(post, currentUserUid, pinThemes))
  const label = isCluster ? `겹친 핀 ${posts.length}개 목록 보기` : `${post.title} · ${post.placeName} 핀 보기`
  marker.setAttribute('aria-label', label)
  marker.title = label
  if (selected) marker.setAttribute('aria-pressed', 'true')
  const content = document.createElement('span')
  content.textContent = isCluster ? `+${posts.length}` : ''
  marker.appendChild(content)
  for (const type of ['mousedown', 'touchstart', 'pointerdown', 'dblclick']) {
    marker.addEventListener(type, (event) => {
      event.stopPropagation()
      preventMap?.()
    })
  }
  marker.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    preventMap?.()
    onClick()
  })
  return marker
}
