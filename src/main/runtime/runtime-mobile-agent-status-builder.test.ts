import { describe, expect, it } from 'vitest'
import type { RuntimeMobileSessionTerminalTab } from '../../shared/runtime-types'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { RuntimePtyWorktreeRecord } from './runtime-terminal-state-records'
import type { RuntimeAgentRowSnapshot } from './runtime-hook-agent-row-selection'
import { buildRuntimeMobileAgentStatus } from './runtime-mobile-agent-status-builder'

const PROVIDER_SESSION = { key: 'session_id' as const, id: 'session-1' }
const TAB: RuntimeMobileSessionTerminalTab = {
  type: 'terminal',
  id: 'tab::leaf',
  parentTabId: 'tab',
  leafId: 'leaf',
  title: 'Terminal',
  isActive: true
}

describe('mobile agent status builder', () => {
  function projectCompletedCodex(title: string, receivedAt = Date.now() - 1000) {
    const pty = {
      ptyId: 'pty-codex',
      worktreeId: 'workspace',
      launchAgent: 'codex',
      foregroundAgent: 'codex',
      title,
      titleUpdatedAt: receivedAt + 100,
      lastOscTitle: title,
      lastOscTitleAt: receivedAt + 100,
      lastOscTitleEpochMs: receivedAt + 100,
      lastAgentStatus: 'idle',
      lastAgentStatusStartedAtEpochMs: receivedAt + 100,
      lastAgentStatusRichInvalidatedAtEpochMs: null
    } as RuntimePtyWorktreeRecord
    const rows: AgentStatusIpcPayload[] = [
      {
        paneKey: 'tab:leaf',
        tabId: 'tab',
        connectionId: null,
        worktreeId: 'workspace',
        state: 'done',
        prompt: '',
        agentType: 'codex',
        model: 'gpt-6.1-sol',
        receivedAt,
        stateStartedAt: receivedAt,
        providerSession: PROVIDER_SESSION
      }
    ]
    return buildRuntimeMobileAgentStatus(
      pty,
      { ...TAB, title, launchAgent: 'codex' },
      'term-codex',
      null,
      () => rows,
      { getPaneKey: () => 'tab:leaf', getLeaf: () => null, getTrackedTitle: () => null }
    )
  }

  it('keeps transcript identity and the reported model after the Codex title is renamed', () => {
    expect(projectCompletedCodex('回应问候 | project')).toMatchObject({
      agentStatus: {
        state: 'done',
        agentType: 'codex',
        providerSession: PROVIDER_SESSION,
        model: 'gpt-6.1-sol'
      }
    })
  })

  it('still suppresses completed agent status when the shell reclaimed the pane', () => {
    expect(projectCompletedCodex('zsh')).toEqual({})
  })

  it('does not turn stale identity evidence into a reported model or live state', () => {
    expect(projectCompletedCodex('回应问候 | project', Date.now() - 3_600_000)).toMatchObject({
      agentStatus: { state: 'done', providerSession: PROVIDER_SESSION }
    })
    expect(projectCompletedCodex('回应问候 | project', Date.now() - 3_600_000)).not.toHaveProperty(
      'agentStatus.model'
    )
  })

  it('keeps provider-session identity from a terminal-handle row rejoin', () => {
    const retained: RuntimeAgentRowSnapshot = {
      paneKey: 'old-tab:old-leaf',
      connectionId: null,
      payload: { state: 'working', prompt: 'ship it', agentType: 'codex' },
      stateStartedAt: 10,
      updatedAt: 10,
      providerSession: PROVIDER_SESSION
    }

    const result = buildRuntimeMobileAgentStatus(null, TAB, 'term-1', retained, () => [], {
      getPaneKey: () => 'new-tab:new-leaf',
      getLeaf: () => null,
      getTrackedTitle: () => null
    })

    expect(result).toEqual(
      expect.objectContaining({
        agentStatus: expect.objectContaining({ providerSession: PROVIDER_SESSION })
      })
    )
  })
})
