import { act } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installChatViewHooks,
  assistantTurn,
  list,
  render,
  scrollToOffset,
  update
} from './MobileNativeChatView.harness.test-fixture'

const diagram = vi.hoisted(() => ({ pending: false }))

vi.mock('react-native', async () => {
  const { reactNativeStub } = await import('./MobileNativeChatView.render-stubs.test-fixture')
  const React = await import('react')
  const { useMobileTranscriptLayoutPending } =
    await import('../components/mobile-transcript-layout')
  const stub = await reactNativeStub()
  function Diagram() {
    useMobileTranscriptLayoutPending(diagram.pending)
    return null
  }
  return {
    ...stub,
    FlatList: React.forwardRef((props, ref) =>
      React.createElement(stub.FlatList, { ...props, ref }, React.createElement(Diagram))
    )
  }
})
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))
vi.mock('react-native-gesture-handler', async () => {
  const { gestureHandlerStub } = await import('./MobileNativeChatView.render-stubs.test-fixture')
  return gestureHandlerStub()
})
vi.mock('lucide-react-native', () => ({
  ArrowDown: 'ArrowDown',
  ChevronsDownUp: 'ChevronsDownUp',
  ChevronsUpDown: 'ChevronsUpDown',
  Square: 'Square'
}))
vi.mock('./MobileNativeChatMessage', () => ({ MobileNativeChatMessage: 'ChatMessage' }))
vi.mock('./MobileNativeChatLiveLine', () => ({ MobileNativeChatLiveLine: 'LiveStatus' }))
vi.mock('./MobileNativeChatAsk', () => ({ MobileNativeChatAsk: 'ChatAsk' }))
vi.mock('./MobileNativeChatPermission', () => ({ MobileNativeChatPermission: 'ChatPermission' }))
vi.mock('./MobileNativeChatQuestion', () => ({ MobileNativeChatQuestion: 'ChatQuestion' }))
vi.mock('../components/ActionSheetModal', () => ({ ActionSheetModal: 'ActionSheetModal' }))
vi.mock('./MobileAgentWorkingIndicator', () => ({
  MobileAgentWorkingIndicator: 'WorkingIndicator'
}))
vi.mock('./MobileNativeChatComposer', async () => {
  const { composerStub } = await import('./MobileNativeChatView.render-stubs.test-fixture')
  return composerStub()
})

describe('MobileNativeChatView: initial measured position', () => {
  installChatViewHooks()
  afterEach(() => {
    vi.useRealTimers()
    diagram.pending = false
  })

  function measured(height: number, offset: number) {
    return {
      contentOffset: { y: offset },
      contentSize: { height },
      layoutMeasurement: { height: 500 }
    }
  }
  const transcript = { folded: [assistantTurn('a', 'A long response')] }

  it('waits for a diagram to finish sizing before revealing an otherwise settled bottom', async () => {
    vi.useFakeTimers()
    diagram.pending = true
    await render(transcript)
    act(() => {
      list().props.onLayout({ nativeEvent: { layout: { height: 500 } } })
      list().props.onContentSizeChange(320, 400)
    })
    await act(async () => {
      vi.runAllTimers()
    })
    expect(list().props.style).toMatchObject({ opacity: 0 })
    diagram.pending = false
    await update(transcript)
    await act(async () => {
      vi.runAllTimers()
    })
    expect(list().props.style).toBeUndefined()
  })

  it('starts virtualization at the newest row so estimated offscreen spacers cannot masquerade as the bottom', async () => {
    const folded = Array.from({ length: 80 }, (_, index) => assistantTurn(`a-${index}`, 'Response'))
    await render({ folded })
    expect(list().props.initialScrollIndex).toBe(79)
    expect(list().props.onScrollToIndexFailed).toEqual(expect.any(Function))
  })

  it('pins again after native layout commits instead of waiting forever on an old-size acknowledgement', async () => {
    vi.useFakeTimers()
    await render(transcript)
    act(() => {
      list().props.onLayout({ nativeEvent: { layout: { height: 500 } } })
      list().props.onContentSizeChange(320, 1200)
      list().props.onScroll({ nativeEvent: measured(800, 300) })
    })
    scrollToOffset.mockClear()
    await act(async () => {
      vi.runAllTimers()
    })
    expect(scrollToOffset).toHaveBeenCalledWith({ animated: false, offset: 1200 })
    expect(list().props.style).toMatchObject({ opacity: 0 })
    act(() => list().props.onScroll({ nativeEvent: measured(1200, 700) }))
    await act(async () => {
      vi.runAllTimers()
    })
    expect(list().props.style).toBeUndefined()
  })

  it('keeps content hidden until its measured bottom has stopped changing', async () => {
    vi.useFakeTimers()
    await render(transcript)
    expect(list().props.style).toMatchObject({ opacity: 0 })
    act(() => {
      list().props.onLayout({ nativeEvent: { layout: { height: 500 } } })
      list().props.onContentSizeChange(320, 1200)
      list().props.onScroll({ nativeEvent: measured(1200, 0) })
    })
    await act(async () => {
      vi.runAllTimers()
    })
    expect(list().props.style).toMatchObject({ opacity: 0 })
    act(() => list().props.onScroll({ nativeEvent: measured(1200, 700) }))
    // Markdown layout grows while the first pin is settling.
    act(() => list().props.onContentSizeChange(320, 1400))
    await act(async () => {
      vi.runAllTimers()
    })
    expect(list().props.style).toMatchObject({ opacity: 0 })
    // An old scroll acknowledgement must not reveal the new layout.
    act(() => list().props.onScroll({ nativeEvent: measured(1200, 700) }))
    await act(async () => {
      vi.runAllTimers()
    })
    expect(list().props.style).toMatchObject({ opacity: 0 })
    act(() => list().props.onScroll({ nativeEvent: measured(1400, 900) }))
    await act(async () => {
      vi.runAllTimers()
    })
    expect(list().props.style).toBeUndefined()
  })

  it('resets on tab revisits and reveals a short transcript without needing a scroll event', async () => {
    vi.useFakeTimers()
    await render(transcript)
    const layout = () => {
      list().props.onLayout({ nativeEvent: { layout: { height: 500 } } })
      list().props.onContentSizeChange(320, 400)
    }
    act(layout)
    await act(async () => {
      vi.runAllTimers()
    })
    expect(list().props.style).toBeUndefined()
    await update({ ...transcript, sendSurfaceId: 'tab-b' })
    expect(list().props.style).toMatchObject({ opacity: 0 })
    act(layout)
    await act(async () => {
      vi.runAllTimers()
    })
    await update(transcript)
    expect(list().props.style).toMatchObject({ opacity: 0 })
    act(layout)
    await act(async () => {
      vi.runAllTimers()
    })
    expect(list().props.style).toBeUndefined()
  })

  it('accepts a native scroll acknowledgement that arrives before content layout', async () => {
    vi.useFakeTimers()
    await render(transcript)
    act(() => {
      list().props.onScroll({ nativeEvent: measured(1200, 700) })
      list().props.onLayout({ nativeEvent: { layout: { height: 500 } } })
      list().props.onContentSizeChange(320, 1200)
    })
    await act(async () => {
      vi.runAllTimers()
    })
    expect(list().props.style).toBeUndefined()
  })
})
