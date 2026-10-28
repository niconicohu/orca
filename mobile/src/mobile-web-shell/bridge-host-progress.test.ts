import { afterEach, describe, expect, it, vi } from 'vitest'
import { harness, ID } from './bridge-host-test-harness'
import { bridgeId, clientFrame, flushBridge, rpcSuccess } from './bridge-host-test-fakes'

afterEach(() => vi.useRealTimers())

describe('bridge load progress evidence', () => {
  it('separates a host reply wait from delivered but unacknowledged page events', async () => {
    vi.useFakeTimers()
    const bridge = harness({ ready: true })
    bridge.host.receive(
      clientFrame({
        type: 'request',
        id: ID,
        method: 'agentSession.hold',
        params: { sessionId: 'private-session' }
      })
    )
    bridge.host.receive(
      clientFrame({
        type: 'subscribe',
        id: bridgeId(2),
        method: 'agentSession.subscribe',
        params: { sessionId: 'private-session' }
      })
    )
    await vi.advanceTimersByTimeAsync(10_000)
    const waiting = bridge.diagnostics.find((item) => item.kind === 'progress')
    expect(waiting).toMatchObject({
      kind: 'progress',
      detail: expect.stringContaining('agentSession.hold:10000ms')
    })
    expect(waiting).toMatchObject({
      detail: expect.stringContaining('agentSession.subscribe:frames=0')
    })
    expect(JSON.stringify(waiting)).not.toContain('private-session')

    bridge.client.requests[0]?.resolve(rpcSuccess('wire-1', {}))
    bridge.client.streams[0]?.emit({ type: 'snapshot', body: 'private-message' })
    await flushBridge()
    await vi.advanceTimersByTimeAsync(20_000)
    const latest = bridge.diagnostics.findLast((item) => item.kind === 'progress')
    expect(latest).toMatchObject({ detail: expect.stringContaining('requests=0') })
    expect(latest).toMatchObject({
      detail: expect.stringContaining('agentSession.subscribe:frames=1,unacked=1')
    })
    expect(JSON.stringify(latest)).not.toContain('private-message')
    bridge.host.receive(clientFrame({ type: 'ack', id: bridgeId(2), seq: 1 }))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(bridge.diagnostics.findLast((item) => item.kind === 'progress')).toMatchObject({
      detail: expect.stringContaining('agentSession.subscribe:frames=1,unacked=0')
    })
  })

  it('bounds the capture and removes every observation timer on disposal', async () => {
    vi.useFakeTimers()
    const bridge = harness({ ready: true })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(bridge.diagnostics.filter((item) => item.kind === 'progress')).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(bridge.diagnostics.filter((item) => item.kind === 'progress')).toHaveLength(3)
    const early = harness({ ready: true })
    early.host.dispose()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(early.diagnostics.filter((item) => item.kind === 'progress')).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports a native handoff still pending without including its frame or arbitrary method text', async () => {
    vi.useFakeTimers()
    const bridge = harness({ ready: true, post: () => new Promise<void>(() => {}) })
    bridge.host.receive(
      clientFrame({
        type: 'request',
        id: ID,
        method: 'private-user-text',
        params: { secret: 'private-param' }
      })
    )
    await vi.advanceTimersByTimeAsync(10_000)
    const progress = bridge.diagnostics.find((item) => item.kind === 'progress')
    expect(progress).toMatchObject({ detail: expect.stringContaining('pendingPosts=1') })
    expect(progress).toMatchObject({ detail: expect.stringContaining('other:10000ms') })
    expect(JSON.stringify(progress)).not.toMatch(/private-user-text|private-param/)
  })
})
