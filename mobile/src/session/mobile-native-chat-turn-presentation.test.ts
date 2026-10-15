import { expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { mobileNativeChatTurnPresentation } from './mobile-native-chat-turn-presentation'
const message = (
  id: string,
  role: NativeChatMessage['role'],
  blocks: NativeChatMessage['blocks']
): NativeChatMessage => ({ id, role, blocks, timestamp: null, source: 'transcript' })
const user = message('u', 'user', [{ type: 'text', text: 'Request' }])
const progress = message('p', 'assistant', [{ type: 'text', text: 'Checking' }])
const tool = message('t', 'assistant', [
  { type: 'tool-call', name: 'Read', input: {}, state: 'completed' }
])
const answer = message('a', 'assistant', [{ type: 'text', text: 'Final answer' }])
const history = [user, progress, tool, answer]
it('keeps the prompt and final answer with an accessible disclosure anchor on completed turns', () => {
  const result = mobileNativeChatTurnPresentation(history, null, new Set())
  expect(result.visibleMessages.map((m) => m.id)).toEqual(['u', 'a'])
  expect(result.rows.get('u')).toMatchObject({ anchor: true, hasDetails: true })
})
it('reveals intermediate prose and tools while the turn is running', () => {
  expect(mobileNativeChatTurnPresentation(history, 'u', new Set()).visibleMessages).toEqual(history)
})
it('reveals the entire settled process when its disclosure is opened', () => {
  expect(mobileNativeChatTurnPresentation(history, null, new Set(['u'])).visibleMessages).toEqual(
    history
  )
})
it('keeps an orphaned page expandable even when its prompt was not loaded', () => {
  const result = mobileNativeChatTurnPresentation([tool, progress, answer], null, new Set())
  expect(result.visibleMessages.map((m) => m.id)).toEqual(['t', 'a'])
  expect(result.rows.get('t')).toMatchObject({
    turnKey: '__unanchored__',
    anchor: true,
    hasDetails: true,
    activityHidden: true
  })
})
it('never collapses an orphaned live page', () => {
  expect(
    mobileNativeChatTurnPresentation([tool, answer], '__unanchored__', new Set()).visibleMessages
  ).toEqual([tool, answer])
})
it('retains the compaction boundary when a completed turn is collapsed', () => {
  const marker = message('compact', 'system', [
    { type: 'text', text: 'Context compacted', presentation: 'compaction' }
  ])
  const result = mobileNativeChatTurnPresentation([user, marker, answer], null, new Set())
  expect(result.visibleMessages).toEqual([user, marker, answer])
  expect(result.rows.get('u')?.hasDetails).toBe(false)
})
