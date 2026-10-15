import { expect, it } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { Tab } from '../../../../shared/tab-types'
import { applyGeneratedTabTitleUpdates } from './terminal-tab-title-batch'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import { deriveGeneratedTabTitle } from '../../../../shared/agent-tab-title'
const request = {
  paneKey: structuredAgentSessionPaneKey('chat-tab', 'session'),
  prompt: 'Please fix chat history display'
}
function state(overrides: Partial<Tab> = {}) {
  const tab: Tab = {
    id: 'chat-tab',
    entityId: 'session',
    worktreeId: 'w',
    groupId: 'g',
    contentType: 'agent-session',
    agentSessionAgent: 'codex',
    label: 'Codex Chat',
    customLabel: null,
    color: null,
    createdAt: 1,
    sortOrder: 0,
    ...overrides
  }
  return {
    activeWorktreeId: 'w',
    sortEpoch: 0,
    settings: { ...getDefaultSettings('/tmp'), tabAutoGenerateTitle: true },
    tabsByWorktree: {},
    unifiedTabsByWorktree: { w: [tab] }
  }
}
it('generates structured titles without a terminal-owner entry', () => {
  const result = applyGeneratedTabTitleUpdates(state(), [request])
  expect(result.patch?.unifiedTabsByWorktree?.w[0].generatedLabel).toBe(
    deriveGeneratedTabTitle(request.prompt)
  )
  expect(result.runtimeGraphChanged).toBe(true)
})
it.each([
  { customLabel: 'My name' },
  { generatedLabel: 'Existing generated title' },
  { label: 'Provider named conversation' },
  { quickCommandLabel: 'Command label' }
])('preserves existing title precedence %j', (override) => {
  expect(applyGeneratedTabTitleUpdates(state(override), [request]).patch).toBeNull()
})
it('honors the automatic title setting', () => {
  const s = state()
  s.settings.tabAutoGenerateTitle = false
  expect(applyGeneratedTabTitleUpdates(s, [request]).patch).toBeNull()
})
it('keeps the first title within one status batch', () => {
  const result = applyGeneratedTabTitleUpdates(state(), [
    request,
    { ...request, prompt: 'A later question' }
  ])
  expect(result.patch?.unifiedTabsByWorktree?.w[0].generatedLabel).toBe(
    deriveGeneratedTabTitle(request.prompt)
  )
})
