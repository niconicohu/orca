import { mobileStructuredChatReads } from './mobile-structured-chat-route-cache'
import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { createFakeRpcClient } from '../mobile-web-shell/bridge-host-test-fakes'
import { useMobileStructuredAgentState } from './use-mobile-structured-agent-state'
import { applyMobileRecentPage } from './mobile-structured-chat-recent-page'
import { EMPTY_STRUCTURED_AGENT_SESSION } from '../../../src/shared/structured-agent-session-reducer'
import type { AgentSessionHistoryPage } from '../../../src/shared/agent-session-wire'
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }
}))
const client = createFakeRpcClient()
const request = client.sendRequest
client.sendRequest = (method, ...args) =>
  method === 'agentSession.hold' || method === 'agentSession.release'
    ? Promise.resolve({ id: 'hold', ok: true, result: {} })
    : request(method, ...args)
let state!: ReturnType<typeof useMobileStructuredAgentState>
let renderer: ReactTestRenderer | undefined
function Harness({ id }: { id: string }) {
  state = useMobileStructuredAgentState({
    client,
    sessionKey: id,
    sessionId: id,
    connected: true,
    enabled: true
  })
  return null
}
function page(first: number, last: number, head = last): AgentSessionHistoryPage {
  const cursor = (sequence: number) => ({ epoch: 'e', sequence })
  return {
    sessionId: 's',
    epoch: 'e',
    direction: 'tail',
    items: Array.from({ length: last - first + 1 }, (_, i) => ({
      itemId: String(first + i),
      sequence: first + i,
      revision: 1,
      observedAt: 1,
      body: {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: String(first + i) }]
      }
    })),
    submissions: [],
    removedItemIds: [],
    liveCursor: cursor(head),
    window: { oldest: cursor(first), newest: cursor(last), nextCursor: cursor(first) },
    hasOlder: first > 1,
    hasNewer: false
  }
}
async function flushRead(value: AgentSessionHistoryPage) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
  const request = client.requests.findLast((r) => r.method === 'agentSession.history')!
  await act(async () =>
    request.resolve({ id: 'test', ok: true, result: { ok: true, page: value } })
  )
}
afterEach(() => {
  act(() => renderer?.unmount())
  client.requests.length = 0
  client.streams.length = 0
})
it('starts with only the remote 40 entries, pages repeatedly and returns to a ready tab without a new read', async () => {
  await act(async () => {
    renderer = create(createElement(Harness, { id: 'a' }))
  })
  expect(client.streams[0]!.params).toEqual({ sessionId: 'a' })
  await flushRead(page(961, 1000))
  expect(state.state.items).toHaveLength(40)
  act(() => state.loadEarlier())
  expect(client.requests.at(-1)?.args[1]).toEqual({
    sessionId: 'a',
    direction: 'before',
    cursor: { epoch: 'e', sequence: 961 },
    limit: 40
  })
  await act(async () =>
    client.requests.at(-1)!.resolve({
      id: 'test',
      ok: true,
      result: { ok: true, page: { ...page(921, 960, 1000), direction: 'before' } }
    })
  )
  expect(state.state.items).toHaveLength(80)
  act(() => state.loadEarlier())
  expect(client.requests.at(-1)?.args[1]).toMatchObject({ cursor: { sequence: 921 } })
  await act(async () =>
    client.requests.at(-1)!.resolve({
      id: 'test',
      ok: true,
      result: { ok: true, page: { ...page(881, 920, 1000), direction: 'before' } }
    })
  )
  expect(state.state.items).toHaveLength(120)
  await act(async () => renderer!.update(createElement(Harness, { id: 'b' })))
  await flushRead(page(1, 2))
  const before = client.requests.filter((r) => r.method === 'agentSession.history').length
  await act(async () => renderer!.update(createElement(Harness, { id: 'a' })))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
  expect(client.requests.filter((r) => r.method === 'agentSession.history')).toHaveLength(before)
  expect(state.state.status).toBe('ready')
  expect(state.state.items).toHaveLength(120)
})
it('does not mistake stale complete cache for complete current history or fill its middle gap', () => {
  const cached = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    cursor: { epoch: 'e', sequence: 20 },
    items: page(1, 20).items,
    hasOlder: false
  }
  const latest = applyMobileRecentPage(cached, page(961, 1000))
  expect(latest.items.map((item) => item.sequence)).toEqual(
    Array.from({ length: 40 }, (_, i) => 961 + i)
  )
  expect(latest.hasOlder).toBe(true)
  expect(latest.mobileHistory?.before).toBe(961)
  expect(latest.mobileHistory?.detached).toHaveLength(20)
  expect(latest.mobileHistory?.covered).toEqual([{ first: 961, last: 1000 }])
})

it('merges pre-read live batches atomically, retaining the newest revision, deletion and running checkpoint', async () => {
  await act(async () => {
    renderer = create(createElement(Harness, { id: 'race' }))
  })
  const item = { ...page(1000, 1000).items[0]!, revision: 3 }
  await act(async () => {
    client.streams[0]!.emit({
      type: 'batch',
      sessionId: 'race',
      fence: 2,
      latestTurn: {
        itemId: 'turn',
        observedAt: 1,
        turn: { turnId: 'active', state: 'running', startedAt: 1 }
      },
      batch: {
        cursor: { epoch: 'e', sequence: 1002 },
        items: [item],
        removedItemIds: ['999'],
        submissions: []
      }
    })
    client.streams[0]!.emit({
      type: 'batch',
      sessionId: 'race',
      batch: {
        cursor: { epoch: 'e', sequence: 1001 },
        items: [{ ...item, revision: 2 }],
        removedItemIds: [],
        submissions: []
      }
    })
  })
  expect(state.state.status).toBe('loading')
  await flushRead(page(961, 1000))
  expect(state.state.status).toBe('ready')
  expect(state.state.items).toHaveLength(39)
  expect(state.state.items.find((row) => row.itemId === '1000')?.revision).toBe(3)
  expect(state.state.items.some((row) => row.itemId === '999')).toBe(false)
  expect(state.state.cursor?.sequence).toBe(1002)
  expect(state.state.latestTurn?.turn.state).toBe('running')
})

it('ignores an older-history reply after quickly switching to another tab', async () => {
  await act(async () => {
    renderer = create(createElement(Harness, { id: 'switch-a' }))
  })
  await flushRead(page(961, 1000))
  act(() => state.loadEarlier())
  const stale = client.requests.at(-1)!
  await act(async () => renderer!.update(createElement(Harness, { id: 'switch-b' })))
  await flushRead(page(1, 2))
  await act(async () =>
    stale.resolve({
      id: 'stale',
      ok: true,
      result: { ok: true, page: { ...page(921, 960), direction: 'before' } }
    })
  )
  expect(state.state.items.map((item) => item.itemId)).toEqual(['1', '2'])
})

it('shows a far-behind persisted checkpoint without waiting for the latest remote read', async () => {
  mobileStructuredChatReads.set(client, 'stale-disk', {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    cursor: { epoch: 'e', sequence: 20 },
    items: page(1, 20).items,
    status: 'ready'
  })
  await act(async () => {
    renderer = create(createElement(Harness, { id: 'stale-disk' }))
  })
  expect(state.state.items).toHaveLength(20)
  expect(state.state.status).toBe('ready')
  expect(state.state.syncing).toBe(true)
  expect(client.streams[0]!.params).toEqual({ sessionId: 'stale-disk' })
  await flushRead(page(961, 1000))
  expect(state.state.items).toHaveLength(40)
  expect(state.state.mobileHistory?.before).toBe(961)
  expect(state.state.mobileHistory?.detached).toHaveLength(20)
  expect(state.state.syncing).toBe(false)
  expect(
    client.requests.filter((request) => request.method === 'agentSession.history')
  ).toHaveLength(1)
})

it('accepts upstream hydration without custom parameters and retains child rows alongside the recent root window', async () => {
  await act(async () => {
    renderer = create(createElement(Harness, { id: 'upstream-hydration' }))
  })
  expect(client.streams[0]!.params).toEqual({ sessionId: 'upstream-hydration' })
  const upstream = page(1, 200, 401)
  upstream.items = upstream.items.flatMap((row) => {
    const root = { ...row, sequence: row.sequence * 2 }
    return row.sequence % 5 === 0
      ? [
          root,
          { ...root, itemId: `child-${row.itemId}`, sequence: root.sequence + 1, agentId: 'child' }
        ]
      : [root]
  })
  act(() =>
    client.streams[0]!.emit({
      type: 'snapshot',
      sessionId: 'upstream-hydration',
      fence: 1,
      page: upstream
    })
  )
  expect(state.state.status).toBe('ready')
  expect(state.state.items.filter((row) => row.agentId === undefined)).toHaveLength(40)
  expect(state.state.items.length).toBeGreaterThan(40)
  expect(state.state.items.at(-1)?.itemId).toBe('child-200')
  expect(state.state.hasOlder).toBe(true)
})
