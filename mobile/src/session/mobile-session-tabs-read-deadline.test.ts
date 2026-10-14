import { expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { RpcClientRequestTracker } from '../transport/rpc-client-request-tracker'
import { MobileSessionTabsStreamHealth } from './mobile-session-tabs-stream-health'

it('reports a stalled first tab request after eight seconds so the page can offer retry', async () => {
  vi.useFakeTimers()
  let sequence = 0
  const tracker = new RpcClientRequestTracker({
    nextId: () => String(++sequence),
    getState: () => 'connected',
    waitForConnected: async () => {},
    sendEncrypted: () => true,
    deviceToken: 'test'
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: tab reads use only sendRequest and the optional generation; the real request tracker owns timeouts.
  const client = { sendRequest: tracker.sendRequest.bind(tracker) } as unknown as RpcClient
  const failed = vi.fn()
  const controller = new MobileSessionTabsStreamHealth({
    client,
    scope: 'id:workspace',
    apply: () => ({ accepted: false }),
    consumeAccepted: () => {},
    hasRecoveryNeed: () => false,
    onFetchErrored: failed
  })
  try {
    controller.setReconciliationActive(true)
    const read = controller.ensureReconciliation()
    await vi.advanceTimersByTimeAsync(8000)
    await read
    expect(failed).toHaveBeenCalledOnce()
    expect(failed.mock.calls[0]?.[0].message).toContain('session.tabs.list')
  } finally {
    controller.dispose()
    tracker.rejectAll('test cleanup')
    vi.useRealTimers()
  }
})
