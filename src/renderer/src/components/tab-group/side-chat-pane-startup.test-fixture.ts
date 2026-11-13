// Boot stored partitions through real startup hydration, then compare user-visible state.

import { vi } from 'vitest'
import { getDefaultWorkspaceSession } from '../../../../shared/constants'
import {
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import type { WorkspaceSessionState } from '../../../../shared/workspace-session/workspace-session-state-types'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { fetchWorkspaceSessionWithRuntimeHostOwners } from '@/lib/workspace/persistence/workspace-session-host-hydration'
import { collectFolderWorkspaceKeysFromSession } from '@/lib/workspace/persistence/workspace-session-hydration-keys'
import type { AppState } from '../../store/types'
import type { createTestStore } from '../../store/testing/app-store-test-fixture'
import { reconcileHydratedWorkspaceTabModels } from '../../app-shell/reconcile-hydrated-workspace-tab-models'

/** One stored session partition and the host it is stored under. */
export type StoredPartition = { hostId: ExecutionHostId; session: WorkspaceSessionState }

/** First-paint local repos for referenced Git workspaces, without listings. Remote-server catalogs are skipped at startup. */
function firstPaintRepos(partitions: readonly StoredPartition[]): AppState['repos'] {
  const repos = new Map<string, AppState['repos'][number]>()
  for (const { hostId, session } of partitions) {
    const host = parseExecutionHostId(hostId)
    if (host?.kind === 'runtime') {
      continue
    }
    for (const key of Object.keys(session.tabsByWorktree)) {
      const id = getRepoIdFromWorktreeId(key)
      if (!key.startsWith(`${id}::`) || repos.has(id)) {
        continue
      }
      repos.set(id, {
        id,
        path: key.slice(id.length + 2),
        displayName: id,
        badgeColor: '#000',
        addedAt: 0,
        connectionId: host?.kind === 'ssh' ? host.targetId : null,
        executionHostId: hostId
      })
    }
  }
  return [...repos.values()]
}

/** Match use-app-startup-hydration’s call order on a fresh test store. */
export async function bootWindowFromPartitions(
  store: ReturnType<typeof createTestStore>,
  partitions: readonly StoredPartition[]
): Promise<AppState> {
  let minted = 0
  // Group and tab ids the window mints must match across the two boots being compared.
  const randomUUID = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockImplementation(() => `00000000-0000-4000-8000-${String(++minted).padStart(12, '0')}`)
  try {
    store.setState({ repos: firstPaintRepos(partitions) })
    const read = async (hostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID) =>
      structuredClone(
        partitions.find((partition) => partition.hostId === hostId)?.session ??
          getDefaultWorkspaceSession()
      )
    const hostIdsOfKind = (kind: 'ssh' | 'runtime') =>
      partitions
        .map((partition) => partition.hostId)
        .filter((hostId) => parseExecutionHostId(hostId)?.kind === kind)
    const sessionRead = await fetchWorkspaceSessionWithRuntimeHostOwners(
      { get: read, listHostIds: async () => hostIdsOfKind('ssh') },
      store.getState().repos,
      hostIdsOfKind('runtime')
    )
    const actions = store.getState()
    const options = {
      additionalValidWorkspaceKeys: collectFolderWorkspaceKeysFromSession(sessionRead.session)
    }
    actions.hydrateWorkspaceSession(sessionRead.session, {
      ...options,
      runtimeHostIdByWorkspaceSessionKey: sessionRead.runtimeHostIdByWorkspaceSessionKey,
      contestedHostWorkspaceSessions: sessionRead.contestedHostWorkspaceSessions,
      contestedPrimaryHostBySessionKey: sessionRead.contestedPrimaryHostBySessionKey,
      hydratedRuntimeSessionHostIds: sessionRead.hydratedRuntimeSessionHostIds
    })
    actions.hydrateTabsSession(sessionRead.session, options)
    actions.hydrateEditorSession(sessionRead.session, options)
    actions.hydrateBrowserSession(sessionRead.session, options)
    reconcileHydratedWorkspaceTabModels(
      sessionRead.session,
      store.getState().reconcileWorktreeTabModels
    )
    return store.getState()
  } finally {
    randomUUID.mockRestore()
  }
}
