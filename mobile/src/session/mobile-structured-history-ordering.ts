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
  const knownItems = epoch === state.epoch ? state.items : []
  const known = new Map([...window.detached, ...knownItems].map((item) => [item.itemId, item]))
  const writes: Record<string, number> = Object.assign(
    Object.create(null),
    window.writes ??
      Object.fromEntries(
        knownItems.map((item) => [item.itemId, state.cursor?.sequence ?? item.sequence])
      )
  )
  const deleted: Record<string, number> = Object.assign(Object.create(null), window.deleted)
  const deletedRevisions: Record<string, number> = Object.assign(
    Object.create(null),
    window.deletedRevisions
  )
  // A genuinely newer journal revision may revive a row; a replayed old value cannot.
  const incoming = page?.items ?? (event?.type === 'batch' ? event.batch.items : [])
  for (const item of incoming) {
    if (
      deleted[item.itemId] !== undefined &&
      sequence > deleted[item.itemId] &&
      item.revision > Math.max(1, deletedRevisions[item.itemId] ?? 0)
    ) {
      delete deleted[item.itemId]
      delete deletedRevisions[item.itemId]
    }
  }
  for (const id of removed) {
    if (sequence < (writes[id] ?? 0)) {
      continue
    }
    deleted[id] = Math.max(deleted[id] ?? 0, sequence)
    deletedRevisions[id] = Math.max(deletedRevisions[id] ?? 0, known.get(id)?.revision ?? 0)
  }
  for (const item of incoming) {
    if (deleted[item.itemId] === undefined) {
      writes[item.itemId] = Math.max(writes[item.itemId] ?? 0, sequence)
    }
  }
  let minimumSnapshot = window.minimumSnapshot
  let bytes = 0
  for (const [index, [id, stamp]] of Object.entries(deleted)
    .sort((a, b) => b[1] - a[1])
    .entries()) {
    bytes += id.length * 2 + 24
    if (index >= MAX_MOBILE_DELETIONS || bytes > 64 * 1024) {
      delete deleted[id]
      delete deletedRevisions[id]
      minimumSnapshot = Math.max(minimumSnapshot, stamp)
    }
  }
  bytes = 0
  for (const [index, [id, stamp]] of Object.entries(writes)
    .sort((a, b) => b[1] - a[1])
    .entries()) {
    bytes += id.length * 2 + 16
    if (index >= 4096 || bytes > 256 * 1024) {
      delete writes[id]
      minimumSnapshot = Math.max(minimumSnapshot, stamp)
    }
  }
  const stale = state.epoch === epoch && sequence < (state.cursor?.sequence ?? 0)
  const submissions = new Map(state.submissions.map((entry) => [entry.clientMessageId, entry]))
  const orderedSubmissions = (incoming: typeof state.submissions) =>
    stale ? incoming.map((entry) => submissions.get(entry.clientMessageId) ?? entry) : incoming
  const filter = (items: typeof state.items) =>
    items.filter((item) => deleted[item.itemId] === undefined)
  if (page) {
    const cached = known
    const items = filter(page.items).map((item) => {
      const previous = cached.get(item.itemId)
      return previous && previous.revision >= item.revision ? previous : item
    })
    const filtered: AgentSessionHistoryPage = {
      ...page,
      items,
      submissions: orderedSubmissions(page.submissions),
      removedItemIds: Object.keys(deleted),
      ...(state.epoch === page.epoch && sequence < (state.cursor?.sequence ?? 0)
        ? {
            latestTurn: state.latestTurn,
            working: state.working,
            actionablePromptIds: state.actionablePromptIds,
            backgroundTasks: state.backgroundTasks,
            queuedMessages: state.queuedMessages,
            queuePause: state.queuePause,
            nextQueuedMessageId: state.nextQueuedMessageId,
            hostNow: undefined
          }
        : {})
    }
    action =
      action.type === 'event' && (action.event.type === 'snapshot' || action.event.type === 'reset')
        ? {
            ...action,
            event: {
              ...action.event,
              page: filtered,
              ...(state.epoch === page.epoch && sequence < (state.cursor?.sequence ?? 0)
                ? {
                    fence: state.fence ?? action.event.fence,
                    activity: state.activity,
                    commands: state.commands,
                    backgroundTasks: state.backgroundTasks,
                    queuedMessages: state.queuedMessages,
                    queuePause: state.queuePause,
                    nextQueuedMessageId: state.nextQueuedMessageId,
                    hostNow: undefined
                  }
                : {})
            }
          }
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
            latestTurn: state.latestTurn,
            activity: undefined,
            commands: undefined,
            backgroundTasks: undefined,
            hostNow: undefined,
            working: state.working,
            actionablePromptIds: state.actionablePromptIds,
            queuedMessages: undefined,
            queuePause: undefined,
            nextQueuedMessageId: undefined
          }),
      batch: {
        ...event.batch,
        cursor: newer ? event.batch.cursor : state.cursor!,
        items: filter(event.batch.items),
        submissions: orderedSubmissions(event.batch.submissions),
        removedItemIds: Object.keys(deleted)
      }
    }
    action = { type: 'event', event: ordered }
  }
  return {
    action,
    page,
    window: {
      ...window,
      deleted,
      deletedRevisions,
      writes,
      minimumSnapshot,
      detached: filter(window.detached)
    }
  }
}
