import { expect, it } from 'vitest'
import { createMobileNativeChatReadStream } from './mobile-native-chat-read-stream'
import { applyMobileNativeChatStreamFrame } from './mobile-native-chat-stream-frame'
import { createNativeChatMerger } from '../../../src/shared/native-chat-merge'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
const message = (id: string, text: string): NativeChatMessage => ({
  id,
  role: 'assistant',
  source: 'transcript',
  timestamp: 1,
  blocks: [{ type: 'text', text }]
})
it('overlays live updates on late history without duplicate rows or stale text', () => {
  const merger = createNativeChatMerger()
  const flow = createMobileNativeChatReadStream(
    (raw) => {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test only supplies valid frames.
      applyMobileNativeChatStreamFrame({
        merger,
        frame: raw as Parameters<typeof applyMobileNativeChatStreamFrame>[0]['frame'],
        limit: 40,
        replaceSnapshot: false
      })
    },
    () => {}
  )
  flow.stream({ type: 'appended', messages: [message('a', 'new'), message('b', 'next')] })
  flow.history({ type: 'snapshot', messages: [message('a', 'old')] })
  expect(merger.list).toEqual([message('a', 'new'), message('b', 'next')])
  flow.history({ type: 'snapshot', messages: [message('a', 'stale')] })
  expect(merger.list).toHaveLength(2)
})
it('authoritative reset wins over a late history read', () => {
  const frames: unknown[] = []
  const flow = createMobileNativeChatReadStream(
    (frame) => frames.push(frame),
    () => {}
  )
  flow.stream({ type: 'replacement', messages: [] })
  flow.history({ type: 'snapshot', messages: [message('deleted', 'old')] })
  expect(frames).toEqual([{ type: 'replacement', messages: [] }])
})
