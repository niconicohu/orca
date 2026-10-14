import { useSyncExternalStore } from 'react'
import type { AiVaultScanProgress } from '../../../../shared/ai-vault-scan-progress'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostScope } from '../../../../shared/execution-host'

let progress: AiVaultScanProgress | null = null
let pushed = false
let subscribed = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

// Why: one subscription for the app's life, so a scan that settles while the
// panel is closed still shows when it reopens; main answers with where the
// scan stands for a window that opened after it started.
function ensureSubscribed(): void {
  if (subscribed) {
    return
  }
  subscribed = true
  window.api.aiVault.onScanProgress?.((next) => {
    pushed = true
    progress = next
    emit()
  })
  void window.api.aiVault
    .getScanProgress?.()
    .then((current) => {
      if (!pushed) {
        progress = current
        emit()
      }
    })
    .catch(() => undefined)
}

function subscribe(listener: () => void): () => void {
  ensureSubscribed()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * This computer's Session History scan, for a panel listing this computer.
 * Remote hosts and the all-hosts merge have no progress stream yet, so they get
 * null and keep the plain spinner, as does a client whose host never reports.
 */
export function useAiVaultScanProgress(
  executionHostScope: ExecutionHostScope
): AiVaultScanProgress | null {
  const current = useSyncExternalStore(subscribe, () => progress)
  return executionHostScope === LOCAL_EXECUTION_HOST_ID ? current : null
}

export function resetAiVaultScanProgressStoreForTests(): void {
  progress = null
  pushed = false
  subscribed = false
  listeners.clear()
}
