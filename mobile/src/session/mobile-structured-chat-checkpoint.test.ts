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
