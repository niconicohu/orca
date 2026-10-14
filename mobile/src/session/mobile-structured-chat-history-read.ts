import type { AgentSessionHistoryResult } from '../../../src/shared/agent-session-wire'
import type { RpcClient } from '../transport/rpc-client'
import { measureChatRead } from '../diagnostics/chat-runtime-diagnostics'
import { callAgentSession } from './mobile-structured-agent-session-rpc'
import { MOBILE_CHAT_FIRST_READ_TIMEOUT_MS } from './mobile-chat-first-read'

export function readMobileStructuredChatHistory(client: RpcClient, sessionId: string) {
  return measureChatRead(client, sessionId, 'agentSession.history', () =>
    callAgentSession<AgentSessionHistoryResult>(
      client,
      'agentSession.history',
      { sessionId, direction: 'tail', limit: 40 },
      MOBILE_CHAT_FIRST_READ_TIMEOUT_MS
    )
  )
}
