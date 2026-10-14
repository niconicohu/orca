import { expect, it } from 'vitest'
import { createChatCheckpointStore } from '../cache/mobile-chat-checkpoint-store'
import { createNativeChatMerger } from '../../../src/shared/native-chat-merge'
import { EMPTY_STRUCTURED_AGENT_SESSION } from '../../../src/shared/structured-agent-session-reducer'
import { applyMobileNativeChatStreamFrame } from './mobile-native-chat-stream-frame'
import { reduceMobileStructuredChatCheckpoint } from './mobile-structured-chat-checkpoint'
import { validNativeChatRead, validStructuredChatRead } from './mobile-chat-persisted-transcript'

it('introduces and clears new checkpoints without migrating or deleting existing user storage', async () => {
  const previous = new Map([
    ['orca:hosts', '[{"id":"existing-host"}]'],
    ['orca:terminalTextScale', '1.2'],
    ['orca:mobileWebShellEnabled', 'false'],
    ['orca:mobileStructuredSendOperations:v1', '{"pending":"retain"}']
  ])
  const data = new Map(previous)
  const store = createChatCheckpointStore({
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value)
    },
    removeItem: async (key) => {
      data.delete(key)
    },
    getAllKeys: async () => [...data.keys()]
  })
  const address = { scope: 'paired', namespace: 'native-chat', key: 'session' }
  expect(await store.read(address)).toBeNull()
  await store.write({ ...address, hostId: 'existing-host', value: 'history', at: Date.now() })
  await store.removeWhere(() => true)
  for (const [key, value] of previous) {
    expect(data.get(key)).toBe(value)
  }
})
it('accepts legacy native snapshots without optional cursor or pending fields', () => {
  const merger = createNativeChatMerger()
  const result = applyMobileNativeChatStreamFrame({
    merger,
    limit: 40,
    replaceSnapshot: true,
    frame: {
      type: 'snapshot',
      messages: [
        {
          id: 'old-host',
          role: 'assistant',
          timestamp: null,
          source: 'transcript',
          blocks: [{ type: 'text', text: 'legacy transcript' }]
        }
      ]
    }
  })
  expect(result.kind).toBe('messages')
  expect(merger.list[0]?.id).toBe('old-host')
})
it('accepts a legacy history page without granting cached write authority', () => {
  const cursor = { epoch: 'old-host', sequence: 1 }
  const state = reduceMobileStructuredChatCheckpoint(
    EMPTY_STRUCTURED_AGENT_SESSION,
    {
      type: 'history-page',
      page: {
        sessionId: 'session',
        epoch: 'old-host',
        direction: 'tail',
        items: [],
        submissions: [],
        removedItemIds: [],
        hasOlder: false,
        hasNewer: false,
        window: { oldest: null, newest: null, nextCursor: cursor }
      }
    },
    0
  )
  expect(state.cursor).toEqual(cursor)
  expect(state.fence).toBeNull()
  expect(state.status).toBe('ready')
})
it('treats unreadable cache schemas as misses instead of requiring user storage resets', () => {
  expect(validNativeChatRead({ version: 999, messages: 'new-format' })).toBe(false)
  expect(validStructuredChatRead({ version: 999, items: null })).toBe(false)
})
