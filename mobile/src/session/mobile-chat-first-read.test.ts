import { afterEach, expect, it, vi } from 'vitest'
import { startMobileChatFirstRead } from './mobile-chat-first-read'

afterEach(() => vi.useRealTimers())

it('cancels a not-yet-started history request when the live snapshot wins', async () => {
  vi.useFakeTimers()
  const read = vi.fn(async () => 'history')
  const stop = startMobileChatFirstRead({ read, apply: vi.fn(), fail: vi.fn() })
  stop()
  await vi.advanceTimersByTimeAsync(12000)
  expect(read).not.toHaveBeenCalled()
})

it('ignores a late fallback when a stream frame arrives during the read', async () => {
  vi.useFakeTimers()
  let resolve: (value: string) => void = () => {}
  const apply = vi.fn()
  const fail = vi.fn()
  const stop = startMobileChatFirstRead({
    read: () =>
      new Promise<string>((r) => {
        resolve = r
      }),
    apply,
    fail
  })
  await vi.advanceTimersByTimeAsync(3000)
  stop()
  resolve('stale history')
  await vi.advanceTimersByTimeAsync(12000)
  expect(apply).not.toHaveBeenCalled()
  expect(fail).not.toHaveBeenCalled()
})

it('ends loading within a bounded time even if the request never settles', async () => {
  vi.useFakeTimers()
  const fail = vi.fn()
  startMobileChatFirstRead({ read: () => new Promise<never>(() => {}), apply: vi.fn(), fail })
  await vi.advanceTimersByTimeAsync(11000)
  expect(fail).toHaveBeenCalledOnce()
  expect(fail.mock.calls[0]?.[0].message).toContain('timed out')
})

it('starts the recent read immediately instead of waiting for a stream grace period', async () => {
  vi.useFakeTimers()
  const read = vi.fn(async () => 'history')
  startMobileChatFirstRead({ read, apply: vi.fn(), fail: vi.fn() })
  await vi.advanceTimersByTimeAsync(0)
  expect(read).toHaveBeenCalledOnce()
})
