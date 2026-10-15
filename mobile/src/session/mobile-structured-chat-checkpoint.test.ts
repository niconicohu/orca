import { acceptedSubmission } from './use-mobile-structured-agent-session-queued.test-fixture'
import { expect, it } from 'vitest'
import type { AgentSessionHistoryPage } from '../../../src/shared/agent-session-wire'
import { EMPTY_STRUCTURED_AGENT_SESSION } from '../../../src/shared/structured-agent-session-reducer'
import { reduceMobileStructuredChatCheckpoint } from './mobile-structured-chat-checkpoint'
function page(sequence: number, revision = 1): AgentSessionHistoryPage {
  const cursor = { epoch: 'e', sequence }
  return {
    sessionId: 's',
    epoch: 'e',
    direction: 'tail',
    items: [
      {
        itemId: 'm',
        sequence,
        revision,
        observedAt: 1,
        body: {
          kind: 'message',
          role: 'assistant',
          blocks: [{ type: 'text', text: `rev${revision}` }]
        }
      }
    ],
    submissions: [],
    removedItemIds: [],
    hasOlder: false,
    hasNewer: false,
    window: { oldest: cursor, newest: cursor, nextCursor: cursor },
    liveCursor: cursor
  }
}
it('a late recent read keeps a newer revision and live cursor', () => {
  const state = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    fence: 5,
    status: 'ready' as const,
    cursor: { epoch: 'e', sequence: 4 },
    items: page(1, 3).items
  }
  const next = reduceMobileStructuredChatCheckpoint(
    state,
    { type: 'history-page', page: page(1, 1) },
    1
  )
  expect(next.items[0]?.revision).toBe(3)
  expect(next.cursor?.sequence).toBe(4)
  expect(next.fence).toBe(5)
})
it('live deletion prevents a late read from resurrecting an item', () => {
  const incoming = page(1)
  const next = reduceMobileStructuredChatCheckpoint(
    { ...EMPTY_STRUCTURED_AGENT_SESSION, epoch: 'e', cursor: { epoch: 'e', sequence: 2 } },
    { type: 'history-page', page: { ...incoming, removedItemIds: ['m'] } },
    1
  )
  expect(next.items).toEqual([])
  expect(next.cursor?.sequence).toBe(2)
})
it('an authoritative reset clears retained history', () => {
  const state = { ...EMPTY_STRUCTURED_AGENT_SESSION, epoch: 'e', items: page(1).items }
  const next = reduceMobileStructuredChatCheckpoint(
    state,
    {
      type: 'event',
      event: {
        type: 'reset',
        sessionId: 's',
        reset: 'epoch_changed',
        fence: 2,
        page: { ...page(1), epoch: 'new', items: [] }
      }
    },
    1
  )
  expect(next.items).toEqual([])
  expect(next.epoch).toBe('new')
})

it('does not infer deletion from an item missing inside a bounded recent page', () => {
  const items = [1, 2, 3].flatMap((sequence) =>
    page(sequence).items.map((item) => ({ ...item, itemId: String(sequence) }))
  )
  const state = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    cursor: { epoch: 'e', sequence: 3 },
    items
  }
  const recent = { ...page(3), items: items.filter((item) => item.sequence !== 2), hasOlder: true }
  const next = reduceMobileStructuredChatCheckpoint(
    state,
    { type: 'history-page', page: recent },
    1
  )
  expect(next.items.map((item) => item.itemId)).toEqual(['1', '2', '3'])
})

it('keeps a newer live latest-turn checkpoint when an older history read returns late', () => {
  const latestTurn = {
    itemId: 'turn',
    observedAt: 1,
    turn: { turnId: 't', state: 'completed' as const, startedAt: 1, completedAt: 3 }
  }
  const state = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    cursor: { epoch: 'e', sequence: 4 },
    latestTurn
  }
  const incoming = {
    ...page(1),
    latestTurn: { ...latestTurn, turn: { turnId: 't', state: 'running' as const, startedAt: 1 } }
  }
  const next = reduceMobileStructuredChatCheckpoint(
    state,
    { type: 'history-page', page: incoming },
    5
  )
  expect(next.latestTurn?.turn.state).toBe('completed')
  expect(incoming.latestTurn.turn.state).toBe('running')
})
it('accepts explicit null latest-turn checkpoints rather than reviving an old running row', () => {
  const event = {
    type: 'snapshot' as const,
    sessionId: 's',
    fence: 1,
    page: { ...page(1), latestTurn: null }
  }
  const next = reduceMobileStructuredChatCheckpoint(
    EMPTY_STRUCTURED_AGENT_SESSION,
    { type: 'event', event },
    1
  )
  expect(next.latestTurn).toBeNull()
})

it('does not resurrect a live-deleted message when an older page arrives late', () => {
  const state = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    fence: 3,
    cursor: { epoch: 'e', sequence: 100 },
    hasOlder: true,
    status: 'ready' as const,
    items: page(40).items.map((item) => ({ ...item, itemId: 'head' }))
  }
  const deleted = reduceMobileStructuredChatCheckpoint(
    state,
    {
      type: 'event',
      event: {
        type: 'batch',
        sessionId: 's',
        fence: 3,
        batch: {
          cursor: { epoch: 'e', sequence: 101 },
          items: [],
          removedItemIds: ['m'],
          submissions: []
        }
      }
    },
    1
  )
  const restored = reduceMobileStructuredChatCheckpoint(
    deleted,
    {
      type: 'older-page',
      requestedCursor: { epoch: 'e', sequence: 40 },
      page: { ...page(1), direction: 'before' }
    },
    2
  )
  expect(restored.items.map((item) => item.itemId)).toEqual(['head'])
})

it('merges late live revisions without rolling the cursor or turn state backward', () => {
  const state = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    cursor: { epoch: 'e', sequence: 100 },
    items: page(40, 1).items,
    hasOlder: true
  }
  const batch = (sequence: number, revision: number) => ({
    type: 'event' as const,
    event: {
      type: 'batch' as const,
      sessionId: 's',
      batch: {
        cursor: { epoch: 'e', sequence },
        items: page(40, revision).items,
        removedItemIds: [],
        submissions: []
      }
    }
  })
  const newer = reduceMobileStructuredChatCheckpoint(state, batch(105, 3), 1)
  const late = reduceMobileStructuredChatCheckpoint(newer, batch(103, 2), 2)
  expect(late.items[0]?.revision).toBe(3)
  expect(late.cursor?.sequence).toBe(105)
  const older = reduceMobileStructuredChatCheckpoint(
    late,
    {
      type: 'older-page',
      requestedCursor: { epoch: 'e', sequence: 40 },
      page: { ...page(40, 1), direction: 'before' }
    },
    3
  )
  expect(older.items[0]?.revision).toBe(3)
})

it('rejects batches from a replaced epoch and bounds deletion memory', () => {
  const state = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    cursor: { epoch: 'e', sequence: 100 },
    items: page(40).items
  }
  const foreign = reduceMobileStructuredChatCheckpoint(
    state,
    {
      type: 'event',
      event: {
        type: 'batch',
        sessionId: 's',
        batch: {
          cursor: { epoch: 'old', sequence: 200 },
          items: [],
          submissions: [],
          removedItemIds: ['m']
        }
      }
    },
    1
  )
  expect(foreign).toBe(state)
  const deleted = reduceMobileStructuredChatCheckpoint(
    state,
    {
      type: 'event',
      event: {
        type: 'batch',
        sessionId: 's',
        batch: {
          cursor: { epoch: 'e', sequence: 200 },
          items: [],
          submissions: [],
          removedItemIds: Array.from({ length: 2500 }, (_, i) => String(i))
        }
      }
    },
    2
  )
  expect(Object.keys(deleted.mobileHistory!.deleted).length).toBeLessThanOrEqual(2048)
  expect(deleted.mobileHistory!.minimumSnapshot).toBe(200)
  const late = reduceMobileStructuredChatCheckpoint(
    deleted,
    { type: 'older-page', requestedCursor: { epoch: 'e', sequence: 40 }, page: page(1) },
    3
  )
  expect(late).toBe(deleted)
})

it('continues paging when a live deletion removes the visible page anchor', () => {
  const state = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    cursor: { epoch: 'e', sequence: 100 },
    fence: 1,
    hasOlder: true,
    items: [...page(40).items.map((item) => ({ ...item, itemId: 'anchor' })), ...page(41).items]
  }
  const deleted = reduceMobileStructuredChatCheckpoint(
    state,
    {
      type: 'event',
      event: {
        type: 'batch',
        sessionId: 's',
        fence: 1,
        batch: {
          cursor: { epoch: 'e', sequence: 101 },
          items: [],
          removedItemIds: ['anchor'],
          submissions: []
        }
      }
    },
    1
  )
  const older = reduceMobileStructuredChatCheckpoint(
    deleted,
    {
      type: 'older-page',
      requestedCursor: { epoch: 'e', sequence: 40 },
      page: {
        ...page(39),
        direction: 'before',
        items: page(39).items.map((item) => ({ ...item, itemId: 'older' }))
      }
    },
    2
  )
  expect(older.items.map((item) => item.itemId)).toEqual(['older', 'm'])
  expect(older.mobileHistory?.before).toBe(39)
})

it('never revives a tombstoned stable ID from a replay of the old revision', () => {
  const base = reduceMobileStructuredChatCheckpoint(
    EMPTY_STRUCTURED_AGENT_SESSION,
    { type: 'history-page', page: page(1) },
    1
  )
  const deleted = reduceMobileStructuredChatCheckpoint(
    base,
    {
      type: 'event',
      event: {
        type: 'batch',
        sessionId: 's',
        batch: {
          cursor: { epoch: 'e', sequence: 2 },
          items: [],
          removedItemIds: ['m'],
          submissions: []
        }
      }
    },
    2
  )
  const replayed = reduceMobileStructuredChatCheckpoint(
    deleted,
    {
      type: 'event',
      event: {
        type: 'batch',
        sessionId: 's',
        batch: {
          cursor: { epoch: 'e', sequence: 3 },
          items: page(1, 1).items,
          removedItemIds: [],
          submissions: []
        }
      }
    },
    3
  )
  expect(replayed.items).toEqual([])
  expect(replayed.cursor?.sequence).toBe(3)
})

it('preserves newer running state and write authority when a stale snapshot arrives', () => {
  const running = {
    itemId: 'turn',
    observedAt: 3,
    turn: { turnId: 't', state: 'running' as const, startedAt: 3 }
  }
  const state = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    fence: 5,
    cursor: { epoch: 'e', sequence: 5 },
    items: page(1, 3).items,
    latestTurn: running,
    working: true,
    actionablePromptIds: ['permission']
  }
  const next = reduceMobileStructuredChatCheckpoint(
    state,
    {
      type: 'event',
      event: {
        type: 'snapshot',
        sessionId: 's',
        fence: 2,
        page: { ...page(1), latestTurn: null, working: false, actionablePromptIds: [] }
      }
    },
    10
  )
  expect(next).toMatchObject({
    fence: 5,
    working: true,
    actionablePromptIds: ['permission'],
    latestTurn: running
  })
})

it('accepts a genuine newer revision after deletion and ignores a replayed old deletion', () => {
  const base = reduceMobileStructuredChatCheckpoint(
    EMPTY_STRUCTURED_AGENT_SESSION,
    { type: 'history-page', page: page(1) },
    1
  )
  const deleted = reduceMobileStructuredChatCheckpoint(
    base,
    {
      type: 'event',
      event: {
        type: 'batch',
        sessionId: 's',
        batch: {
          cursor: { epoch: 'e', sequence: 2 },
          items: [],
          removedItemIds: ['m'],
          submissions: []
        }
      }
    },
    2
  )
  const revived = reduceMobileStructuredChatCheckpoint(
    deleted,
    {
      type: 'event',
      event: {
        type: 'batch',
        sessionId: 's',
        batch: {
          cursor: { epoch: 'e', sequence: 4 },
          items: page(1, 3).items,
          removedItemIds: [],
          submissions: []
        }
      }
    },
    4
  )
  const refreshed = reduceMobileStructuredChatCheckpoint(
    deleted,
    { type: 'history-page', page: { ...page(1, 3), liveCursor: { epoch: 'e', sequence: 4 } } },
    4
  )
  expect(refreshed.items[0]?.revision).toBe(3)
  expect(revived.items[0]?.revision).toBe(3)
  const lateDelete = reduceMobileStructuredChatCheckpoint(
    revived,
    {
      type: 'event',
      event: {
        type: 'batch',
        sessionId: 's',
        batch: {
          cursor: { epoch: 'e', sequence: 2 },
          items: [],
          removedItemIds: ['m'],
          submissions: []
        }
      }
    },
    5
  )
  expect(lateDelete.items[0]?.revision).toBe(3)
})

it('does not carry row revisions or write authority across a journal epoch change', () => {
  const old = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'old',
    fence: 9,
    cursor: { epoch: 'old', sequence: 8 },
    items: page(1, 7).items
  }
  const next = reduceMobileStructuredChatCheckpoint(
    old,
    { type: 'history-page', page: page(1, 1) },
    1
  )
  expect(next.items[0]?.revision).toBe(1)
  expect(next.fence).toBeNull()
})

it('does not roll an accepted send back to pending from a late read or replay batch', () => {
  const accepted = acceptedSubmission('send')
  const pending = { ...accepted, dispatchState: 'pending' as const, resolvedAt: null }
  const state = {
    ...EMPTY_STRUCTURED_AGENT_SESSION,
    epoch: 'e',
    cursor: { epoch: 'e', sequence: 5 },
    items: page(1).items,
    submissions: [accepted]
  }
  const read = reduceMobileStructuredChatCheckpoint(
    state,
    { type: 'history-page', page: { ...page(1), submissions: [pending] } },
    5
  )
  expect(read.submissions[0]?.dispatchState).toBe('accepted')
  const replay = reduceMobileStructuredChatCheckpoint(
    state,
    {
      type: 'event',
      event: {
        type: 'batch',
        sessionId: 's',
        batch: {
          cursor: { epoch: 'e', sequence: 1 },
          items: [],
          removedItemIds: [],
          submissions: [pending]
        }
      }
    },
    6
  )
  expect(replay.submissions[0]?.dispatchState).toBe('accepted')
})
