import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { MobileSessionActiveContent } from './MobileSessionActiveContent'

vi.mock('react-native', () => ({
  Animated: { View: 'Toast' },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  Platform: { OS: 'android', select: (value: Record<string, unknown>) => value.android }
}))
vi.mock('../browser/MobileBrowserPane', () => ({ MobileBrowserPane: 'Browser' }))
vi.mock('./TerminalPaneView', () => ({ TerminalPaneView: 'Terminal' }))
vi.mock('./MobileNativeChatOverlay', () => ({ MobileNativeChatOverlay: 'ChatOverlay' }))
vi.mock('./MobileSessionFileReader', () => ({ FileReader: 'File' }))
vi.mock('./MobileSessionMarkdownReader', () => ({ MarkdownReader: 'Markdown' }))
vi.mock('../storage/preferences', () => ({ saveTerminalTextScale: vi.fn() }))

it('shows creation failures above the chat overlay rather than inside its covered terminal', async () => {
  const controller = {
    terminals: [],
    sessionTabs: [],
    insets: { bottom: 0 },
    dictation: { isRecording: false },
    nativeChatSendError: { message: null, clear: vi.fn() },
    toastMessage: 'Could not create chat',
    toastAnimatedStyle: {},
    hostId: 'host',
    worktreeId: 'workspace',
    nativeChatScopeKey: 'chat'
  }
  let renderer: ReturnType<typeof create> | undefined
  try {
    await act(async () => {
      renderer = create(
        createElement(MobileSessionActiveContent, { controller: controller as never })
      )
    })
    const root = renderer!.root
      .findAllByType('View')
      .find((node) =>
        node.children.some((child) => typeof child !== 'string' && child.type === 'ChatOverlay')
      )!
    const layers = root.children
      .filter((child) => typeof child !== 'string')
      .map((child) => child.type)
    expect(layers.indexOf('Toast')).toBeGreaterThan(layers.indexOf('ChatOverlay'))
    expect(renderer!.root.findAllByType('Toast')).toHaveLength(1)
  } finally {
    act(() => renderer?.unmount())
  }
})
