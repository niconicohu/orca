import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'

type Geometry = { scope: string; height: number; viewport: number }
const LAYOUT_QUIET_MS = 200
const MAX_INITIAL_LAYOUT_WAIT_MS = 1_000

/** Hide native measurement and the tail pin, without depending on optional scroll events. */
export function useMobileNativeChatInitialLayout(
  scope: string,
  hasItems: boolean,
  pending = false
) {
  const geometry = useRef<Geometry>({ scope, height: 0, viewport: 0 })
  const frame = useRef<number | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [revealed, setRevealed] = useState<Geometry | null>(null)
  const [expired, setExpired] = useState<Geometry | null>(null)
  const cancel = useCallback(() => {
    if (settleTimer.current !== null) {
      clearTimeout(settleTimer.current)
      settleTimer.current = null
    }
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
  const timedOut = expired === measured
  const waiting = pending && !timedOut
  const confirm = useCallback(() => {
    if (ready || geometry.current !== measured) {
      return
    }
    if (waiting || measured.height <= 0 || measured.viewport <= 0) {
      cancel()
      return
    }
    if (frame.current !== null || settleTimer.current !== null) {
      return
    }
    const reveal = () => {
      settleTimer.current = null
      // Give the queued tail pin two frames after the measured layout settles.
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => {
          frame.current = null
          if (geometry.current === measured) {
            setRevealed(measured)
          }
        })
      })
    }
    if (timedOut) {
      reveal()
    } else {
      settleTimer.current = setTimeout(reveal, LAYOUT_QUIET_MS)
    }
  }, [ready, measured, cancel, waiting, timedOut])
  useLayoutEffect(() => {
    cancel()
    confirm()
  }, [confirm, cancel])
  useEffect(() => {
    if (ready) {
      return
    }
    // Live output and slow WebViews must not keep restarting the initial wait.
    const timer = setTimeout(() => setExpired(measured), MAX_INITIAL_LAYOUT_WAIT_MS)
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
        if (!timedOut && measured.viewport !== height) {
          cancel()
        }
        measured.viewport = height
        confirm()
      },
      [measured, cancel, confirm, timedOut]
    ),
    recordContent: useCallback(
      (height: number) => {
        if (geometry.current !== measured) {
          return
        }
        if (!timedOut && measured.height !== height) {
          cancel()
        }
        measured.height = height
        confirm()
      },
      [measured, cancel, confirm, timedOut]
    )
  }
}
