import type { RpcClient } from '../transport/rpc-client'
import type { StructuredAgentSessionState } from '../../../src/shared/structured-agent-session-reducer'
export type MobileStructuredAgentStateArgs = {
  client: RpcClient | null
  sessionId: string | null
  sessionKey: string | null
  enabled: boolean
  /** Holds are connection-scoped; retained transcripts survive disconnection. */
  connected: boolean
}
export type MobileStructuredAgentState = {
  state: StructuredAgentSessionState
  stateRef: { readonly current: StructuredAgentSessionState }
  loadingOlder: boolean
  loadEarlier: () => void
}
