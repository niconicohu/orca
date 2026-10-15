import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { MobileChatSyncPresentation } from './MobileChatSyncPresentation'
import type { MobileNativeChatViewProps } from './mobile-native-chat-view-props'
vi.mock('react-native', () => ({
  View: 'View',
  StyleSheet: { create: (value: unknown) => value, absoluteFillObject: {} }
}))
const message = {
  id: 'cached',
  role: 'assistant' as const,
  source: 'transcript' as const,
  timestamp: 1,
  blocks: []
}
const props: MobileNativeChatViewProps = {
  messages: [message],
  folded: [],
  status: 'ready',
  streaming: null,
  sendSurfaceId: 'tab',
  onSend: async () => true,
  getSendCompletionGeneration: () => 0,
  getComposerEditGeneration: () => 0,
  pending: [],
  composerText: '',
  onComposerTextChange: () => {},
  initialSyncRevision: 0
}
function Surface(_props: MobileNativeChatViewProps & { onPresentationReady?: () => void }) {
  return null
}
const render = (value: MobileNativeChatViewProps & { onPresentationReady?: () => void }) =>
  createElement(Surface, value)
it('keeps cached content visible until the synchronized native list acknowledges stable positioning', () => {
  let tree!: ReactTestRenderer
  act(() => {
    tree = create(createElement(MobileChatSyncPresentation, { props, render }))
  })
  act(() =>
    tree.update(
      createElement(MobileChatSyncPresentation, {
        props: { ...props, messages: [{ ...message, id: 'latest' }], initialSyncRevision: 1 },
        render
      })
    )
  )
  let surfaces = tree.root.findAllByType(Surface)
  expect(surfaces).toHaveLength(2)
  expect(surfaces[0]!.props.messages[0].id).toBe('cached')
  expect(surfaces[1]!.parent?.props.style.opacity).toBe(0)
  act(() => surfaces[1]!.props.onPresentationReady())
  surfaces = tree.root.findAllByType(Surface)
  expect(surfaces).toHaveLength(1)
  expect(surfaces[0]!.props.messages[0].id).toBe('latest')
  const instance = surfaces[0]
  act(() =>
    tree.update(
      createElement(MobileChatSyncPresentation, {
        props: { ...props, messages: [{ ...message, id: 'latest' }], initialSyncRevision: 1 },
        render
      })
    )
  )
  expect(tree.root.findAllByType(Surface)[0]).toBe(instance)
  act(() => tree.unmount())
})
