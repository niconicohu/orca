import { afterEach, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { createMobileChatReadCache } from './mobile-chat-read-cache'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: cache identity only, no RPC methods are called.
const client = {} as RpcClient
afterEach(() => vi.useRealTimers())

it('isolates sessions and authenticated client instances', () => {
  const cache = createMobileChatReadCache<string>()
  cache.set(client, 'host-a/session', 'a')
  cache.set(client, 'host-b/session', 'b')
  expect(cache.get(client, 'host-a/session')).toBe('a')
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a distinct connection identity only.
  expect(cache.get({} as RpcClient, 'host-a/session')).toBeNull()
})

it('expires inactive history and bounds retained conversations', () => {
  vi.useFakeTimers()
  const cache = createMobileChatReadCache<string>()
  for (let index = 0; index < 17; index++) {
    cache.set(client, String(index), 'history')
  }
  expect(cache.get(client, '0')).toBeNull()
  expect(cache.get(client, '16')).toBe('history')
  vi.advanceTimersByTime(15 * 60 * 1000 + 1)
  expect(cache.get(client, '16')).toBeNull()
})

it('does not retain oversized history', () => {
  const cache = createMobileChatReadCache<string>()
  cache.set(client, 'large', 'x'.repeat(5 * 1024 * 1024))
  expect(cache.get(client, 'large')).toBeNull()
})
