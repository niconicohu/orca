import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import {
  AGENT_SESSION_SIDE_CHAT_RUNTIME_CAPABILITY,
  AGENT_SESSION_SIDE_CHAT_READ_ONLY_CAPABILITY
} from '../../../../../shared/agent-session-side-chat'
import { structuredAgentSessionHostSupports } from './structured-agent-session-host-support'

export function supportsStructuredAgentSessionReadOnlySideChat(
  target: RuntimeClientTarget
): Promise<boolean> {
  return structuredAgentSessionHostSupports(target, AGENT_SESSION_SIDE_CHAT_READ_ONLY_CAPABILITY)
}

export function supportsStructuredAgentSessionSideChat(
  target: RuntimeClientTarget
): Promise<boolean> {
  return structuredAgentSessionHostSupports(target, AGENT_SESSION_SIDE_CHAT_RUNTIME_CAPABILITY)
}
