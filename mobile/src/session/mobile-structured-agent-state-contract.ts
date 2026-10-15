import type { RpcClient } from '../transport/rpc-client'
import type { MobileStructuredChatState } from './mobile-structured-history-window'
export type MobileStructuredAgentStateArgs = {
  client: RpcClient | null
  sessionId: string | null
  sessionKey: string | null
  enabled: boolean
  /** Holds are connection-scoped; retained transcripts survive disconnection. */
  connected: boolean
}
export type MobileStructuredAgentState = {
  state: MobileStructuredChatState
  stateRef: { readonly current: MobileStructuredChatState }
  queuedMessages: import('./mobile-structured-queued-message-feed').MobileQueuedMessageFeed
  queuePause: import('./mobile-structured-queued-message-feed').MobileQueuePause
  loadingOlder: boolean
  loadEarlier: () => void
}
