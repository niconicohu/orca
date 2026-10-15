import type { AgentSessionHistoryPage } from '../../../src/shared/agent-session-wire'
import { EMPTY_STRUCTURED_AGENT_SESSION } from '../../../src/shared/structured-agent-session-reducer'
import { reduceMobileStructuredChatCheckpoint } from './mobile-structured-chat-checkpoint'
import {
  historyWindow,
  MAX_DETACHED_ITEMS,
  type MobileStructuredChatState
} from './mobile-structured-history-window'

/** A fresh tail is authoritative only over its own interval, not the missing middle. */
export function applyMobileRecentPage(
  state: MobileStructuredChatState,
  page: AgentSessionHistoryPage
): MobileStructuredChatState {
  const sameEpoch = state.epoch === page.epoch
  const window = historyWindow(sameEpoch ? state : EMPTY_STRUCTURED_AGENT_SESSION)
  const cached = new Map(
    [...window.detached, ...(sameEpoch ? state.items : [])].map((item) => [item.itemId, item])
  )
  const items = page.items.map((item) => {
    const previous = cached.get(item.itemId)
    return previous && previous.revision >= item.revision ? previous : item
  })
  const first = items[0]?.sequence ?? Infinity
  const detached = [...cached.values()]
    .filter((item) => item.sequence < first && !Object.hasOwn(window.deleted, item.itemId))
    .slice(-MAX_DETACHED_ITEMS)
  const base: MobileStructuredChatState = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: page.epoch,
    hasOlder: page.hasOlder,
    fence: sameEpoch ? state.fence : null,
    mobileHistory: { ...window, before: page.window.nextCursor.sequence, detached, covered: [] },
    initialSyncRevision: state.initialSyncRevision
  }
  const next = reduceMobileStructuredChatCheckpoint(
    base,
    { type: 'history-page', page: { ...page, items } },
    Date.now()
  )
  return { ...next, syncing: false, initialSyncRevision: (state.initialSyncRevision ?? 0) + 1 }
}
