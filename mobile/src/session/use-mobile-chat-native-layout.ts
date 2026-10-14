import { useCallback, useRef } from 'react'
import type { View } from 'react-native'
import { spacing } from '../theme/mobile-theme'

/** Native bounds remain addressable when Android coalesces the final scroll event. */
export function useMobileChatNativeLayout(scopeKey: string, lastIndex: number) {
  const viewportRef = useRef<View | null>(null)
  const footerRef = useRef<View | null>(null)
  const rowRef = useRef<View | null>(null)
  const identity = useRef({ scopeKey, lastIndex })
  const laidOut = useRef(false)
  if (identity.current.scopeKey !== scopeKey || identity.current.lastIndex !== lastIndex) {
    identity.current = { scopeKey, lastIndex }
    laidOut.current = false
  }
  const onLastRowLayout = useCallback(() => {
    if (identity.current.scopeKey === scopeKey && identity.current.lastIndex === lastIndex) {
      laidOut.current = true
    }
  }, [scopeKey, lastIndex])
  const measurePosition = useCallback(
    (
      height: number,
      offset: number | null,
      receive: (aligned: boolean, viewport: number) => void
    ) => {
      const viewport = viewportRef.current
      const footer = footerRef.current
      const row = rowRef.current
      if (!viewport || !footer || !row || !laidOut.current) {
        return
      }
      const current = () =>
        identity.current.scopeKey === scopeKey &&
        identity.current.lastIndex === lastIndex &&
        viewportRef.current === viewport &&
        footerRef.current === footer &&
        rowRef.current === row &&
        laidOut.current
      viewport.measureInWindow((_x, top, _width, viewportHeight) => {
        if (!current() || viewportHeight <= 0) {
          return
        }
        footer.measureInWindow((_fx, bottom) => {
          if (!current()) {
            return
          }
          row.measureInWindow((_rx, rowTop, rowWidth, rowHeight) => {
            if (!current() || rowWidth <= 0 || bottom < rowTop + rowHeight - 2) {
              return
            }
            const actualOffset = height - spacing.sm - (bottom - top)
            const aligned =
              offset === null
                ? Math.abs(top + viewportHeight - spacing.sm - bottom) < 2
                : Math.abs(actualOffset - Math.min(offset, Math.max(0, height - viewportHeight))) <
                  2
            receive(aligned, viewportHeight)
          })
        })
      })
    },
    [scopeKey, lastIndex]
  )
  return { viewportRef, footerRef, rowRef, onLastRowLayout, measurePosition }
}
