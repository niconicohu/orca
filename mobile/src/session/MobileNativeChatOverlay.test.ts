import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { MobileNativeChatOverlay } from './MobileNativeChatOverlay'
import type { MobileNativeChatController } from './use-mobile-native-chat-controller'

const inputFocus = vi.hoisted(() => ({ get: vi.fn(), blur: vi.fn() }))

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles, absoluteFillObject: {} },
  View: 'View',
  TextInput: { State: { currentlyFocusedInput: inputFocus.get, blurTextInput: inputFocus.blur } }
}))

vi.mock('./MobileNativeChatView', () => ({ MobileNativeChatView: 'ChatView' }))

function assistantTurn(id: string, text: string): NativeChatMessage {
  return { id, role: 'assistant', blocks: [{ type: 'text', text }], timestamp: 0, source: 'hook' }
}

/** One render of the route: chat visible or not, the transcript it currently
 *  holds, and the agent-status stream behind it. */
let activeSurface: string | null = null

type Tick = {
  show?: boolean
  messages?: NativeChatMessage[]
  streamingText?: string
  streamLive?: boolean
  identity?: string
  liveKeys?: string[]
}

function overlayElement(tick: Tick): ReturnType<typeof createElement> {
  activeSurface = tick.show === false ? null : (tick.identity ?? 'tab-a')
  const controller = {
    showNativeChat: tick.show ?? true,
    nativeChatSession: { messages: tick.messages ?? [], status: 'ready' },
    nativeChatAgent: 'claude',
    nativeChatAgentWorking: tick.streamLive ?? false,
    nativeChatStreamingText: tick.streamingText,
    nativeChatStreamLive: tick.streamLive ?? false,
    nativeChatStreamScopeKey: tick.identity ?? 'tab-a',
    chatPending: [],
    chatImagePreviewsByMessageId: {},
    chatComposerText: '',
    setChatComposerText: vi.fn()
  } as unknown as MobileNativeChatController
  return createElement(MobileNativeChatOverlay, {
    controller,
    images: {} as never,
    onMicPress: vi.fn(),
    micActive: false,
    dictationMode: 'toggle',
    onMicPressIn: vi.fn(),
    onMicPressOut: vi.fn(),
    inputLockReason: null,
    sendErrorMessage: null,
    onClearSendError: vi.fn(),
    liveChatSurfaceIds: tick.liveKeys,
    sendSurfaceId: tick.identity ?? 'tab-a',
    getSendCompletionGeneration: () => 0,
    keyboardInset: 0
  })
}

describe('MobileNativeChatOverlay streaming gate', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    inputFocus.get.mockReset()
    inputFocus.blur.mockReset()
  })

  async function render(tick: Tick): Promise<void> {
    await act(async () => {
      renderer = create(overlayElement(tick))
    })
  }

  async function update(tick: Tick): Promise<void> {
    await act(async () => {
      renderer?.update(overlayElement(tick))
    })
  }

  /** The bubble text handed to the chat list, or `'hidden'` when chat is off. */
  function streaming(): string | null | 'hidden' {
    const views = renderer!.root.findAll((node) => node.type === 'ChatView')
    const visible = views.find((view) => view.props.sendSurfaceId === activeSurface)
    return visible ? (visible.props.streaming as string | null) : 'hidden'
  }

  it('keeps streaming a reply that repeats the previous turn as a prefix', async () => {
    const prior = [assistantTurn('a1', 'The tests pass.')]
    await render({ messages: prior })
    expect(streaming()).toBeNull()

    await update({ messages: prior, streamingText: 'The tests', streamLive: true })

    expect(streaming()).toBe('The tests')
  })

  it('drops the streaming bubble once the reply lands as its own turn', async () => {
    const prior = [assistantTurn('a1', 'Done.')]
    await render({ messages: prior })
    await update({ messages: prior, streamingText: 'Done.', streamLive: true })
    expect(streaming()).toBe('Done.')

    await update({
      messages: [...prior, assistantTurn('a2', 'Done.')],
      streamingText: 'Done.',
      streamLive: true
    })

    expect(streaming()).toBeNull()
  })

  it('keeps the bubble across a peek at the terminal view', async () => {
    // Toggling to the terminal unmounts the chat list and unsubscribes its
    // transcript. The gate lives above that boundary, so the baseline survives
    // and the repeated-prefix reply keeps streaming on the way back.
    const prior = [assistantTurn('a1', 'Done.')]
    await render({ messages: prior })
    await update({ messages: prior, streamingText: 'Done.', streamLive: true })
    expect(streaming()).toBe('Done.')

    await update({ show: false, messages: [], streamLive: true })
    expect(streaming()).toBe('hidden')
    // Back on chat the session withholds its transcript until a fresh read
    // settles, so the throttled stream text returns a round trip ahead of it.
    await update({ messages: [], streamLive: true })
    await update({ messages: [], streamingText: 'Done.', streamLive: true })
    await update({ messages: prior, streamingText: 'Done.', streamLive: true })

    expect(streaming()).toBe('Done.')
  })

  it('keeps the bubble across a peek at the terminal taken between turns', async () => {
    // Same toggle, but taken while idle: the transcript empties before the next
    // turn starts, so the gate has to reject that empty tail as a baseline.
    const prior = [assistantTurn('a1', 'Done.')]
    await render({ messages: prior })

    await update({ show: false, messages: [] })
    await update({ show: false, messages: [], streamLive: true })
    await update({ messages: [], streamLive: true })
    await update({ messages: [], streamingText: 'Done.', streamLive: true })
    await update({ messages: prior, streamingText: 'Done.', streamLive: true })

    expect(streaming()).toBe('Done.')
  })

  it('hides a repeated part whose own turn landed during a mid-turn gap', async () => {
    // Between parts the status frame carries no assistant text (a tool call), so
    // the stream goes textless while the turn is still live and the part that
    // just finished lands in the transcript. Re-anchoring on that tick would
    // adopt it as history and render it a second time.
    const prior = [assistantTurn('a1', 'Done.')]
    await render({ messages: prior })
    await update({ messages: prior, streamingText: 'Done.', streamLive: true })
    expect(streaming()).toBe('Done.')

    const landed = [...prior, assistantTurn('a2', 'Done.')]
    await update({ messages: landed, streamLive: true })
    await update({ messages: landed, streamingText: 'Done.', streamLive: true })

    expect(streaming()).toBeNull()
  })

  it("does not carry one chat's baseline into another stream identity", async () => {
    const prior = [assistantTurn('a1', 'Shared answer text')]
    await render({ messages: prior, identity: 'tab-a' })

    await update({
      messages: prior,
      streamingText: 'Shared answer',
      streamLive: true,
      identity: 'tab-b'
    })

    expect(streaming()).toBeNull()
  })
  it('retains the actual cached chat view across A to B and back, including a non-chat tab', async () => {
    await render({ identity: 'a', messages: [assistantTurn('a1', 'cached A')] })
    const originalA = renderer!.root.find(
      (node) => node.type === 'ChatView' && node.props.sendSurfaceId === 'a'
    )
    await update({ identity: 'b', messages: [assistantTurn('b1', 'cached B')] })
    expect(renderer!.root.findAll((node) => node.type === 'ChatView')).toHaveLength(2)
    expect(
      renderer!.root.find((node) => node.type === 'ChatView' && node.props.sendSurfaceId === 'a')
    ).toBe(originalA)
    await update({ identity: 'terminal', show: false })
    expect(renderer!.root.findAll((node) => node.type === 'ChatView')).toHaveLength(2)
    await update({ identity: 'a', messages: [assistantTurn('a1', 'cached A')] })
    expect(
      renderer!.root.find((node) => node.type === 'ChatView' && node.props.sendSurfaceId === 'a')
    ).toBe(originalA)
  })
  it('releases closed tabs and bounds retained native lists', async () => {
    await render({ identity: 'a' })
    for (const id of ['b', 'c', 'd', 'e']) {
      await update({ identity: id })
    }
    expect(renderer!.root.findAll((node) => node.type === 'ChatView')).toHaveLength(4)
    expect(
      renderer!.root.findAll((node) => node.type === 'ChatView' && node.props.sendSurfaceId === 'a')
    ).toHaveLength(0)
    await update({ identity: 'e', liveKeys: ['e'] })
    expect(renderer!.root.findAll((node) => node.type === 'ChatView')).toHaveLength(1)
    await update({ show: false, liveKeys: [] })
    expect(renderer!.root.findAll((node) => node.type === 'ChatView')).toHaveLength(0)
  })
  it('blurs an input left in the hidden tab without blurring a newly focused input', async () => {
    await render({ identity: 'a' })
    const oldInput = { id: 'old', blur: inputFocus.blur }
    inputFocus.get.mockReturnValue(oldInput)
    await update({ identity: 'b' })
    expect(inputFocus.blur).toHaveBeenCalledOnce()
    inputFocus.blur.mockClear()
    inputFocus.get.mockReturnValueOnce(oldInput).mockReturnValueOnce({ id: 'new' })
    await update({ identity: 'a' })
    expect(inputFocus.blur).not.toHaveBeenCalled()
  })
})
