import type { SideChatPermission } from '../../../../shared/agent-session-side-chat'
import { useCallback } from 'react'
import { useHostStructuredAgent } from '@/runtime/native-chat/agent-catalogs/use-host-structured-agent'
import { useStructuredAgentSessionHostCapability } from '@/runtime/native-chat/host-capabilities/structured-agent-session-host-capability'
import { AGENT_SESSION_SIDE_CHAT_RUNTIME_CAPABILITY } from '../../../../shared/agent-session-side-chat'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { openNativeChatSideChat } from '@/lib/open-native-chat-side-chat'

export function useTabContextSideChat(input: {
  target: RuntimeClientTarget
  agent: string
  tabId: string
  worktreeId?: string
  sessionId: string
}) {
  const agent = useHostStructuredAgent(input.target, input.agent)
  const hostSupports = useStructuredAgentSessionHostCapability(
    input.target,
    AGENT_SESSION_SIDE_CHAT_RUNTIME_CAPABILITY
  )
  const supported = hostSupports && agent?.capabilities.sideChat === true && !!input.worktreeId
  const { tabId, worktreeId, sessionId } = input
  const open = useCallback(
    async (permission: SideChatPermission) =>
      supported &&
      !!worktreeId &&
      openNativeChatSideChat({ tabId, worktreeId, sessionId }, '', [], permission),
    [supported, tabId, worktreeId, sessionId]
  )
  return supported ? open : undefined
}
