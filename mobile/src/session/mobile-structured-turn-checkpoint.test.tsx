import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { useMobileStructuredAgentSession } from './use-mobile-structured-agent-session'
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {}
  }
}))
let listener: ((value: unknown) => void) | undefined
let hook: ReturnType<typeof useMobileStructuredAgentSession> | undefined
let renderer: ReactTestRenderer | undefined
const client = {
  sendRequest: async () => ({ ok: true, result: {} }),
  subscribe: (_method: string, _params: unknown, callback: (value: unknown) => void) => {
    listener = callback
    return () => {}
  }
}
function Harness() {
  hook = useMobileStructuredAgentSession({
    client: client as unknown as RpcClient,
    sessionId: 'long-turn-checkpoint',
    agent: 'codex',
    enabled: true,
    connected: true,
    hostSupport: null,
    onSendError: vi.fn()
  })
  return null
}
afterEach(() => act(() => renderer?.unmount()))
it('reads live completion outside the loaded page without adding lifecycle records to history', async () => {
  await act(async () => {
    renderer = create(createElement(Harness))
  })
  const latestTurn = {
    itemId: 'turn-outside-page',
    observedAt: 1000,
    turn: { turnId: 'long-turn', state: 'running', startedAt: 1000 }
  }
  const page = {
    sessionId: 'long-turn-checkpoint',
    epoch: 'e',
    direction: 'tail',
    items: [
      {
        itemId: 'tool-40',
        sequence: 100,
        revision: 1,
        observedAt: 2000,
        body: { kind: 'tool-call', name: 'Read', input: {}, state: 'completed' }
      }
    ],
    removedItemIds: [],
    submissions: [],
    window: {
      oldest: { epoch: 'e', sequence: 100 },
      newest: { epoch: 'e', sequence: 100 },
      nextCursor: { epoch: 'e', sequence: 100 }
    },
    liveCursor: { epoch: 'e', sequence: 100 },
    hasOlder: true,
    hasNewer: false,
    latestTurn
  }
  await act(async () =>
    listener?.({ type: 'snapshot', sessionId: 'long-turn-checkpoint', fence: 3, page })
  )
  expect(hook?.isWorking).toBe(true)
  expect(hook?.turnId).toBe('long-turn')
  expect(
    hook?.session.messages.some((message) =>
      message.blocks.some((block) => block.type === 'tool-call')
    )
  ).toBe(true)
  await act(async () =>
    listener?.({
      type: 'batch',
      sessionId: 'long-turn-checkpoint',
      batch: {
        cursor: { epoch: 'e', sequence: 101 },
        items: [],
        removedItemIds: [],
        submissions: []
      },
      latestTurn: {
        ...latestTurn,
        turn: { ...latestTurn.turn, state: 'completed', completedAt: 3000 }
      }
    })
  )
  expect(hook?.isWorking).toBe(false)
  expect(hook?.turnId).toBeNull()
  expect(hook?.settledTurns.get('__unanchored__')?.workedSeconds).toBe(2)
})
