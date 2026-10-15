import { encodeNativeChatTranscriptIdentity } from '../../../src/shared/native-chat-transcript-retention'
import type { StructuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileStructuredChatState } from './mobile-structured-history-window'
export type MobileStructuredAgentStateArgs = {
  snapshotLimit?: boolean
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

export function mobileStructuredAgentStateArgs(
  args: Pick<MobileStructuredAgentStateArgs, 'client' | 'sessionId' | 'enabled' | 'connected'> & {
    sourceIdentity?: string
    agent: string | null
    hostSupport: StructuredAgentSessionHostSupport | null
  }
): MobileStructuredAgentStateArgs & { sessionKey: string } {
  return {
    client: args.client,
    sessionId: args.sessionId,
    enabled: args.enabled,
    connected: args.connected,
    sessionKey: encodeNativeChatTranscriptIdentity([
      args.sourceIdentity ?? '',
      args.agent,
      args.sessionId
    ]),
    snapshotLimit: args.hostSupport?.snapshotLimit === true
  }
}
