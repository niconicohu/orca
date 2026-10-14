import { useEffect, useRef, useState } from 'react'
import type { NativeScrollEvent, LayoutChangeEvent } from 'react-native'
import { styles } from './mobile-native-chat-view-styles'

/** Keep measuring offscreen until native scrolling acknowledges the intended position. */
export function useMobileChatInitialPosition(
  scopeKey: string,
  hasItems: boolean,
  offset: number | null,
  scroll: {
    pinToTail: () => void
    pinToTailAfterContentResize: (width: number, height: number) => void
  }
) {
  const scope = useRef(scopeKey)
  const generation = useRef(0)
  const frame = useRef<number | null>(null)
  const measurements = useRef({ height: 0, viewport: 0, aligned: false, version: 0 })
  const [shownGeneration, setShownGeneration] = useState(-1)
  const cancel = () => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }
  if (scope.current !== scopeKey) {
    cancel()
    scope.current = scopeKey
    generation.current += 1
    measurements.current = { height: 0, viewport: 0, aligned: false, version: 0 }
  }
  const current = generation.current
  const ready = shownGeneration === current
  const settle = () => {
    if (ready || frame.current !== null || !measurements.current.aligned) {
      return
    }
    let version = measurements.current.version
    let stableFrames = 0
    const startedAt = Date.now()
    const check = () => {
      frame.current = null
      if (generation.current !== current) {
        return
      }
      const latest = measurements.current
      stableFrames = latest.version === version && latest.aligned ? stableFrames + 1 : 0
      version = latest.version
      if (latest.aligned && (stableFrames >= 2 || Date.now() - startedAt >= 400)) {
        setShownGeneration(current)
      } else if (Date.now() - startedAt < 400) {
        frame.current = requestAnimationFrame(check)
      }
    }
    frame.current = requestAnimationFrame(check)
  }
  const measure = (key: 'height' | 'viewport', value: number) => {
    if (generation.current !== current || ready) {
      return
    }
    const latest = measurements.current
    if (value !== latest[key]) {
      latest[key] = value
      latest.version += 1
      latest.aligned = latest.height > 0 && latest.viewport > 0 && latest.height <= latest.viewport
    }
    settle()
  }
  useEffect(() => {
    if (!hasItems) {
      setShownGeneration(-1)
    }
    return () => {
      if (generation.current === current) {
        cancel()
      }
    }
  }, [hasItems, current])
  return {
    ready: !hasItems || ready,
    listProps: {
      style: [hasItems && !ready && styles.positioningList],
      pointerEvents: hasItems && !ready ? ('none' as const) : ('auto' as const),
      accessibilityElementsHidden: hasItems && !ready,
      importantForAccessibility:
        hasItems && !ready ? ('no-hide-descendants' as const) : ('auto' as const),
      onContentSizeChange: (width: number, height: number) => {
        measure('height', height)
        scroll.pinToTailAfterContentResize(width, height)
      },
      onLayout: (event?: LayoutChangeEvent) => {
        measure('viewport', event?.nativeEvent.layout.height ?? 0)
        scroll.pinToTail()
      }
    },
    contentMeasured: (height: number) => measure('height', height),
    layoutMeasured: (viewport: number) => measure('viewport', viewport),
    scrolled: (event: NativeScrollEvent) => {
      if (generation.current !== current || ready) {
        return
      }
      const latest = measurements.current
      const target =
        offset === null
          ? Math.max(0, event.contentSize.height - event.layoutMeasurement.height)
          : Math.min(offset, Math.max(0, event.contentSize.height - event.layoutMeasurement.height))
      latest.aligned =
        latest.height > 0 &&
        Math.abs(event.contentSize.height - latest.height) < 1 &&
        Math.abs(event.contentOffset.y - target) < 2
      settle()
    }
  }
}
