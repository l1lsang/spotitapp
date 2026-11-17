import type { BookElement } from '../../types/book'
import { NO_TRANSFORM, type ElementTransform } from './geometry'

export interface GestureFrame {
  target: BookElement
  transform: ElementTransform
}

/**
 * Collects the pan, pinch and rotation of one touch sequence into a single edit.
 * The gestures start and end independently; the edit is handed back once, when the
 * last of them ends, so one drag-and-turn becomes one change (and later one undo step).
 */
export function createGestureSession() {
  let target: BookElement | null = null
  let transform: ElementTransform = NO_TRANSFORM
  let active = 0
  return {
    /** A gesture became active. The first one that brings an element picks the target. */
    begin(element: BookElement | null) {
      active += 1
      if (!target && element) {
        target = element
        transform = NO_TRANSFORM
      }
    },
    change(part: Partial<ElementTransform>): GestureFrame | null {
      if (!target) return null
      transform = { ...transform, ...part }
      return { target, transform }
    },
    /** A gesture ended. Returns the edit when it was the last one and something changed. */
    end(): GestureFrame | null {
      active = Math.max(0, active - 1)
      if (active > 0) return null
      const frame = target && transform !== NO_TRANSFORM ? { target, transform } : null
      target = null
      transform = NO_TRANSFORM
      return frame
    },
    isIdle: () => active === 0,
  }
}
