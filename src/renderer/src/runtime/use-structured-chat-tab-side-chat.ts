import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Tab } from '../../../shared/tab-types'
import { isAgentSessionId } from '../../../shared/agent-session-record'
import { useAppStore } from '@/store'
import { readStructuredAgentLaunchRecord } from '@/lib/agent-session/launch/structured-agent-session-launch-persistence'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from './structured-agent-session-owner'
import { getStructuredAgentSessionStatusFeed } from './structured-agent-session-status-feed'

const noSubscription = (): (() => void) => () => {}

/** Read the owning host's saved relationship; a pending launch supplies it before attachment. */
export function useStructuredChatTabSideChat(
  tab: Pick<Tab, 'entityId' | 'worktreeId' | 'executionHostId' | 'sideChatOf'> | undefined
): boolean {
  const owner = useAppStore((state) => (tab ? structuredAgentSessionOwnerForTab(state, tab) : null))
  const feed = useMemo(() => {
    const target = structuredAgentSessionTargetForHost(owner)
    return target ? getStructuredAgentSessionStatusFeed(target) : null
  }, [owner])
  const sessionId = tab?.entityId
  const watched = sessionId ? feed : null
  useEffect(() => watched?.activate(), [watched])
  const parent = useSyncExternalStore(
    watched?.subscribe ?? noSubscription,
    () => (sessionId ? watched?.getSnapshot().get(sessionId)?.sideChatOf : undefined),
    () => undefined
  )
  const pending = sessionId ? readStructuredAgentLaunchRecord(sessionId) : undefined
  return (
    isAgentSessionId(parent) ||
    isAgentSessionId(tab?.sideChatOf) ||
    (pending?.executionHostId === owner && isAgentSessionId(pending?.sideChatOf))
  )
}
