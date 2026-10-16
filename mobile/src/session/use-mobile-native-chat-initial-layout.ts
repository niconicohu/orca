import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'

type Geometry = { scope: string; height: number; viewport: number }
const MAX_DIAGRAM_WAIT_MS = 1_000

/** Hide native measurement and the tail pin, without depending on optional scroll events. */
export function useMobileNativeChatInitialLayout(
  scope: string,
  hasItems: boolean,
  pending = false
) {
  const geometry = useRef<Geometry>({ scope, height: 0, viewport: 0 })
  const frame = useRef<number | null>(null)
  const [revealed, setRevealed] = useState<Geometry | null>(null)
  const [expired, setExpired] = useState<Geometry | null>(null)
  const cancel = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [])
  if (geometry.current.scope !== scope) {
    cancel()
    geometry.current = { scope, height: 0, viewport: 0 }
  }
  const measured = geometry.current
  const ready = !hasItems || revealed === measured
  const waiting = pending && expired !== measured
  const confirm = useCallback(() => {
    if (ready || geometry.current !== measured) {
      return
    }
    if (waiting || measured.height <= 0 || measured.viewport <= 0) {
      cancel()
      return
    }
    if (frame.current !== null) {
      return
    }
    // The tail follower's queued native pin commits before the second stable frame.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        if (geometry.current === measured) {
          setRevealed(measured)
        }
      })
    })
  }, [ready, measured, cancel, waiting])
  useLayoutEffect(confirm, [confirm])
  useEffect(() => {
    if (ready) {
      return
    }
    // A slow WebView must not hold the person's entire transcript behind its placeholder.
    const timer = setTimeout(() => setExpired(measured), MAX_DIAGRAM_WAIT_MS)
    return () => clearTimeout(timer)
  }, [ready, measured])
  useEffect(() => cancel, [cancel])
  return {
    ready,
    recordLayout: useCallback(
      (event: LayoutChangeEvent) => {
        if (geometry.current !== measured) {
          return
        }
        const height = event.nativeEvent.layout.height
        if (measured.viewport !== height) {
          cancel()
        }
        measured.viewport = height
        confirm()
      },
      [measured, cancel, confirm]
    ),
    recordContent: useCallback(
      (height: number) => {
        if (geometry.current !== measured) {
          return
        }
        if (measured.height !== height) {
          cancel()
        }
        measured.height = height
        confirm()
      },
      [measured, cancel, confirm]
    )
  }
}
