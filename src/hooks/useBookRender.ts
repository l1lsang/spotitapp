import { useCallback, useEffect, useRef, useState } from 'react'
import type { RenderSummary, SaveState } from '../lib/book/render'
import { lastBookRender, requestBookRender, serverBookRevision } from '../services/bookRenderService'

export type RenderPhase =
  | { kind: 'idle' }
  | { kind: 'working'; text: string }
  | { kind: 'error'; message: string }

/** Another request is drawing the same revision: ask again this often until it is done. */
const WAIT_MS = 15_000
const WAIT_TRIES = 40

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Makes the print file of the saved book on the server and keeps the latest result.
 * `save` says whether this device's copy is what the server holds.
 */
export function useBookRender(bookId: string, save: SaveState) {
  const [last, setLast] = useState<RenderSummary | null>(null)
  const [phase, setPhase] = useState<RenderPhase>({ kind: 'idle' })
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    let active = true
    lastBookRender(bookId).then(summary => { if (active && summary) setLast(summary) })
    return () => { active = false }
  }, [bookId])

  const start = useCallback(async () => {
    if (save.kind === 'unsaved') {
      setPhase({ kind: 'error', message: '아직 저장되지 않은 변경이 있어요. 편집 화면에서 저장이 끝난 뒤 다시 시도해 주세요.' })
      return
    }
    setPhase({ kind: 'working', text: '저장된 책을 확인하는 중…' })
    try {
      const revision = await serverBookRevision(bookId)
      if (revision === null) throw new Error('책을 찾을 수 없어요.')
      if (save.kind === 'saved' && revision !== save.revision) {
        throw new Error('다른 기기에서 저장한 내용이 있어요. 편집 화면을 다시 열어 최신 내용을 받은 뒤 시도해 주세요.')
      }
      if (!alive.current) return
      setPhase({ kind: 'working', text: '인쇄 파일을 만드는 중… 쪽이 많으면 1분 넘게 걸려요.' })
      for (let attempt = 0; attempt < WAIT_TRIES; attempt++) {
        const result = await requestBookRender(bookId, revision)
        if (!alive.current) return
        if (result.status === 'done') {
          setLast(result.summary)
          setPhase({ kind: 'idle' })
          return
        }
        setPhase({ kind: 'working', text: '다른 요청이 같은 인쇄 파일을 만들고 있어요. 끝나면 결과를 보여 드려요.' })
        await sleep(WAIT_MS)
        if (!alive.current) return
      }
      throw new Error('인쇄 파일이 아직 끝나지 않았어요. 잠시 뒤 다시 확인해 주세요.')
    } catch (error) {
      if (alive.current) setPhase({ kind: 'error', message: error instanceof Error && error.message ? error.message : '인쇄 파일을 만들지 못했어요.' })
    }
  }, [bookId, save])

  return { last, phase, start }
}
