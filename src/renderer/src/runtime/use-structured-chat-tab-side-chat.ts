import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Tab } from '../../../shared/tab-types'
import { useAppStore } from '@/store'
import { structuredChatTabIsSideChat } from './structured-chat-tab-side-chat'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from './native-chat/session-ownership/structured-agent-session-owner'
import { getStructuredAgentSessionStatusFeed } from './native-chat/status/structured-agent-session-status-feed'

type SideChatTab = Pick<Tab, 'entityId' | 'worktreeId' | 'executionHostId' | 'sideChatOf'>

const noSubscription = (): (() => void) => () => {}

function readSideChat(tab: SideChatTab | undefined): boolean {
  return tab ? structuredChatTabIsSideChat(useAppStore.getState(), tab) : false
}

/** Read the owning host's saved relationship; a pending launch supplies it before attachment. */
export function useStructuredChatTabSideChat(tab: SideChatTab | undefined): boolean {
  const owner = useAppStore((state) => (tab ? structuredAgentSessionOwnerForTab(state, tab) : null))
  const feed = useMemo(() => {
    const target = structuredAgentSessionTargetForHost(owner)
    return target ? getStructuredAgentSessionStatusFeed(target) : null
  }, [owner])
  const watched = tab?.entityId ? feed : null
  useEffect(() => watched?.activate(), [watched])
  const read = () => readSideChat(tab)
  return useSyncExternalStore(watched?.subscribe ?? noSubscription, read, read)
}
