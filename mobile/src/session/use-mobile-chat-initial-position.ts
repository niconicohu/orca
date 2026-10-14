import { recordChatDiagnostic } from '../diagnostics/chat-runtime-diagnostics'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeScrollEvent, LayoutChangeEvent, ViewToken } from 'react-native'
import { styles } from './mobile-native-chat-view-styles'

const INITIAL_POSITION_VIEWABILITY = { itemVisiblePercentThreshold: 1 }

/** Keep measuring offscreen until native scrolling acknowledges the intended position. */
export function useMobileChatInitialPosition(
  scopeKey: string,
  hasItems: boolean,
  offset: number | null,
  scroll: {
    lastItemIndex?: number
    pinToTail: () => void
    pinToTailAfterContentResize: (width: number, height: number) => void
  }
) {
  const scope = useRef(scopeKey)
  const generation = useRef(0)
  const frame = useRef<number | null>(null)
  const measurements = useRef({
    height: 0,
    viewport: 0,
    aligned: false,
    visible: false,
    version: 0
  })
  const shown = useRef(-1)
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
    measurements.current = { height: 0, viewport: 0, aligned: false, visible: false, version: 0 }
  }
  const lastItemIndex = useRef(scroll.lastItemIndex ?? 0)
  lastItemIndex.current = scroll.lastItemIndex ?? 0
  const targetOffset = useRef(offset)
  targetOffset.current = offset
  const current = generation.current
  const ready = shownGeneration === current
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
    const startedAt = Date.now()
    const check = () => {
      frame.current = null
      if (generation.current !== current) {
        return
      }
      const latest = measurements.current
      stableFrames =
        latest.version === version && latest.aligned && latest.visible ? stableFrames + 1 : 0
      version = latest.version
      if (
        latest.aligned &&
        latest.visible &&
        (stableFrames >= 2 || Date.now() - startedAt >= 400)
      ) {
        shown.current = current
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
    if (!hasItems) {
      shown.current = -1
      setShownGeneration(-1)
    }
    return () => {
      if (generation.current === current) {
        cancel()
      }
    }
  }, [hasItems, current])
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
