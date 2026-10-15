import { useEffect, useSyncExternalStore } from 'react'
import { createAgentLaunchFeedbackStore } from '../../../src/shared/agent-launch-feedback'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileSessionTab } from './mobile-session-route-types'
import {
  launchedSelection,
  resolveLaunchedSelection,
  type LaunchedSurface
} from './pending-session-selection'

export const mobileAgentLaunchFeedback = createAgentLaunchFeedbackStore()
const clients = new WeakMap<object, number>()
let nextClient = 0
const surfaces = new Map<string, Partial<LaunchedSurface>>()
export function mobileAgentLaunchFeedbackScope(
  client: RpcClient | null,
  worktreeId: string
): string {
  if (!client) {
    return ''
  }
  let identity = clients.get(client)
  if (identity === undefined) {
    identity = ++nextClient
    clients.set(client, identity)
  }
  return JSON.stringify([identity, worktreeId])
}
export function bindMobileAgentLaunchFeedback(
  client: RpcClient,
  worktreeId: string,
  id: string,
  surface: Partial<LaunchedSurface>
) {
  const scope = mobileAgentLaunchFeedbackScope(client, worktreeId)
  surfaces.set(JSON.stringify([scope, id]), surface)
  const retained = new Set(
    mobileAgentLaunchFeedback.read(scope).entries.map((entry) => JSON.stringify([scope, entry.id]))
  )
  for (const key of surfaces.keys()) {
    if (key.startsWith(JSON.stringify([scope]).slice(0, -1)) && !retained.has(key)) {
      surfaces.delete(key)
    }
  }
  while (surfaces.size > 64) {
    const oldest = surfaces.keys().next().value
    if (oldest !== undefined) {
      surfaces.delete(oldest)
    }
  }
}
export function observeMobileAgentLaunchFeedback(
  client: RpcClient,
  worktreeId: string,
  tabs: readonly MobileSessionTab[]
) {
  const scope = mobileAgentLaunchFeedbackScope(client, worktreeId)
  for (const entry of mobileAgentLaunchFeedback.read(scope).entries) {
    const key = JSON.stringify([scope, entry.id])
    const surface = surfaces.get(key)
    if (
      surface &&
      resolveLaunchedSelection(launchedSelection(entry.id, surface, null), tabs).landedTabId
    ) {
      mobileAgentLaunchFeedback.remove(scope, entry.id)
      surfaces.delete(key)
    }
  }
}
export function useMobileAgentLaunchFeedback(
  client: RpcClient | null,
  worktreeId: string,
  activeTabId: string | null
) {
  const scope = mobileAgentLaunchFeedbackScope(client, worktreeId)
  const snapshot = useSyncExternalStore(
    mobileAgentLaunchFeedback.subscribe,
    () => mobileAgentLaunchFeedback.read(scope),
    () => mobileAgentLaunchFeedback.read(scope)
  )
  useEffect(() => {
    if (snapshot.selectedId && snapshot.selectionMarker !== activeTabId) {
      mobileAgentLaunchFeedback.select(scope, null)
    }
  }, [scope, snapshot.selectedId, snapshot.selectionMarker, activeTabId])
  const selected =
    snapshot.selectionMarker === activeTabId
      ? (snapshot.entries.find((entry) => entry.id === snapshot.selectedId) ?? null)
      : null
  return { scope, ...snapshot, selected }
}
