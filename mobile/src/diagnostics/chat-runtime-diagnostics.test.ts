import { describe, expect, it, vi } from 'vitest'
import { createFakeRpcClient } from '../mobile-web-shell/bridge-host-test-fakes'
import { startMobileNativeChatFirstRead } from '../session/mobile-native-chat-first-read'
import {
  chatRuntimeDiagnosticLines,
  registerChatDiagnosticClient,
  recordChatDiagnostic
} from './chat-runtime-diagnostics'

describe('chat runtime capture', () => {
  it('captures the real recent-history request duration without retaining its contents', async () => {
    vi.useFakeTimers()
    const client = createFakeRpcClient()
    registerChatDiagnosticClient(client, 'trace-host')
    const receive = vi.fn()
    const stop = startMobileNativeChatFirstRead({
      client,
      agent: 'codex',
      sessionId: 'private-session',
      transcriptPath: '/private/path',
      receive
    })
    await vi.advanceTimersByTimeAsync(100)
    expect(client.requests[0]?.method).toBe('nativeChat.readSession')
    await vi.advanceTimersByTimeAsync(1234)
    client.requests[0]?.resolve({
      id: 'request',
      ok: true,
      result: { messages: [], secret: 'private-body' }
    })
    await vi.advanceTimersByTimeAsync(0)
    const report = chatRuntimeDiagnosticLines('trace-host').join('\n')
    expect(report).toContain('nativeChat.readSession phase=start')
    expect(report).toContain('phase=reply elapsedMs=1234 ok=true')
    expect(report).not.toMatch(/private-session|private-body|private\/path/)
    expect(receive).toHaveBeenCalledOnce()
    stop()
    vi.useRealTimers()
  })
  it('bounds capture and keeps different hosts separate', () => {
    for (let n = 0; n < 200; n++) {
      recordChatDiagnostic('bounded-host', `session-${n}`, 'chat-state', { messages: n })
    }
    const rows = chatRuntimeDiagnosticLines('bounded-host')
    expect(rows).toHaveLength(81)
    expect(rows.at(-1)).toContain('messages=199')
    expect(chatRuntimeDiagnosticLines('unseen-host').join('\n')).toContain(
      'No chat events captured'
    )
  })
})
