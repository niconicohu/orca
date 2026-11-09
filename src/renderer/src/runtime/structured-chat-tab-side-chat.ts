import type { Tab } from '../../../shared/tab-types'
import { isAgentSessionId } from '../../../shared/agent-session/lifecycle/agent-session-record'
import type { AppState } from '@/store/types'
import { readStructuredAgentLaunchRecord } from '@/lib/agent-session/launch/structured-agent-session-launch-persistence'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from './native-chat/session-ownership/structured-agent-session-owner'
import { getStructuredAgentSessionStatusFeed } from './native-chat/status/structured-agent-session-status-feed'

export function structuredChatTabIsSideChat(
  state: AppState,
  tab: Pick<Tab, 'entityId' | 'worktreeId' | 'executionHostId' | 'sideChatOf'>
): boolean {
  const owner = structuredAgentSessionOwnerForTab(state, tab)
  const target = structuredAgentSessionTargetForHost(owner)
  const parent = target
    ? getStructuredAgentSessionStatusFeed(target).getSnapshot().get(tab.entityId)?.sideChatOf
    : undefined
  const pending = readStructuredAgentLaunchRecord(tab.entityId)
  return (
    isAgentSessionId(parent) ||
    isAgentSessionId(tab.sideChatOf) ||
    (pending?.executionHostId === owner && isAgentSessionId(pending?.sideChatOf))
  )
}
