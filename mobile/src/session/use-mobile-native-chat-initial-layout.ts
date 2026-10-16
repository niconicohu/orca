import { useCallback, useEffect, useRef, useState } from 'react'
import type { LayoutChangeEvent, NativeScrollEvent } from 'react-native'

type Geometry = {
  scope: string
  height: number
  viewport: number
  offset: number
  lastScroll?: NativeScrollEvent
}

function atMeasuredBottom({ height, viewport, offset, lastScroll }: Geometry): boolean {
  const bottom = Math.max(0, height - viewport)
  const acknowledged =
    bottom === 0 ||
    (lastScroll !== undefined &&
      Math.abs(lastScroll.contentSize.height - height) <= 2 &&
      Math.abs(lastScroll.layoutMeasurement.height - viewport) <= 2)
  return height > 0 && viewport > 0 && acknowledged && Math.abs(bottom - offset) <= 2
}

/** Hide the initial pin and virtualized-row measurements, then leave normal scrolling alone. */
export function useMobileNativeChatInitialLayout(scope: string, hasItems: boolean) {
  const geometry = useRef<Geometry>({ scope, height: 0, viewport: 0, offset: 0 })
  const frame = useRef<number | null>(null)
  const [revealed, setRevealed] = useState<Geometry | null>(null)
  const cancel = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [])
  if (geometry.current.scope !== scope) {
    cancel()
    geometry.current = { scope, height: 0, viewport: 0, offset: 0 }
  }
  const measured = geometry.current
  const ready = !hasItems || revealed === measured
  const confirm = useCallback(() => {
    if (ready || geometry.current !== measured) {
      return
    }
    // Native scroll acknowledgement and layout callbacks can arrive in either order.
    const observed = measured.lastScroll
    if (
      observed &&
      Math.abs(observed.contentSize.height - measured.height) <= 2 &&
      Math.abs(observed.layoutMeasurement.height - measured.viewport) <= 2
    ) {
      measured.offset = observed.contentOffset.y
    }
    if (!atMeasuredBottom(measured)) {
      cancel()
      return
    }
    if (frame.current !== null) {
      return
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        if (geometry.current === measured && atMeasuredBottom(measured)) {
          setRevealed(measured)
        }
      })
    })
  }, [ready, measured, cancel])
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
    ),
    recordScroll: useCallback(
      (event: NativeScrollEvent) => {
        if (geometry.current !== measured) {
          return
        }
        measured.lastScroll = event
        confirm()
      },
      [measured, confirm]
    )
  }
}
