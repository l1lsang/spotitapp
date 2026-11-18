export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

export interface SaveQueueOptions<T> {
  write: (value: T) => Promise<void>
  /** Quiet time after the last change before writing. */
  delayMs: number
  onStatus: (status: SaveStatus, error?: unknown) => void
  timers?: { set: (run: () => void, ms: number) => unknown; clear: (handle: unknown) => void }
}

/**
 * Debounced saving with one write in flight at a time. Changes made during a write
 * are coalesced into one follow-up write of the newest value, so writes never race
 * and never land out of order. "saved" is reported only after `write` resolves.
 */
export function createSaveQueue<T>({ write, delayMs, onStatus, timers }: SaveQueueOptions<T>) {
  const setTimer = timers?.set ?? ((run: () => void, ms: number) => setTimeout(run, ms))
  const clearTimer = timers?.clear ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let latest: { value: T } | null = null
  let dirty = false
  let timer: unknown = null
  let running: Promise<void> | null = null
  let disposed = false

  const cancelTimer = () => { if (timer !== null) { clearTimer(timer); timer = null } }

  const run = (): Promise<void> => {
    if (running) return running
    if (!dirty || !latest || disposed) return Promise.resolve()
    const { value } = latest
    dirty = false
    onStatus('saving')
    running = write(value).then(
      () => { running = null; if (dirty) return run(); onStatus('saved') },
      error => { running = null; dirty = true; onStatus('error', error) },
    )
    return running
  }

  return {
    schedule(value: T) {
      if (disposed) return
      latest = { value }
      dirty = true
      onStatus('pending')
      cancelTimer()
      timer = setTimer(() => { timer = null; void run() }, delayMs)
    },
    /** Writes now (leaving the screen, app going to background, a retry button). */
    async flush() {
      cancelTimer()
      if (running) await running
      if (dirty) await run()
    },
    dispose() { cancelTimer(); disposed = true },
    hasUnsaved: () => dirty || running !== null,
  }
}
