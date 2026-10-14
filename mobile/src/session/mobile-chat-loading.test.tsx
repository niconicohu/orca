import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { AgentSessionSubscribeEvent } from '../../../src/shared/agent-session-wire'
import type { RpcClient } from '../transport/rpc-client'
import { useMobileStructuredAgentState } from './use-mobile-structured-agent-state'

const snapshot: AgentSessionSubscribeEvent = {
  type: 'snapshot',
  sessionId: 'session',
  fence: 3,
  page: {
    sessionId: 'session',
    epoch: 'epoch',
    fence: 3,
    direction: 'tail',
    items: [
      {
        itemId: 'message',
        revision: 1,
        sequence: 1,
        observedAt: 1,
        body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'retained' }] }
      }
    ],
    submissions: [],
    removedItemIds: [],
    hasOlder: false,
    hasNewer: false,
    window: {
      oldest: { epoch: 'epoch', sequence: 1 },
      newest: { epoch: 'epoch', sequence: 1 },
      nextCursor: { epoch: 'epoch', sequence: 1 }
    },
    liveCursor: { epoch: 'epoch', sequence: 1 }
  }
}
let renderer: ReactTestRenderer | null = null
let value: ReturnType<typeof useMobileStructuredAgentState> | null = null
function Harness({ client }: { client: RpcClient }) {
  value = useMobileStructuredAgentState({
    client,
    connected: true,
    enabled: true,
    sessionId: 'session',
    sessionKey: 'host/workspace/agent/session'
  })
  return null
}
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  value = null
  vi.useRealTimers()
})

it('restores structured history after route unmount without trusting the old write fence', async () => {
  let emit: (frame: unknown) => void = () => {}
  const subscribe = vi.fn((_method, _params, listener) => {
    emit = listener
    return () => {}
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hook only uses the two RPC members supplied here.
  const client = {
    subscribe,
    sendRequest: vi.fn().mockResolvedValue({ ok: true, result: {} })
  } as unknown as RpcClient
  await act(async () => {
    renderer = create(createElement(Harness, { client }))
  })
  act(() => emit(snapshot))
  expect(value?.state.items).toHaveLength(1)
  act(() => renderer?.unmount())
  await act(async () => {
    renderer = create(createElement(Harness, { client }))
  })
  expect(value?.state.items).toHaveLength(1)
  expect(value?.state.fence).toBeNull()
})

it('does not leave the transcript behind a hold that never completes', async () => {
  vi.useFakeTimers()
  const sendRequest = vi.fn((method) =>
    method === 'agentSession.hold'
      ? new Promise<never>(() => {})
      : Promise.resolve({ ok: true, result: { ok: true, page: snapshot.page } })
  )
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hook only uses the two RPC members supplied here.
  const client = { sendRequest, subscribe: vi.fn(() => () => {}) } as unknown as RpcClient
  await act(async () => {
    renderer = create(createElement(Harness, { client }))
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(sendRequest).toHaveBeenCalledWith(
    'agentSession.history',
    { sessionId: 'session', direction: 'tail', limit: 40 },
    expect.objectContaining({ timeoutMs: 8000 })
  )
  expect(value?.state.items).toHaveLength(1)
  expect(client.subscribe).toHaveBeenCalledWith(
    'agentSession.subscribe',
    { sessionId: 'session' },
    expect.any(Function)
  )
  // History fallback is for reading; a live subscribe must establish write authority.
  expect(value?.state.fence).toBeNull()
})

it('merges a live batch arriving before the recent read and keeps its newest revision', async () => {
  vi.useFakeTimers()
  let emit: (frame: unknown) => void = () => {}
  let resolve: (result: unknown) => void = () => {}
  const subscribe = vi.fn((_method, _params, listener) => {
    emit = listener
    return () => {}
  })
  const sendRequest = vi.fn((method) =>
    method === 'agentSession.history'
      ? new Promise((r) => {
          resolve = r
        })
      : new Promise<never>(() => {})
  )
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: supplied RPC members cover the hook.
  const client = { sendRequest, subscribe } as unknown as RpcClient
  await act(async () => {
    renderer = create(createElement(Harness, { client }))
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  act(() =>
    emit({
      type: 'batch',
      sessionId: 'session',
      fence: 4,
      batch: {
        cursor: { epoch: 'epoch', sequence: 2 },
        items: [{ ...snapshot.page.items[0], revision: 2 }],
        removedItemIds: [],
        submissions: []
      }
    })
  )
  await act(async () => {
    resolve({ ok: true, result: { ok: true, page: snapshot.page } })
  })
  expect(value?.state.items).toHaveLength(1)
  expect(value?.state.items[0]?.revision).toBe(2)
  expect(value?.state.cursor?.sequence).toBe(2)
  expect(value?.state.fence).toBe(4)
})
