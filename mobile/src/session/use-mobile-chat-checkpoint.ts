import { useEffect, useRef } from 'react'
import { subscribeChatCheckpointFlush } from '../cache/mobile-chat-checkpoint-registry'

/** Throttle token-heavy streams; backgrounding and route teardown flush the latest checkpoint. */
export function useMobileChatCheckpoint(save: () => void): void {
  const latest = useRef(save)
  latest.current = save
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current === null) {
      timer.current = setTimeout(() => {
        timer.current = null
        latest.current()
      }, 2000)
    }
  })
  useEffect(() => {
    const flush = (): void => {
      if (timer.current !== null) {
        clearTimeout(timer.current)
      }
      timer.current = null
      latest.current()
    }
    const unsubscribe = subscribeChatCheckpointFlush(flush)
    return () => {
      unsubscribe()
      flush()
    }
  }, [])
}
