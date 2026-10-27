import { useAppStore } from '@/store'
import { newAgentLaunchRequestId } from './agent-launch-request-id'
import { adoptAgentSessionLaunchVerdict } from './agent-session-launch-plan'
import { beginStructuredAgentSessionProvisionalLaunch } from './agent-session/structured-agent-session-provisional-tab'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { supportsStructuredAgentSessionSideChat } from '@/runtime/structured-agent-session-client'
import { isTuiAgent } from '../../../shared/tui-agent-config'

export async function openNativeChatSideChat(
  source: {
    tabId: string
    worktreeId: string
    sessionId: string
  },
  question = ''
): Promise<boolean> {
  const readSource = () =>
    useAppStore
      .getState()
      .unifiedTabsByWorktree[source.worktreeId]?.find(
        (tab) =>
          tab.id === source.tabId &&
          tab.contentType === 'agent-session' &&
          tab.entityId === source.sessionId
      )
  const tab = readSource()
  const agent = tab?.agentSessionAgent
  if (!tab || !agent || !isTuiAgent(agent)) {
    return false
  }
  const host = structuredAgentSessionOwnerForTab(useAppStore.getState(), tab)
  const target = structuredAgentSessionTargetForHost(host)
  if (!host || !target || !(await supportsStructuredAgentSessionSideChat(target))) {
    return false
  }
  const isCurrent = () => {
    const current = readSource()
    return (
      !!current &&
      current.agentSessionAgent === agent &&
      structuredAgentSessionOwnerForTab(useAppStore.getState(), current) === host
    )
  }
  if (!isCurrent()) {
    return false
  }
  const plan = adoptAgentSessionLaunchVerdict({
    route: 'structured-native-chat',
    requestedSurface: 'chat',
    requestId: newAgentLaunchRequestId(),
    worktreeId: source.worktreeId,
    executionHostId: host,
    agent,
    sideChatOf: source.sessionId,
    ...(question.trim() ? { prompt: question, promptDelivery: 'auto-submit' } : {})
  })
  const launch = beginStructuredAgentSessionProvisionalLaunch({
    plan,
    hooks: { beforeCreate: isCurrent },
    afterTabId: source.tabId,
    beforeOpen: isCurrent
  })
  if (!launch) {
    return false
  }
  const result = await launch.settlement
  if (result.kind !== 'structured') {
    return false
  }
  return result.promptDeliveryResult ? (await result.promptDeliveryResult).delivered : true
}
