import { useState } from 'react'

/**
 * True during the render in which `key` differs from the key of the previous render
 * (and on the first render too when `onMount` is set).
 *
 * Components use it to reset their own state as soon as an input changes, instead of
 * resetting it in an effect after the stale state has already been shown:
 * `if (useKeyChange(`${postId}:${uid}`)) { setItems([]); setLoading(true) }`.
 * This is React's "adjust state when a prop changes" pattern
 * (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
 * Without `onMount` the first render returns false, so initial state must already match the reset values.
 */
export function useKeyChange(key: string, onMount = false): boolean {
  const [current, setCurrent] = useState<string | null>(onMount ? null : key)
  if (current === key) return false
  setCurrent(key)
  return true
}
