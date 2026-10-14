import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chatViewElement,
  assistantTurn,
  scrollToEnd,
  scrollToOffset,
  type Overrides
} from './mobile-native-chat-view.test-fixture'
let renderer: ReactTestRenderer | null = null
const list = () => renderer!.root.findByType('FlatList' as never)
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
})
describe('restored native chat surface', () => {
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
})
