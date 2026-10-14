import type { RpcClient } from '../transport/rpc-client'
import { nativeChatSessionPageRead } from './mobile-session-read-operations'
import {
  startMobileChatFirstRead,
  MOBILE_CHAT_FIRST_READ_TIMEOUT_MS
} from './mobile-chat-first-read'

export function startMobileNativeChatFirstRead(args: {
  client: RpcClient
  agent: string
  sessionId: string
  transcriptPath: string | null
  receive: (frame: unknown) => void
}): () => void {
  const { client, agent, sessionId, transcriptPath, receive } = args
  return startMobileChatFirstRead({
    read: async () => {
      const response = await nativeChatSessionPageRead.request(
        client,
        {
          agent,
          sessionId,
          limit: 40,
          ...(transcriptPath ? { transcriptPath } : {})
        },
        { timeoutMs: MOBILE_CHAT_FIRST_READ_TIMEOUT_MS, budgetSpansConnect: true }
      )
      const accepted = nativeChatSessionPageRead.interpret(response)
      if (!accepted.accepted) {
        throw new Error('Chat history could not be read')
      }
      const value = accepted.value
      if (value && typeof value === 'object' && 'error' in value) {
        throw new Error(String(value.error))
      }
      if (
        !value ||
        typeof value !== 'object' ||
        !('messages' in value) ||
        !Array.isArray(value.messages)
      ) {
        throw new Error('Chat history is unavailable')
      }
      return value
    },
    apply: (value) => receive({ ...value, type: 'snapshot' }),
    fail: (error) => receive({ type: 'error', message: error.message })
  })
}
