import { orderedMobileHistoryAction } from './mobile-structured-history-ordering'
import type { MobileStructuredChatState } from './mobile-structured-history-window'
import { activeStructuredAgentSessionTurnId } from '../../../src/shared/structured-agent-session-live-turn'
import type {
  AgentSessionSubscribeEvent,
  AgentSessionHistoryPage
} from '../../../src/shared/agent-session-wire'
import {
  EMPTY_STRUCTURED_AGENT_SESSION,
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
  state: MobileStructuredChatState,
  action: StructuredAgentSessionAction,
  now: number
): MobileStructuredChatState {
  if (typeof state.retainedOwnItemLimit !== 'number' || typeof state.retainedItemCap !== 'number') {
    state = {
      ...EMPTY_STRUCTURED_AGENT_SESSION,
      ...state,
      retainedOwnItemLimit:
        state.retainedOwnItemLimit ?? EMPTY_STRUCTURED_AGENT_SESSION.retainedOwnItemLimit,
      retainedItemCap: state.retainedItemCap ?? EMPTY_STRUCTURED_AGENT_SESSION.retainedItemCap
    }
  }
  if (
    action.type === 'older-page' &&
    (state.epoch !== action.requestedCursor.epoch || action.page.epoch !== state.epoch)
  ) {
    return state
  }
  const ordered = orderedMobileHistoryAction(state, action)
  if (!ordered) {
    return state
  }
  action = ordered.action
  const { window } = ordered
  if (action.type === 'older-page') {
    if (window.before !== action.requestedCursor.sequence) {
      return state
    }
    // A deleted head does not create a gap. The core reducer's trim guard uses
    // visible rows; mobile owns the independent before cursor instead.
    action = {
      ...action,
      requestedCursor: {
        ...action.requestedCursor,
        sequence: Math.max(action.requestedCursor.sequence, state.items[0]?.sequence ?? 0)
      }
    }
  }
  let next: StructuredAgentSessionState
  if (action.type === 'history-page') {
    let page = retainedPage(state, action.page)
    const incomingHead = action.page.liveCursor ?? action.page.window.nextCursor
    if (
      state.epoch === page.epoch &&
      state.latestTurn !== undefined &&
      state.cursor &&
      state.cursor.sequence > incomingHead.sequence
    ) {
      page = { ...page, latestTurn: state.latestTurn }
    }
    next = {
      ...reduceStructuredAgentSession(state, { ...action, page }, now),
      fence: state.epoch === page.epoch ? state.fence : null
    }
  } else if (
    action.type === 'event' &&
    action.event.type === 'snapshot' &&
    state.epoch === action.event.page.epoch
  ) {
    const event = action.event
    const merged = retainedPage(state, event.page)
    next = reduceStructuredAgentSession(
      state,
      { type: 'event', event: { ...event, page: merged } },
      now
    )
  } else {
    next = reduceStructuredAgentSession(state, action, now)
  }
  const page = ordered.page
  const event = action.type === 'event' ? action.event : null
  const reset = event?.type === 'reset'
  const disjoint =
    page && page.items[0] && state.cursor && page.items[0].sequence > state.cursor.sequence + 1
  const trimmed =
    event?.type === 'batch' &&
    state.items[0] &&
    next.items[0] &&
    next.items[0].sequence > state.items[0].sequence &&
    window.deleted[state.items[0].itemId] === undefined
  const before = trimmed
    ? next.items[0]!.sequence
    : page
      ? action.type === 'older-page' ||
        reset ||
        disjoint ||
        window.before === null ||
        state.epoch !== page.epoch
        ? page.window.nextCursor.sequence
        : Math.min(window.before, page.window.nextCursor.sequence)
      : window.before
  const covered =
    page && page.items.length
      ? [
          { first: page.items[0]!.sequence, last: page.items.at(-1)!.sequence },
          ...(reset || disjoint ? [] : window.covered)
        ].slice(0, 32)
      : window.covered
  return {
    ...next,
    syncing: state.syncing,
    initialSyncRevision: state.initialSyncRevision,
    mobileHistory: { ...window, before, covered }
  }
}

export function isResumedBatchForCheckpoint(
  state: StructuredAgentSessionState,
  event: AgentSessionSubscribeEvent
): boolean {
  return (
    event.type === 'batch' &&
    state.items.length > 0 &&
    event.batch.cursor.epoch === state.epoch &&
    event.batch.cursor.sequence >= (state.cursor?.sequence ?? 0)
  )
}

export function mobileStructuredActiveTurnId(state: StructuredAgentSessionState): string | null {
  return state.latestTurn === undefined
    ? activeStructuredAgentSessionTurnId(state.items)
    : state.latestTurn?.turn.state === 'running'
      ? state.latestTurn.turn.turnId
      : null
}
