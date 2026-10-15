import { expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { AppState } from '../types'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import { createTerminalTabPresentationActions } from './terminal-tab-presentation'
const schedule = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/sync-runtime-graph', () => ({ scheduleRuntimeGraphSync: schedule }))
vi.mock('@/lib/pane-agent-evidence', () => ({ classifyTitleActivity: vi.fn() }))
vi.mock('@/runtime/runtime-terminal-stream', () => ({ parseRemoteRuntimePtyId: () => null }))
it('routes a structured status prompt through the real single-title store action', () => {
  let current: Partial<AppState> = {
    settings: { ...getDefaultSettings('/tmp'), tabAutoGenerateTitle: true },
    sortEpoch: 0,
    activeWorktreeId: 'w',
    tabsByWorktree: {},
    unifiedTabsByWorktree: {
      w: [
        {
          id: 'chat',
          entityId: 'session',
          groupId: 'g',
          worktreeId: 'w',
          contentType: 'agent-session',
          agentSessionAgent: 'codex',
          label: 'Codex Chat',
          customLabel: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This store-port fixture supplies every field read by the title actions under test.
  const get = () => current as AppState
  const set = (value: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => {
    current = { ...current, ...(typeof value === 'function' ? value(get()) : value) }
  }
  const actions = createTerminalTabPresentationActions(set, get)
  current = { ...current, ...actions }
  actions.setGeneratedTabTitleFromAgentPrompt(
    structuredAgentSessionPaneKey('chat', 'session'),
    'Please fix cached history'
  )
  expect(current.unifiedTabsByWorktree?.w[0].generatedLabel).toBe('Fix cached history')
  expect(schedule).toHaveBeenCalledTimes(1)
  actions.setGeneratedTabTitleFromAgentPrompt(
    structuredAgentSessionPaneKey('chat', 'session'),
    'A later message'
  )
  expect(current.unifiedTabsByWorktree?.w[0].generatedLabel).toBe('Fix cached history')
  expect(schedule).toHaveBeenCalledTimes(1)
})
