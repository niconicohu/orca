import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMobileChatInitialPosition } from './use-mobile-chat-initial-position'

vi.mock('react-native', () => ({ StyleSheet: { create: (styles: unknown) => styles } }))

describe('cached chat initial presentation', () => {
  let renderer: ReactTestRenderer | null = null
  let position: ReturnType<typeof useMobileChatInitialPosition>
  const scroll = {
    measurePosition:
      vi.fn<
        (
          height: number,
          offset: number | null,
          receive: (aligned: boolean, viewport: number) => void
        ) => void
      >(),
    lastItemIndex: 501,
    pinToTail: vi.fn(),
    pinToTailAfterContentResize: vi.fn(),
    pinToMeasuredPosition: (height: number) => scroll.pinToTailAfterContentResize(0, height)
  }
  function Harness() {
    position = useMobileChatInitialPosition('host\0cached-session', true, null, scroll)
    return null
  }
  beforeEach(async () => {
    scroll.measurePosition.mockReset()
    scroll.pinToTailAfterContentResize.mockReset()
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 16)
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    await act(async () => {
      renderer = create(createElement(Harness))
    })
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  function measure(height: number) {
    act(() => {
      position.layoutMeasured(467)
      position.contentMeasured(height)
    })
  }
  function acknowledge(height: number) {
    act(() => {
      position.listProps.onViewableItemsChanged({
        viewableItems: [{ index: 501, isViewable: true, key: 'tail', item: {} }]
      })
      position.scrolled({
        contentOffset: { x: 0, y: height - 467 },
        contentSize: { width: 320, height },
        layoutMeasurement: { width: 320, height: 467 },
        contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
        zoomScale: 1
      })
    })
  }
  it('does not reveal a large cache while native rows and target position are still incomplete', async () => {
    measure(10448)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(position.ready).toBe(false)
    measure(11280)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(position.ready).toBe(false)
    acknowledge(11280)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(position.ready).toBe(true)
  })
  it('waits for the local layout to settle after late cached row measurements', async () => {
    measure(8000)
    acknowledge(8000)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(48)
    })
    expect(position.ready).toBe(false)
    measure(9208)
    acknowledge(9208)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80)
    })
    expect(position.ready).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(position.ready).toBe(true)
  })
  it('accepts a native tail acknowledgement that arrives before its content-size callback', async () => {
    act(() => position.layoutMeasured(467))
    acknowledge(10448)
    act(() => position.contentMeasured(10448))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(position.ready).toBe(true)
  })
  it('positions again after native commit instead of stopping at the previous render batch', async () => {
    let committed = false
    act(() => position.layoutMeasured(467))
    setTimeout(() => {
      committed = true
    }, 16)
    scroll.pinToTailAfterContentResize.mockImplementation(() => {
      if (committed) {
        acknowledge(10448)
      }
    })
    act(() => position.listProps.onContentSizeChange(320, 10448))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(position.ready).toBe(true)
  })
  it('retries a dropped native positioning command without exposing the previous batch', async () => {
    let acceptsScroll = false
    act(() => position.layoutMeasured(467))
    setTimeout(() => {
      acceptsScroll = true
    }, 500)
    scroll.pinToTailAfterContentResize.mockImplementation(() => {
      if (acceptsScroll) {
        acknowledge(10448)
      }
    })
    act(() => position.listProps.onContentSizeChange(320, 10448))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(position.ready).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(position.ready).toBe(true)
  })
  it('uses verified native geometry when Android omits the final scroll acknowledgement', async () => {
    scroll.measurePosition.mockImplementation((_height, _offset, receive) => receive(true, 467))
    measure(57020)
    await act(async () => {
      vi.advanceTimersByTime(320)
    })
    expect(position.ready).toBe(true)
    expect(scroll.measurePosition).toHaveBeenCalled()
    scroll.measurePosition.mockClear()
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(scroll.measurePosition).not.toHaveBeenCalled()
  })
})
