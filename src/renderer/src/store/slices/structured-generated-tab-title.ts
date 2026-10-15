import { deriveGeneratedTabTitle } from '../../../../shared/agent-tab-title'
import { defaultAgentChatLabel } from '../../../../shared/agent-session-chat-label'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { AppState } from '../types'
import type { GeneratedTabTitleUpdate } from './terminal-tab-title-batch'

const indexedTabs = new WeakMap<
  AppState['unifiedTabsByWorktree'],
  Map<string, AppState['unifiedTabsByWorktree'][string][number]>
>()

/** Structured tabs have no terminal-owner entry; retain the same title precedence. */
export function structuredGeneratedTabTitles(
  state: Pick<AppState, 'unifiedTabsByWorktree'>,
  updates: readonly GeneratedTabTitleUpdate[]
): AppState['unifiedTabsByWorktree'] | null {
  let byId = indexedTabs.get(state.unifiedTabsByWorktree)
  if (!byId) {
    byId = new Map(
      Object.values(state.unifiedTabsByWorktree)
        .flat()
        .filter((tab) => tab.contentType === 'agent-session')
        .map((tab) => [tab.id, tab])
    )
    indexedTabs.set(state.unifiedTabsByWorktree, byId)
  }
  const changed = new Map<string, AppState['unifiedTabsByWorktree'][string][number]>()
  let next: AppState['unifiedTabsByWorktree'] | null = null
  for (const update of updates) {
    const id = parsePaneKey(update.paneKey)?.tabId
    const tab = id ? (changed.get(id) ?? byId.get(id)) : undefined
    if (
      !tab ||
      tab.customLabel?.trim() ||
      tab.quickCommandLabel?.trim() ||
      (tab.generatedLabel?.trim() && !update.options?.replaceExistingGeneratedTitle) ||
      tab.label !== defaultAgentChatLabel(tab.agentSessionAgent)
    ) {
      continue
    }
    const title = deriveGeneratedTabTitle(update.prompt)
    if (!title || title === tab.generatedLabel) {
      continue
    }
    next ??= { ...state.unifiedTabsByWorktree }
    next[tab.worktreeId] = (next[tab.worktreeId] ?? []).map((candidate) =>
      candidate.id === id ? { ...candidate, generatedLabel: title } : candidate
    )
    changed.set(tab.id, { ...tab, generatedLabel: title })
  }
  return next
}
