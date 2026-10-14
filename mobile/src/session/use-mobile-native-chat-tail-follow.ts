import { useMobileChatInitialPosition } from './use-mobile-chat-initial-position'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'

/** Distance from the bottom, in points, still treated as "at the tail". */
const AT_TAIL_SLOP = 80

function isAtTail(event: NativeScrollEvent): boolean {
  const { contentOffset, contentSize, layoutMeasurement } = event
  return contentSize.height - (contentOffset.y + layoutMeasurement.height) <= AT_TAIL_SLOP
}

export type MobileNativeChatTailFollow<TItem> = {
  /** Attach to the transcript list; the hook scrolls through this ref alone. */
  listRef: RefObject<FlatList<TItem> | null>
  /** Render flag for the jump-to-latest control. */
  showJumpToTail: boolean
  followingTail: boolean
  initialPosition: ReturnType<typeof useMobileChatInitialPosition>
  /** Passive maintenance: re-pin after the viewport resizes. */
  pinToTail: () => void
  /** Content-size maintenance using the list's authoritative measured height. */
  pinToTailAfterContentResize: (_width: number, height: number) => void
  /** Explicit jump — send, or the jump-to-latest control. Resumes following. */
  jumpToTail: () => void
  beginUserScroll: () => void
  endUserDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  beginMomentum: () => void
  endMomentum: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  /** Leave the tail deliberately, e.g. before prepending older history. */
  detachFromTail: () => void
  recordScrollMetrics: (event: NativeScrollEvent) => void
  canPageFromScroll: () => boolean
}

/** Sole owner of transcript scroll position.
 *
 *  Streaming used to have several tail-followers at once: a delayed *animated*
 *  `scrollToEnd` alongside an immediate non-animated one on content growth. The
 *  animated command eases toward the endpoint measured when it started, so while
 *  tokens kept arriving it ran backwards until the content-size pin yanked it
 *  forward — the visible drift-then-snap. One owner, never animated, removes it.
 *
 *  Intent (`following`) is kept separate from geometry (at-tail): a programmatic
 *  scroll reports metrics like any other, so letting metrics decide intent let
 *  the view argue with itself. Only the user's own gestures and explicit jumps
 *  move intent; metrics only decide where a *released* gesture leaves us.
 */
export function useMobileNativeChatTailFollow<TItem>(args: {
  /** Guards `scrollToEnd` against an empty list. */
  hasItems: boolean
  scopeKey?: string
}): MobileNativeChatTailFollow<TItem> {
  const { hasItems } = args
  const listRef = useRef<FlatList<TItem> | null>(null)
  const [following, setFollowingFlag] = useState(true)
  const [atTail, setAtTailFlag] = useState(true)
  // Event handlers read intent at event time, before a re-render lands.
  const followingRef = useRef(true)
  const atTailRef = useRef(true)
  const userScrollActiveRef = useRef(false)
  const userScrollSettleFrameRef = useRef<number | null>(null)

  const positionsRef = useRef(new Map<string, { following: boolean; offset: number }>())
  const measuredHeightRef = useRef<number | null>(null)
  const offsetRef = useRef(0)
  const restoringOffsetRef = useRef<number | null>(null)
  const scopeGenerationRef = useRef(0)
  const [scopeKey, setScopeKey] = useState(args.scopeKey)
  if (scopeKey !== args.scopeKey) {
    if (scopeKey) {
      positionsRef.current.delete(scopeKey)
      positionsRef.current.set(scopeKey, {
        following: followingRef.current || (userScrollActiveRef.current && atTailRef.current),
        offset: offsetRef.current
      })
      if (positionsRef.current.size > 16) {
        const oldest = positionsRef.current.keys().next().value
        if (oldest !== undefined) {
          positionsRef.current.delete(oldest)
        }
      }
    }
    const saved = args.scopeKey ? positionsRef.current.get(args.scopeKey) : undefined
    scopeGenerationRef.current += 1
    measuredHeightRef.current = null
    offsetRef.current = saved?.offset ?? 0
    restoringOffsetRef.current = saved && !saved.following ? saved.offset : null
    setScopeKey(args.scopeKey)
    if (userScrollSettleFrameRef.current !== null) {
      cancelAnimationFrame(userScrollSettleFrameRef.current)
      userScrollSettleFrameRef.current = null
    }
    followingRef.current = saved?.following ?? true
    atTailRef.current = followingRef.current
    userScrollActiveRef.current = false
    setFollowingFlag(followingRef.current)
    setAtTailFlag(atTailRef.current)
  }

  const scopeGeneration = scopeGenerationRef.current

  // Single writer, so the event-time ref and the render flag cannot disagree.
  const setFollowing = useCallback((next: boolean) => {
    if (followingRef.current === next) {
      return
    }
    followingRef.current = next
    setFollowingFlag(next)
  }, [])

  const setAtTail = useCallback((next: boolean) => {
    if (atTailRef.current === next) {
      return
    }
    atTailRef.current = next
    setAtTailFlag(next)
  }, [])

  const pinToTail = useCallback(() => {
    if (scopeGenerationRef.current !== scopeGeneration || !followingRef.current || !hasItems) {
      return
    }
    if (measuredHeightRef.current !== null) {
      listRef.current?.scrollToOffset({ animated: false, offset: measuredHeightRef.current })
    } else {
      listRef.current?.scrollToEnd({ animated: false })
    }
  }, [hasItems, scopeGeneration])

  const pinToTailAfterContentResize = useCallback(
    (_width: number, height: number) => {
      if (scopeGenerationRef.current !== scopeGeneration) {
        return
      }
      measuredHeightRef.current = height
      if (!hasItems) {
        return
      }
      if (followingRef.current) {
        listRef.current?.scrollToOffset({ animated: false, offset: height })
      } else if (restoringOffsetRef.current !== null) {
        listRef.current?.scrollToOffset({ animated: false, offset: restoringOffsetRef.current })
      }
    },
    [hasItems, scopeGeneration]
  )

  const clearUserScrollSettle = useCallback(() => {
    if (userScrollSettleFrameRef.current !== null) {
      cancelAnimationFrame(userScrollSettleFrameRef.current)
      userScrollSettleFrameRef.current = null
    }
  }, [])

  const recordScrollMetrics = useCallback(
    (event: NativeScrollEvent) => {
      if (scopeGenerationRef.current !== scopeGeneration) {
        return
      }
      offsetRef.current = event.contentOffset.y
      setAtTail(isAtTail(event))
    },
    [setAtTail, scopeGeneration]
  )

  const jumpToTail = useCallback(() => {
    if (scopeGenerationRef.current !== scopeGeneration) {
      return
    }
    restoringOffsetRef.current = null
    clearUserScrollSettle()
    userScrollActiveRef.current = false
    setAtTail(true)
    setFollowing(true)
    pinToTail()
  }, [clearUserScrollSettle, pinToTail, setAtTail, setFollowing, scopeGeneration])

  const beginUserScroll = useCallback(() => {
    if (scopeGenerationRef.current !== scopeGeneration) {
      return
    }
    restoringOffsetRef.current = null
    clearUserScrollSettle()
    userScrollActiveRef.current = true
    setFollowing(false)
  }, [clearUserScrollSettle, setFollowing, scopeGeneration])

  const finishUserScroll = useCallback(
    (finishedAtTail: boolean) => {
      if (scopeGenerationRef.current !== scopeGeneration || !userScrollActiveRef.current) {
        return
      }
      clearUserScrollSettle()
      userScrollActiveRef.current = false
      setAtTail(finishedAtTail)
      setFollowing(finishedAtTail)
      if (finishedAtTail) {
        pinToTail()
      }
    },
    [clearUserScrollSettle, pinToTail, setAtTail, setFollowing, scopeGeneration]
  )

  const endUserDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (scopeGenerationRef.current !== scopeGeneration || !userScrollActiveRef.current) {
        return
      }
      clearUserScrollSettle()
      const releasedAtTail = isAtTail(event.nativeEvent)
      offsetRef.current = event.nativeEvent.contentOffset.y
      setAtTail(releasedAtTail)
      userScrollSettleFrameRef.current = requestAnimationFrame(() => {
        userScrollSettleFrameRef.current = null
        finishUserScroll(releasedAtTail)
      })
    },
    [clearUserScrollSettle, finishUserScroll, scopeGeneration, setAtTail]
  )

  const beginMomentum = useCallback(() => {
    if (scopeGenerationRef.current !== scopeGeneration) {
      return
    }
    if (userScrollActiveRef.current) {
      clearUserScrollSettle()
    }
  }, [clearUserScrollSettle, scopeGeneration])

  const endMomentum = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      finishUserScroll(isAtTail(event.nativeEvent)),
    [finishUserScroll]
  )

  const detachFromTail = useCallback(() => {
    if (scopeGenerationRef.current !== scopeGeneration) {
      return
    }
    restoringOffsetRef.current = null
    clearUserScrollSettle()
    userScrollActiveRef.current = false
    setAtTail(false)
    setFollowing(false)
  }, [clearUserScrollSettle, setAtTail, setFollowing, scopeGeneration])

  const initialPosition = useMobileChatInitialPosition(
    args.scopeKey ?? '',
    hasItems,
    restoringOffsetRef.current,
    { pinToTail, pinToTailAfterContentResize }
  )

  useEffect(() => clearUserScrollSettle, [clearUserScrollSettle, scopeGeneration])

  return {
    listRef,
    showJumpToTail: !following && !atTail,
    followingTail: following,
    initialPosition,
    pinToTail,
    pinToTailAfterContentResize,
    jumpToTail,
    beginUserScroll,
    endUserDrag,
    beginMomentum,
    endMomentum,
    detachFromTail,
    recordScrollMetrics,
    canPageFromScroll: () => userScrollActiveRef.current && !followingRef.current
  }
}
