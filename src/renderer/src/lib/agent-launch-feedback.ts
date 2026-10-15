import { useEffect, useSyncExternalStore } from 'react'
import { createAgentLaunchFeedbackStore } from '../../../shared/agent-launch-feedback'
import type { TuiAgent } from '../../../shared/tui-agent'
import { TUI_AGENT_DISPLAY_NAMES } from '../../../shared/tui-agent-display-names'
import { useAppStore } from '@/store'

export const desktopAgentLaunchFeedback = createAgentLaunchFeedbackStore()
export function desktopAgentLaunchFeedbackScope(worktreeId: string, groupId: string): string {
  return JSON.stringify([worktreeId, groupId])
}
export function beginDesktopAgentLaunchFeedback(args: {
  worktreeId: string
  groupId?: string
  id: string
  agent: TuiAgent
  activate?: boolean
}) {
  const state = useAppStore.getState()
  const groupId = args.groupId ?? state.activeGroupIdByWorktree[args.worktreeId] ?? args.worktreeId
  const marker =
    state.groupsByWorktree[args.worktreeId]?.find((group) => group.id === groupId)?.activeTabId ??
    null
  const scope = desktopAgentLaunchFeedbackScope(args.worktreeId, groupId)
  desktopAgentLaunchFeedback.begin(scope, args.id, TUI_AGENT_DISPLAY_NAMES[args.agent], marker)
  if (args.activate === false) {
    desktopAgentLaunchFeedback.select(scope, null)
  }
  return {
    shouldActivate: () => {
      const latest = useAppStore.getState()
      const currentMarker =
        latest.groupsByWorktree[args.worktreeId]?.find((group) => group.id === groupId)
          ?.activeTabId ?? null
      return (
        desktopAgentLaunchFeedback.read(scope).selectedId === args.id &&
        latest.activeWorktreeId === state.activeWorktreeId &&
        latest.activeGroupIdByWorktree[args.worktreeId] ===
          state.activeGroupIdByWorktree[args.worktreeId] &&
        currentMarker === marker
      )
    },
    complete: () => desktopAgentLaunchFeedback.remove(scope, args.id),
    fail: (error: unknown) =>
      desktopAgentLaunchFeedback.fail(
        scope,
        args.id,
        error instanceof Error ? error.message : String(error)
      )
  }
}
export function useDesktopAgentLaunchFeedback(worktreeId: string, groupId: string) {
  const scope = desktopAgentLaunchFeedbackScope(worktreeId, groupId)
  const marker = useAppStore(
    (state) =>
      state.groupsByWorktree[worktreeId]?.find((group) => group.id === groupId)?.activeTabId ?? null
  )
  const snapshot = useSyncExternalStore(
    desktopAgentLaunchFeedback.subscribe,
    () => desktopAgentLaunchFeedback.read(scope),
    () => desktopAgentLaunchFeedback.read(scope)
  )
  useEffect(() => {
    if (snapshot.selectedId && snapshot.selectionMarker !== marker) {
      desktopAgentLaunchFeedback.select(scope, null)
    }
  }, [scope, snapshot.selectedId, snapshot.selectionMarker, marker])
  const selected =
    snapshot.selectionMarker === marker
      ? (snapshot.entries.find((entry) => entry.id === snapshot.selectedId) ?? null)
      : null
  return { scope, marker, ...snapshot, selected }
}
