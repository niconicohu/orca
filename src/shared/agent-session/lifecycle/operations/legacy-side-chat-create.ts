import type { StructuredAgentSessionCreateParams } from './structured-agent-session-create'
import { structuredAgentSessionPayloadFingerprint } from './structured-agent-session-mutation'

export const LEGACY_SIDE_CHAT_CAPABILITY = 'agent-session.side-chat.v1'

/** Temporary client bridge for the privately deployed side-chat host, until its next update. */
export function legacySideChatCreateParams(
  params: StructuredAgentSessionCreateParams
): StructuredAgentSessionCreateParams & { sideChatOf?: string } {
  const source = params.forkFrom
  if (!source?.current) {
    return params
  }
  const fields = {
    worktree: params.worktree,
    agent: params.agent,
    resumeFrom: params.resumeFrom,
    sideChatOf: source.sessionId,
    tabId: params.tabId,
    firstMessage: params.firstMessage,
    options: undefined
  }
  return {
    ...params,
    ...fields,
    forkFrom: undefined,
    optionsMode: undefined,
    envelope: {
      ...params.envelope,
      payloadFingerprint: structuredAgentSessionPayloadFingerprint({
        method: 'agentSession.create',
        sessionId: params.envelope.sessionId,
        fields
      })
    },
    tabPlacement: params.tabPlacement
      ? { groupId: params.tabPlacement.groupId, afterTabId: params.tabPlacement.afterTabId }
      : undefined
  }
}
