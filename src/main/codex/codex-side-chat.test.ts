import { describe, expect, it, vi } from 'vitest'
import { openCodexThread } from './codex-structured-thread-open'
import { CodexAppServerRequestError } from './app-server/codex-app-server-request-error'

const launch = { cwd: '/workspace', resumeThreadId: null, forkThreadId: 'parent', sideChat: true }

describe('Codex side conversations', () => {
  it('forks provider history into another thread without resuming or interrupting the parent', async () => {
    const request = vi.fn(async (_method: string) => ({
      thread: { id: 'child', historyMode: 'paginated' }
    }))
    const opened = await openCodexThread({ request }, launch, 2000)
    expect(opened.threadId).toBe('child')
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      'thread/fork',
      'thread/goal/clear'
    ])
    expect(request).toHaveBeenNthCalledWith(
      1,
      'thread/fork',
      {
        threadId: 'parent',
        cwd: '/workspace',
        excludeTurns: true,
        sandbox: 'read-only',
        approvalPolicy: 'never',
        approvalsReviewer: 'user'
      },
      { timeoutMs: 2000 }
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      'thread/goal/clear',
      {
        threadId: 'child',
        origin: 'user'
      },
      { timeoutMs: 2000 }
    )
  })

  it('never changes a returned source identity or falls back to a blank conversation', async () => {
    const request = vi.fn(async () => ({ thread: { id: 'parent' } }))
    await expect(openCodexThread({ request }, launch, 2000)).rejects.toThrow('source thread')
    expect(request).toHaveBeenCalledOnce()
  })

  it('does not fall back to starting or resuming when the provider cannot fork', async () => {
    const error = new CodexAppServerRequestError('thread/fork', -32601, 'Unsupported')
    const request = vi.fn().mockRejectedValue(error)
    await expect(openCodexThread({ request }, launch, 2000)).rejects.toBe(error)
    expect(request).toHaveBeenCalledOnce()
  })

  it('retains read-only policy on subsequent resumes, overriding full-access settings', async () => {
    const request = vi.fn(async () => ({ thread: { id: 'child' } }))
    await openCodexThread(
      { request },
      {
        cwd: '/workspace',
        resumeThreadId: 'child',
        sideChat: true,
        permissionPolicy: {
          sandbox: 'danger-full-access',
          approvalPolicy: 'never',
          approvalsReviewer: 'user'
        }
      },
      2000
    )
    expect(request).toHaveBeenCalledExactlyOnceWith(
      'thread/resume',
      {
        threadId: 'child',
        cwd: '/workspace',
        excludeTurns: true,
        sandbox: 'read-only',
        approvalPolicy: 'never',
        approvalsReviewer: 'user'
      },
      { timeoutMs: 2000 }
    )
  })

  it('supports providers predating goals, but does not hide an uncertain goal clear', async () => {
    const request = vi.fn(async (method: string) => {
      if (method === 'thread/goal/clear') {
        throw new CodexAppServerRequestError(method, -32601, 'Unsupported')
      }
      return { thread: { id: 'child' } }
    })
    await expect(openCodexThread({ request }, launch, 2000)).resolves.toMatchObject({
      threadId: 'child'
    })
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/goal/clear') {
        throw new Error('transport lost')
      }
      return { thread: { id: 'child' } }
    })
    await expect(openCodexThread({ request }, launch, 2000)).rejects.toThrow('transport lost')
  })
})
