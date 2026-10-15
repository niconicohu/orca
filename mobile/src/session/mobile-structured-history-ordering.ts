import type {
  AgentSessionHistoryPage,
  AgentSessionSubscribeEvent
} from '../../../src/shared/agent-session-wire'
import type { StructuredAgentSessionAction } from '../../../src/shared/structured-agent-session-reducer'
import {
  historyWindow,
  MAX_MOBILE_DELETIONS,
  type MobileStructuredChatState
} from './mobile-structured-history-window'

export function orderedMobileHistoryAction(
  state: MobileStructuredChatState,
  action: StructuredAgentSessionAction
) {
  const event = action.type === 'event' ? action.event : null
  const page =
    action.type === 'history-page' || action.type === 'older-page'
      ? action.page
      : event?.type === 'snapshot' || event?.type === 'reset'
        ? event.page
        : null
  const epoch = page?.epoch ?? (event?.type === 'batch' ? event.batch.cursor.epoch : state.epoch)
  if (event?.type === 'batch' && epoch !== state.epoch) {
    return null
  }
  const window =
    epoch === state.epoch
      ? historyWindow(state)
      : historyWindow({ ...state, items: [], mobileHistory: undefined })
  const removed =
    page?.removedItemIds ?? (event?.type === 'batch' ? event.batch.removedItemIds : [])
  const sequence = page
    ? (page.liveCursor ?? page.window.nextCursor).sequence
    : event?.type === 'batch'
      ? event.batch.cursor.sequence
      : 0
  if (sequence < window.minimumSnapshot && (page || event?.type === 'batch')) {
    return null
  }
  const deleted: Record<string, number> = Object.assign(Object.create(null), window.deleted)
  // Only a live write strictly after a tombstone can intentionally recreate an ID.
  if (event?.type === 'batch') {
    for (const item of event.batch.items) {
      if (deleted[item.itemId] !== undefined && sequence > deleted[item.itemId]) {
        delete deleted[item.itemId]
      }
    }
  }
  for (const id of removed) {
    deleted[id] = Math.max(deleted[id] ?? 0, sequence)
  }
  let minimumSnapshot = window.minimumSnapshot
  const entries = Object.entries(deleted).sort((a, b) => b[1] - a[1])
  let bytes = 0
  for (const [index, [id, stamp]] of entries.entries()) {
    bytes += id.length * 2 + 16
    if (index >= MAX_MOBILE_DELETIONS || bytes > 64 * 1024) {
      delete deleted[id]
      minimumSnapshot = Math.max(minimumSnapshot, stamp)
    }
  }
  const filter = (items: typeof state.items) =>
    items.filter((item) => deleted[item.itemId] === undefined)
  if (page) {
    const cached = new Map([...window.detached, ...state.items].map((item) => [item.itemId, item]))
    const items = filter(page.items).map((item) => {
      const previous = cached.get(item.itemId)
      return previous && previous.revision >= item.revision ? previous : item
    })
    const filtered: AgentSessionHistoryPage = {
      ...page,
      items,
      removedItemIds: [...new Set([...page.removedItemIds, ...Object.keys(deleted)])]
    }
    action =
      action.type === 'event' && (action.event.type === 'snapshot' || action.event.type === 'reset')
        ? { ...action, event: { ...action.event, page: filtered } }
        : action.type === 'history-page' || action.type === 'older-page'
          ? { ...action, page: filtered }
          : action
  } else if (event?.type === 'batch') {
    const newer = sequence >= (state.cursor?.sequence ?? 0)
    const ordered: AgentSessionSubscribeEvent = {
      ...event,
      ...(newer
        ? {}
        : {
            fence: undefined,
            latestTurn: undefined,
            activity: undefined,
            commands: undefined,
            backgroundTasks: undefined,
            hostNow: undefined
          }),
      batch: {
        ...event.batch,
        cursor: newer ? event.batch.cursor : state.cursor!,
        items: filter(event.batch.items),
        removedItemIds: Object.keys(deleted)
      }
    }
    action = { type: 'event', event: ordered }
  }
  return {
    action,
    page,
    window: { ...window, deleted, minimumSnapshot, detached: filter(window.detached) }
  }
}
