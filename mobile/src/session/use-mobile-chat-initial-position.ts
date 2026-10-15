import { recordChatDiagnostic } from '../diagnostics/chat-runtime-diagnostics'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeScrollEvent, LayoutChangeEvent, ViewToken } from 'react-native'

const INITIAL_POSITION_VIEWABILITY = { viewAreaCoveragePercentThreshold: 1 }
const LOCAL_LAYOUT_QUIET_MS = 120

/** Keep measuring offscreen until native scrolling acknowledges the intended position. */
export function useMobileChatInitialPosition(
  scopeKey: string,
  hasItems: boolean,
  offset: number | null,
  scroll: {
    lastItemIndex?: number
    pinToTail: () => void
    pinToTailAfterContentResize: (width: number, height: number) => void
    pinToMeasuredPosition: (height: number, viewport: number, offset: number | null) => void
    measurePosition?: (
      height: number,
      offset: number | null,
      receive: (aligned: boolean, viewport: number) => void
    ) => void
  }
) {
  const scope = useRef(scopeKey)
  const generation = useRef(0)
  const frame = useRef<number | null>(null)
  const pinFrame = useRef<number | null>(null)
  const positionRetry = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollMetrics = useRef<{ height: number; viewport: number; offset: number } | null>(null)
  const measurements = useRef({
    height: 0,
    viewport: 0,
    aligned: false,
    visible: false,
    version: 0,
    changedAt: 0
  })
  const shown = useRef(-1)
  const [shownGeneration, setShownGeneration] = useState(-1)
  const cancel = () => {
    if (positionRetry.current !== null) {
      clearTimeout(positionRetry.current)
      positionRetry.current = null
    }
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    if (pinFrame.current !== null) {
      cancelAnimationFrame(pinFrame.current)
      pinFrame.current = null
    }
  }
  if (scope.current !== scopeKey) {
    cancel()
    scope.current = scopeKey
    generation.current += 1
    scrollMetrics.current = null
    measurements.current = {
      height: 0,
      viewport: 0,
      aligned: false,
      visible: false,
      version: 0,
      changedAt: 0
    }
  }
  const lastItemIndex = useRef(scroll.lastItemIndex ?? 0)
  lastItemIndex.current = scroll.lastItemIndex ?? 0
  const targetOffset = useRef(offset)
  targetOffset.current = offset
  if (!hasItems && shown.current === generation.current) {
    shown.current = -1
    setShownGeneration(-1)
  }
  const current = generation.current
  const ready = shownGeneration === current
  const pinAfterNativeCommit = () => {
    if (generation.current !== current || shown.current === current) {
      return
    }
    if (pinFrame.current !== null) {
      return
    }
    pinFrame.current = requestAnimationFrame(() => {
      pinFrame.current = requestAnimationFrame(() => {
        pinFrame.current = null
        if (generation.current === current && shown.current !== current) {
          scroll.pinToMeasuredPosition(
            measurements.current.height,
            measurements.current.viewport,
            targetOffset.current
          )
        }
      })
    })
  }
  const updateAlignment = () => {
    const latest = measurements.current
    const native = scrollMetrics.current
    const maxOffset = native ? Math.max(0, native.height - native.viewport) : 0
    const target =
      targetOffset.current === null ? maxOffset : Math.min(targetOffset.current, maxOffset)
    latest.aligned =
      latest.height > 0 &&
      latest.viewport > 0 &&
      (latest.height <= latest.viewport ||
        (native !== null &&
          Math.abs(native.height - latest.height) < 1 &&
          Math.abs(native.viewport - latest.viewport) < 1 &&
          Math.abs(native.offset - target) < 2))
  }
  const settle = () => {
    if (
      shown.current === current ||
      frame.current !== null ||
      !measurements.current.aligned ||
      !measurements.current.visible
    ) {
      return
    }
    let version = measurements.current.version
    let stableFrames = 0
    const check = () => {
      frame.current = null
      if (generation.current !== current) {
        return
      }
      const latest = measurements.current
      if (!latest.aligned || !latest.visible) {
        return
      }
      stableFrames =
        latest.version === version && latest.aligned && latest.visible ? stableFrames + 1 : 0
      version = latest.version
      if (
        latest.aligned &&
        latest.visible &&
        stableFrames >= 2 &&
        Date.now() - latest.changedAt >= LOCAL_LAYOUT_QUIET_MS
      ) {
        if (positionRetry.current !== null) {
          clearTimeout(positionRetry.current)
          positionRetry.current = null
        }
        shown.current = current
        setShownGeneration(current)
      } else {
        frame.current = requestAnimationFrame(check)
      }
    }
    frame.current = requestAnimationFrame(check)
  }
  const schedulePositionRetry = () => {
    const latest = measurements.current
    if (
      generation.current !== current ||
      shown.current === current ||
      latest.height <= 0 ||
      latest.viewport <= 0 ||
      positionRetry.current !== null
    ) {
      return
    }
    positionRetry.current = setTimeout(() => {
      positionRetry.current = null
      if (generation.current !== current || shown.current === current) {
        return
      }
      pinAfterNativeCommit()
      const version = measurements.current.version
      scroll.measurePosition?.(
        measurements.current.height,
        targetOffset.current,
        (aligned, viewport) => {
          if (
            generation.current === current &&
            shown.current !== current &&
            measurements.current.version === version &&
            aligned
          ) {
            measurements.current.viewport = viewport
            measurements.current.aligned = true
            measurements.current.visible = true
            settle()
          }
        }
      )
      settle()
      schedulePositionRetry()
    }, 250)
  }
  const measure = (key: 'height' | 'viewport', value: number) => {
    if (generation.current !== current || ready) {
      return
    }
    const latest = measurements.current
    if (value !== latest[key]) {
      latest[key] = value
      latest.version += 1
      latest.changedAt = Date.now()
      // Native scroll and content-size events may arrive in either order.
      updateAlignment()
    }
    schedulePositionRetry()
    settle()
  }
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (generation.current !== current || shown.current === current) {
        return
      }
      measurements.current.visible = viewableItems.some(
        (item) =>
          item.isViewable && (targetOffset.current !== null || item.index === lastItemIndex.current)
      )
      settle()
    },
    [current]
  )
  useEffect(() => {
    return () => {
      if (generation.current === current) {
        cancel()
      }
    }
  }, [current])
  useEffect(() => {
    const hostId = scopeKey.split('\0')[0]
    if (hostId) {
      recordChatDiagnostic(hostId, scopeKey, 'chat-position', {
        shown: !hasItems || ready,
        height: measurements.current.height,
        viewport: measurements.current.viewport,
        positionAck: measurements.current.aligned,
        targetRowVisible: measurements.current.visible
      })
    }
  }, [scopeKey, hasItems, ready])
  return {
    ready: !hasItems || ready,
    listProps: {
      onViewableItemsChanged,
      viewabilityConfig: INITIAL_POSITION_VIEWABILITY,
      pointerEvents: hasItems && !ready ? ('none' as const) : ('auto' as const),
      accessibilityElementsHidden: hasItems && !ready,
      importantForAccessibility:
        hasItems && !ready ? ('no-hide-descendants' as const) : ('auto' as const),
      onContentSizeChange: (width: number, height: number) => {
        measure('height', height)
        scroll.pinToTailAfterContentResize(width, height)
        if (!ready) {
          pinAfterNativeCommit()
        }
      },
      onLayout: (event?: LayoutChangeEvent) => {
        measure('viewport', event?.nativeEvent?.layout?.height ?? 0)
        scroll.pinToTail()
      }
    },
    contentMeasured: (height: number) => measure('height', height),
    layoutMeasured: (viewport: number) => measure('viewport', viewport),
    scrolled: (event: NativeScrollEvent) => {
      if (generation.current !== current || ready) {
        return
      }
      scrollMetrics.current = {
        height: event.contentSize.height,
        viewport: event.layoutMeasurement.height,
        offset: event.contentOffset.y
      }
      updateAlignment()
      settle()
    }
  }
}
