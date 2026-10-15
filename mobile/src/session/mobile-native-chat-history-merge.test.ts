import { expect, it } from 'vitest'
import { mergeMobileOlderTranscript } from './mobile-native-chat-history-merge'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
const message = (id: string, text = id): NativeChatMessage => ({
  id,
  role: 'assistant',
  source: 'transcript',
  timestamp: 1,
  blocks: [{ type: 'text', text }]
})
it('deduplicates cursor overlap, refreshes unchanged cached rows and preserves concurrent edits', () => {
  const a = message('a'),
    b = message('b')
  const edited = message('b', 'live edit'),
    refreshed = message('a', 'remote edit')
  const merged = mergeMobileOlderTranscript(
    [message('older'), refreshed, message('b', 'stale')],
    [a, edited, message('live')],
    new Map([
      ['a', a],
      ['b', b]
    ])
  )
  expect(merged).toEqual([message('older'), refreshed, edited, message('live')])
})
