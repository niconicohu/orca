import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { structuredChatTabIsSideChat } from './structured-chat-tab-side-chat'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from './structured-agent-session-owner'
import { getStructuredAgentSessionStatusFeed } from './structured-agent-session-status-feed'
import type { Tab } from '../../../shared/tab-types'

const EMPTY_TABS: Tab[] = []

export function useWorkspaceSideChatTabs(worktreeId: string): ReadonlySet<string> {
  const tabs = useAppStore((state) => state.unifiedTabsByWorktree[worktreeId] ?? EMPTY_TABS)
  const owners = useAppStore(
    useShallow((state) => [
      ...new Set(
        (state.unifiedTabsByWorktree[worktreeId] ?? EMPTY_TABS)
          .filter((tab) => tab.contentType === 'agent-session')
          .flatMap((tab) => {
            const owner = structuredAgentSessionOwnerForTab(state, tab)
            return owner ? [owner] : []
          })
      )
    ])
  )
  const feeds = useMemo(
    () =>
      owners.flatMap((owner) => {
        const target = structuredAgentSessionTargetForHost(owner)
        return target ? [getStructuredAgentSessionStatusFeed(target)] : []
      }),
    [owners]
  )
  useEffect(() => {
    const releases = feeds.map((feed) => feed.activate())
    return () => releases.forEach((release) => release())
  }, [feeds])
  const subscribe = useMemo(
    () => (changed: () => void) => {
      const releases = feeds.map((feed) => feed.subscribe(changed))
      return () => releases.forEach((release) => release())
    },
    [feeds]
  )
  const read = () =>
    tabs
      .filter(
        (tab) =>
          tab.contentType === 'agent-session' &&
          structuredChatTabIsSideChat(useAppStore.getState(), tab)
      )
      .map((tab) => tab.id)
      .join('\n')
  const ids = useSyncExternalStore(subscribe, read, read)
  return useMemo(() => new Set(ids ? ids.split('\n') : []), [ids])
}
