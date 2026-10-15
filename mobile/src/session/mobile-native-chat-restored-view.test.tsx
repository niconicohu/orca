import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chatViewElement,
  assistantTurn,
  scrollToEnd,
  scrollToOffset,
  type Overrides
} from './mobile-native-chat-view.test-fixture'
let renderer: ReactTestRenderer | null = null
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 16)
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})
const list = () => renderer!.root.find((node) => String(node.type) === 'FlatList')
const render = async (props: Overrides) => {
  await act(async () => {
    renderer = create(chatViewElement(props))
  })
}
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  scrollToEnd.mockClear()
  scrollToOffset.mockClear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('restored native chat surface', () => {
  it('uses the measured viewport to retry the real tail offset after native layout commits', async () => {
    vi.useFakeTimers()
    await render({ folded: [assistantTurn('cached', 'Cached')], sendSurfaceId: 'cached' })
    act(() => {
      list().props.onLayout({ nativeEvent: { layout: { height: 500 } } })
      list().props.onContentSizeChange(320, 1200)
    })
    await act(async () => {
      vi.advanceTimersByTime(60)
    })
    expect(scrollToOffset).toHaveBeenLastCalledWith({ animated: false, offset: 700 })
  })
  it('does not page older history during the initial programmatic layout scroll', async () => {
    const onLoadEarlier = vi.fn()
    await render({ folded: [assistantTurn('cached', 'Restored')], hasMore: true, onLoadEarlier })
    act(() =>
      list().props.onScroll({
        nativeEvent: {
          contentOffset: { y: 0 },
          contentSize: { height: 1200 },
          layoutMeasurement: { height: 500 }
        }
      })
    )
    expect(onLoadEarlier).not.toHaveBeenCalled()
    act(() => list().props.onContentSizeChange(320, 1200))
    expect(scrollToOffset).toHaveBeenCalledWith({ animated: false, offset: 1200 })
  })

  it('shows working activity for a terminal-backed chat without provider activity text', async () => {
    await render({
      folded: [assistantTurn('cached', 'History')],
      agentWorking: true,
      structuredActivityUi: false
    })
    expect(list().props.ListFooterComponent).not.toBeNull()
  })

  it('starts the next tab at its tail after the previous tab was reading older history', async () => {
    await render({ folded: [assistantTurn('a', 'A')], sendSurfaceId: 'a' })
    act(() => list().props.onScrollBeginDrag())
    await act(async () =>
      renderer!.update(chatViewElement({ folded: [assistantTurn('b', 'B')], sendSurfaceId: 'b' }))
    )
    scrollToEnd.mockClear()
    act(() => list().props.onLayout())
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false })
  })
  it('does not overwrite the measured tail with an estimated scrollToEnd on a later layout', async () => {
    await render({ folded: [assistantTurn('a', 'A')], sendSurfaceId: 'a' })
    act(() => list().props.onContentSizeChange(320, 1200))
    scrollToEnd.mockClear()
    act(() => list().props.onLayout())
    expect(scrollToEnd).not.toHaveBeenCalled()
    expect(scrollToOffset).toHaveBeenLastCalledWith({ animated: false, offset: 1200 })
  })

  it('ignores a delayed content-size event from the tab that was switched away from', async () => {
    await render({ folded: [assistantTurn('a', 'A')], sendSurfaceId: 'a' })
    const delayedA = list().props.onContentSizeChange
    await act(async () =>
      renderer!.update(chatViewElement({ folded: [assistantTurn('b', 'B')], sendSurfaceId: 'b' }))
    )
    act(() => list().props.onContentSizeChange(320, 1800))
    scrollToOffset.mockClear()
    act(() => delayedA(320, 900))
    expect(scrollToOffset).not.toHaveBeenCalled()
  })

  it('restores a reading position when switching A to B and back to A', async () => {
    await render({ folded: [assistantTurn('a', 'A')], sendSurfaceId: 'a' })
    act(() => {
      list().props.onScrollBeginDrag()
      list().props.onScroll({
        nativeEvent: {
          contentOffset: { y: 350 },
          contentSize: { height: 1200 },
          layoutMeasurement: { height: 500 }
        }
      })
      list().props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { y: 350 },
          contentSize: { height: 1200 },
          layoutMeasurement: { height: 500 }
        }
      })
    })
    await act(async () =>
      renderer!.update(chatViewElement({ folded: [assistantTurn('b', 'B')], sendSurfaceId: 'b' }))
    )
    await act(async () =>
      renderer!.update(chatViewElement({ folded: [assistantTurn('a', 'A')], sendSurfaceId: 'a' }))
    )
    act(() => list().props.onContentSizeChange(320, 1200))
    expect(scrollToOffset).toHaveBeenLastCalledWith({ animated: false, offset: 350 })
  })
  it('keeps following A after a tail drag, a tab switch, a late old callback and newer history', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 16)
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    await render({ folded: [assistantTurn('a', 'A')], sendSurfaceId: 'a' })
    const oldAContent = list().props.onContentSizeChange
    act(() => {
      list().props.onScrollBeginDrag()
      list().props.onScrollEndDrag({
        nativeEvent: {
          contentOffset: { y: 700 },
          contentSize: { height: 1200 },
          layoutMeasurement: { height: 500 }
        }
      })
    })
    await act(async () =>
      renderer!.update(chatViewElement({ folded: [assistantTurn('b', 'B')], sendSurfaceId: 'b' }))
    )
    await act(async () =>
      renderer!.update(chatViewElement({ folded: [assistantTurn('a', 'A')], sendSurfaceId: 'a' }))
    )
    act(() => list().props.onContentSizeChange(320, 1500))
    scrollToEnd.mockClear()
    act(() => {
      oldAContent(320, 900)
      list().props.onLayout()
    })
    expect(scrollToEnd).not.toHaveBeenCalled()
    expect(scrollToOffset).toHaveBeenLastCalledWith({ animated: false, offset: 1500 })
  })
  it('keeps cached rows hidden until the initial tail is acknowledged and layout settles', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 16)
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    await render({ folded: [assistantTurn('a', 'A')], sendSurfaceId: 'a' })
    expect(list().props.pointerEvents).toBe('none')
    expect(
      renderer!.root.findAll((node) => node.props.testID === 'chat-initial-position-loading')
    ).toHaveLength(1)
    act(() => {
      list().props.onLayout({ nativeEvent: { layout: { height: 500 } } })
      list().props.onContentSizeChange(320, 1200)
      list().props.onViewableItemsChanged({ viewableItems: [{ isViewable: true, index: 0 }] })
      list().props.onScroll({
        nativeEvent: {
          contentOffset: { y: 700 },
          contentSize: { height: 1200 },
          layoutMeasurement: { height: 500 }
        }
      })
    })
    expect(list().props.pointerEvents).toBe('none')
    await act(async () => {
      vi.advanceTimersByTime(160)
    })
    expect(list().props.pointerEvents).toBe('auto')
    expect(
      renderer!.root.findAll((node) => node.props.testID === 'chat-initial-position-loading')
    ).toHaveLength(0)
    vi.useRealTimers()
  })
  it('reveals short histories after measurement without requiring a scroll event', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 16)
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    await render({ folded: [assistantTurn('short', 'Short')], sendSurfaceId: 'short' })
    act(() => {
      list().props.onLayout({ nativeEvent: { layout: { height: 500 } } })
      list().props.onContentSizeChange(320, 400)
      list().props.onViewableItemsChanged({ viewableItems: [{ isViewable: true, index: 0 }] })
    })
    await act(async () => {
      vi.advanceTimersByTime(160)
    })
    expect(list().props.pointerEvents).toBe('auto')
  })
  it('retries positioning under the cover until the delayed native acknowledgement arrives', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 16)
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    await render({ folded: [assistantTurn('cached', 'Cached')], sendSurfaceId: 'cached' })
    act(() => {
      list().props.onLayout({ nativeEvent: { layout: { height: 500 } } })
      list().props.onContentSizeChange(320, 1200)
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(list().props.pointerEvents).toBe('none')
    expect(scrollToOffset).toHaveBeenLastCalledWith({ animated: false, offset: 700 })
    act(() => {
      list().props.onViewableItemsChanged({ viewableItems: [{ isViewable: true, index: 0 }] })
      list().props.onScroll({
        nativeEvent: {
          contentOffset: { y: 700 },
          contentSize: { height: 1200 },
          layoutMeasurement: { height: 500 }
        }
      })
    })
    await act(async () => {
      vi.advanceTimersByTime(160)
    })
    expect(list().props.pointerEvents).toBe('auto')
  })
})
