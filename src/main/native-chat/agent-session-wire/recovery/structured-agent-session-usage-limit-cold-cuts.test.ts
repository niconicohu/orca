import { expect, it } from 'vitest'
import { UsageLimitColdCuts } from './structured-agent-session-usage-limit-cold-cuts'
import type { HostUsageLimitCut } from './structured-agent-session-usage-limit-chain'

it('keeps a pending saved cut out of live state and discards it when the chat is reopened', async () => {
  let complete!: (cut: HostUsageLimitCut) => void
  const saved = new Promise<HostUsageLimitCut>((resolve) => {
    complete = resolve
  })
  const sessions = new Map<string, unknown>()
  const cuts = new UsageLimitColdCuts({
    sessions,
    logger: { warn: () => {}, error: () => {} },
    savedCuts: {
      read: (id) =>
        id === 'saved-chat'
          ? Promise.resolve({
              turnItemId: 'saved-turn',
              resetsAt: 2_000,
              turnEndedAt: 1_500,
              chain: 0
            })
          : saved
    },
    readLoadedCut: () => null
  })
  await cuts.readUnread(['saved-chat'])
  expect(cuts.read('saved-chat')).toEqual({
    turnItemId: 'saved-turn',
    resetsAt: 2_000,
    turnEndedAt: 1_500,
    chain: 0
  })
  const sweep = cuts.readUnread(['chat'])
  expect(cuts.read('chat')).toBeNull()
  sessions.set('chat', {})
  cuts.forget('chat')
  complete({ turnItemId: 'old-turn', resetsAt: 1_000, turnEndedAt: 500, chain: 0 })
  await sweep
  sessions.delete('chat')
  expect(cuts.read('chat')).toBeNull()
})
