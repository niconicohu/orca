import type { AgentSessionHistoryPage } from '../../../src/shared/agent-session-wire'
import {
  reduceStructuredAgentSession,
  type StructuredAgentSessionAction,
  type StructuredAgentSessionState
} from '../../../src/shared/structured-agent-session-reducer'

/** A bounded page cannot prove absence; only explicit tombstones and reset frames remove rows. */
function retainedPage(
  state: StructuredAgentSessionState,
  page: AgentSessionHistoryPage
): AgentSessionHistoryPage {
  if (state.epoch !== page.epoch) {
    return {
      ...page,
      items: page.items.filter((item) => !page.removedItemIds.includes(item.itemId))
    }
  }
  const first = page.items[0]?.sequence
  const head = page.liveCursor ?? page.window.nextCursor
  if (first !== undefined && state.cursor && first > state.cursor.sequence + 1) {
    return page
  }
  const removed = new Set(page.removedItemIds)
  const incoming = new Map(page.items.map((item) => [item.itemId, item]))
  const items = new Map(
    page.items.filter((item) => !removed.has(item.itemId)).map((item) => [item.itemId, item])
  )
  for (const item of state.items) {
    if (removed.has(item.itemId)) {
      continue
    }
    const next = incoming.get(item.itemId)
    if (next) {
      if (item.revision > next.revision) {
        items.set(item.itemId, item)
      }
    } else {
      items.set(item.itemId, item)
    }
  }
  const submissions = new Map(page.submissions.map((item) => [item.clientMessageId, item]))
  for (const submission of state.submissions) {
    if (!submissions.has(submission.clientMessageId)) {
      submissions.set(submission.clientMessageId, submission)
    }
  }
  return {
    ...page,
    items: [...items.values()],
    submissions: [...submissions.values()],
    liveCursor: state.cursor && state.cursor.sequence > head.sequence ? state.cursor : head,
    hasOlder: page.hasOlder && state.hasOlder
  }
}

export function reduceMobileStructuredChatCheckpoint(
  state: StructuredAgentSessionState,
  action: StructuredAgentSessionAction,
  now: number
): StructuredAgentSessionState {
  if (action.type === 'history-page') {
    const page = retainedPage(state, action.page)
    const next = reduceStructuredAgentSession(state, { ...action, page }, now)
    return { ...next, fence: state.fence }
  }

  return reduceStructuredAgentSession(state, action, now)
}
