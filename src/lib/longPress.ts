// Keep a normal tap (including photo links) and scrolling separate from a hold.
export function createLongPress(onHold: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let origin: { x: number; y: number } | null = null
  let suppressClick = false

  function cancel() {
    clearTimeout(timer)
    timer = undefined
    origin = null
  }

  function open() {
    cancel()
    suppressClick = true
    onHold()
  }

  return {
    start(x: number, y: number) {
      cancel()
      suppressClick = false
      origin = { x, y }
      timer = setTimeout(open, 500)
    },
    move(x: number, y: number) {
      if (origin && Math.hypot(x - origin.x, y - origin.y) > 10) cancel()
    },
    cancel,
    open,
    consumeClick() {
      const shouldSuppress = suppressClick
      suppressClick = false
      return shouldSuppress
    },
  }
}
