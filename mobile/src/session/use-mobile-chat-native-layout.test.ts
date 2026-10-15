import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { View } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMobileChatNativeLayout } from './use-mobile-chat-native-layout'

vi.mock('react-native', () => ({
  View: class {},
  StyleSheet: { create: (styles: unknown) => styles }
}))

let renderer: ReactTestRenderer | null = null
let layout: ReturnType<typeof useMobileChatNativeLayout>
function Harness({ scope = 'host\0a', lastIndex = 501 }: { scope?: string; lastIndex?: number }) {
  layout = useMobileChatNativeLayout(scope, lastIndex)
  return null
}
function view(top: number, height: number, width = 320) {
  return Object.assign(new View({}), {
    measureInWindow: vi.fn(
      (callback: (x: number, y: number, width: number, height: number) => void) =>
        callback(0, top, width, height)
    )
  })
}
afterEach(() => act(() => renderer?.unmount()))
async function mount() {
  await act(async () => {
    renderer = create(createElement(Harness, {}))
  })
  layout.viewportRef.current = view(100, 400)
  layout.footerRef.current = view(492, 0)
  layout.rowRef.current = view(430, 62)
}

describe('native chat position confirmation', () => {
  it('requires the last row to complete native layout before accepting measured bounds', async () => {
    await mount()
    const receive = vi.fn()
    layout.measurePosition(1000, null, receive)
    expect(receive).not.toHaveBeenCalled()
    layout.onLastRowLayout()
    layout.measurePosition(1000, null, receive)
    expect(receive).toHaveBeenCalledWith(true, 400)
  })
  it('rejects a footer that is still above the intended tail', async () => {
    await mount()
    layout.onLastRowLayout()
    layout.footerRef.current = view(400, 0)
    layout.rowRef.current = view(338, 62)
    const receive = vi.fn()
    layout.measurePosition(1000, null, receive)
    expect(receive).toHaveBeenCalledWith(false, 400)
  })
  it('checks a saved reading offset rather than requiring the tail', async () => {
    await mount()
    layout.onLastRowLayout()
    layout.footerRef.current = view(892, 0)
    const receive = vi.fn()
    layout.measurePosition(1000, 200, receive)
    expect(receive).toHaveBeenCalledWith(true, 400)
  })
  it('ignores delayed native measurements after a session switch', async () => {
    await mount()
    layout.onLastRowLayout()
    let reply: ((x: number, y: number, width: number, height: number) => void) | undefined
    const viewport = view(100, 400)
    viewport.measureInWindow.mockImplementation((callback) => {
      reply = callback
    })
    layout.viewportRef.current = viewport
    const receive = vi.fn()
    layout.measurePosition(1000, null, receive)
    await act(async () => {
      renderer?.update(createElement(Harness, { scope: 'host\0b' }))
    })
    reply?.(0, 100, 320, 400)
    expect(receive).not.toHaveBeenCalled()
  })
  it('does not accept native bounds for a clipped or unmounted last row', async () => {
    await mount()
    layout.onLastRowLayout()
    layout.rowRef.current = view(430, 62, 0)
    const receive = vi.fn()
    layout.measurePosition(1000, null, receive)
    expect(receive).not.toHaveBeenCalled()
  })
})
