import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { MobileNativeChatMessage } from './MobileNativeChatMessage'
import { MobileNativeChatAttachmentContext } from './mobile-native-chat-attachment-read'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { RpcResponse } from '../transport/types'

vi.mock('react-native', async () => {
  const React = await import('react')
  const Text = ({ children, ...props }: { children?: unknown }): unknown =>
    React.createElement('Text', props, children)
  return {
    ActivityIndicator: 'ActivityIndicator',
    Animated: {
      Text,
      Value: class {
        setValue(): void {}
      },
      loop: (animation: unknown) => animation,
      sequence: () => ({ start: vi.fn(), stop: vi.fn() }),
      timing: () => ({ start: vi.fn(), stop: vi.fn() })
    },
    Image: 'Image',
    Platform: { OS: 'ios' },
    Pressable: 'Pressable',
    ScrollView: ({ children, ...props }: { children?: unknown }) =>
      React.createElement('ScrollView', props, children),
    Text,
    View: ({ children, ...props }: { children?: unknown }) =>
      React.createElement('View', props, children),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 }
  }
})
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('lucide-react-native', () => ({
  AlertCircle: 'AlertCircle',
  MessageSquareMore: 'MessageSquareMore',
  AlertTriangle: 'AlertTriangle',
  ArrowUp: 'ArrowUp',
  Brain: 'Brain',
  ChevronDown: 'ChevronDown',
  Copy: 'Copy',
  SquareChevronRight: 'SquareChevronRight',
  SquareTerminal: 'SquareTerminal',
  Wrench: 'Wrench',
  ChevronRight: 'ChevronRight'
}))
vi.mock('../components/MobileMarkdown', () => ({ MobileMarkdown: 'MobileMarkdown' }))
vi.mock('./MobileNativeChatMessageActionsSheet', () => ({
  MobileNativeChatMessageActionsSheet: 'MessageActionsSheet'
}))

const path = '/root/.orca/agent-session-attachments/session/image.png'
const message: NativeChatMessage = {
  id: 'image',
  role: 'user',
  source: 'hook',
  timestamp: 0,
  blocks: [{ type: 'image-ref', path, alt: 'Uploaded screenshot' }]
}
let renderer: ReactTestRenderer | undefined
afterEach(() => act(() => renderer?.unmount()))

it('loads a historical attachment from the chat execution host and displays its image', async () => {
  const sendRequest = vi.fn(async () => ({
    id: '1',
    ok: true as const,
    result: { isImage: true, isBinary: true, mimeType: 'image/png', content: 'AAAA' }
  }))
  await act(async () => {
    renderer = create(
      createElement(
        MobileNativeChatAttachmentContext.Provider,
        { value: { sendRequest } },
        createElement(MobileNativeChatMessage, { message })
      )
    )
  })
  expect(sendRequest).toHaveBeenCalledWith(
    'agentSessionAttachment.read',
    { path },
    expect.objectContaining({ timeoutMs: 15_000 })
  )
  expect(renderer!.root.find((node) => String(node.type) === 'Image').props.source).toEqual({
    uri: 'data:image/png;base64,AAAA'
  })
})

it('offers a retry when the owning host cannot serve an attachment', async () => {
  const sendRequest = vi.fn(async () => ({
    id: '1',
    ok: false as const,
    error: { code: 'method_not_found', message: 'Not supported' }
  }))
  await act(async () => {
    renderer = create(
      createElement(
        MobileNativeChatAttachmentContext.Provider,
        { value: { sendRequest } },
        createElement(MobileNativeChatMessage, { message })
      )
    )
  })
  const retry = renderer!.root.find(
    (node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'Retry image'
  )
  await act(async () => retry.props.onPress())
  expect(sendRequest).toHaveBeenCalledTimes(2)
})

it('never displays a previous host image when the same path is opened on another host', async () => {
  let finish: (reply: RpcResponse) => void = () => {}
  const pending = new Promise<RpcResponse>((resolve) => {
    finish = resolve
  })
  const first = {
    sendRequest: vi.fn(async () => ({
      id: '1',
      ok: true as const,
      result: { isImage: true, mimeType: 'image/png', content: 'AAAA' }
    }))
  }
  const second = { sendRequest: vi.fn(() => pending) }
  const element = (client: typeof first | typeof second) =>
    createElement(
      MobileNativeChatAttachmentContext.Provider,
      { value: client },
      createElement(MobileNativeChatMessage, { message })
    )
  await act(async () => {
    renderer = create(element(first))
  })
  expect(renderer!.root.findAll((node) => String(node.type) === 'Image')).toHaveLength(1)
  await act(async () => renderer!.update(element(second)))
  expect(renderer!.root.findAll((node) => String(node.type) === 'Image')).toHaveLength(0)
  await act(async () =>
    finish({ id: '2', ok: true, result: { isImage: true, mimeType: 'image/png', content: 'BBBB' } })
  )
  expect(renderer!.root.find((node) => String(node.type) === 'Image').props.source).toEqual({
    uri: 'data:image/png;base64,BBBB'
  })
})

it('does not ask the attachment reader for arbitrary host filesystem paths', async () => {
  const sendRequest = vi.fn()
  await act(async () => {
    renderer = create(
      createElement(
        MobileNativeChatAttachmentContext.Provider,
        { value: { sendRequest } },
        createElement(MobileNativeChatMessage, {
          message: { ...message, blocks: [{ type: 'image-ref', path: '/etc/private.png' }] }
        })
      )
    )
  })
  expect(sendRequest).not.toHaveBeenCalled()
})
