import { describe, expect, it, vi } from 'vitest'
import { createAgentLaunchFeedbackStore } from './agent-launch-feedback'

describe('client-local launch feedback', () => {
  it('appears before host admission and settles without inventing a session', () => {
    const store = createAgentLaunchFeedbackStore()
    const changed = vi.fn()
    const unsubscribe = store.subscribe(changed)
    store.begin('workspace/group', 'request', 'Codex', 'previous-tab')
    expect(store.read('workspace/group')).toEqual({
      entries: [{ id: 'request', title: 'Codex' }],
      selectedId: 'request',
      selectionMarker: 'previous-tab'
    })
    store.fail('workspace/group', 'request', 'Host unavailable')
    expect(store.read('workspace/group').entries[0]?.error).toBe('Host unavailable')
    store.remove('workspace/group', 'request')
    store.fail('workspace/group', 'request', 'Late failure')
    expect(store.read('workspace/group').entries).toEqual([])
    expect(changed).toHaveBeenCalledTimes(3)
    unsubscribe()
  })

  it('keeps a newer launch selected when an older request completes', () => {
    const store = createAgentLaunchFeedbackStore()
    store.begin('scope', 'old', 'Codex', 'a')
    store.begin('scope', 'new', 'Claude', 'a')
    store.remove('scope', 'old')
    expect(store.read('scope').selectedId).toBe('new')
    store.select('scope', null)
    store.fail('scope', 'new', 'Timeout')
    expect(store.read('scope').selectedId).toBeNull()
    store.select('scope', 'absent', 'b')
    expect(store.read('scope').selectedId).toBeNull()
  })

  it('bounds abandoned workspaces and requests', () => {
    const store = createAgentLaunchFeedbackStore()
    for (let index = 0; index < 100; index += 1) {
      store.begin('one', String(index), 'Codex')
      store.begin(String(index), 'request', 'Codex')
    }
    expect(store.read('one').entries).toHaveLength(8)
    expect(store.read('one').entries[0]?.id).toBe('92')
    expect(store.read('0').entries).toHaveLength(0)
    expect(store.read('99').entries).toHaveLength(1)
  })
})
