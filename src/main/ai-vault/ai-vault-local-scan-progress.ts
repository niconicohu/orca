import type { AiVaultScanProgress, AiVaultScanWork } from '../../shared/ai-vault-scan-progress'
import {
  AiVaultServiceDeadlineError,
  type AiVaultServiceScanListener
} from './session-scanner-service-request-deadline'

type Listener = (progress: AiVaultScanProgress | null) => void

/** One scan request's progress, from the moment the scanner process receives it. */
type LocalAiVaultScanProgressHandle = AiVaultServiceScanListener & {
  finish: (work: AiVaultScanWork | null) => void
  /** The no-progress deadline ended it. */
  stop: () => void
  /** Cancelled or failed for another reason: the last settled scan is what stands. */
  abandon: () => void
}

let latest: AiVaultScanProgress | null = null
let lastSettled: AiVaultScanProgress | null = null
let running: LocalAiVaultScanProgressHandle | null = null
// Requests not yet settled, counted so a cancelled scan never flashes the old state
// while the scan that replaced it waits for the scanner process.
let unsettledRequests = 0
const listeners = new Set<Listener>()

/** This computer's running scan, else the last one that finished or stopped. */
export function localAiVaultScanProgress(): AiVaultScanProgress | null {
  return latest
}

export function onLocalAiVaultScanProgress(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publish(next: AiVaultScanProgress | null): void {
  latest = next
  for (const listener of listeners) {
    listener(next)
  }
}

/**
 * Scans run one at a time in the scanner process, so the last one it received
 * is the one running; a handle that is no longer that one publishes nothing.
 */
function trackLocalAiVaultScanProgress(now: () => number): LocalAiVaultScanProgressHandle {
  let current: AiVaultScanProgress | null = null
  const settle = (next: AiVaultScanProgress): void => {
    running = null
    lastSettled = next
    publish(next)
  }
  const handle: LocalAiVaultScanProgressHandle = {
    sent: () => {
      running = handle
      current = {
        stage: 'finding',
        agents: [],
        read: { done: 0, total: 0 },
        startedAt: now(),
        settledAt: null
      }
      publish(current)
    },
    work: (work) => {
      if (running === handle && current) {
        current = { ...current, ...work }
        publish(current)
      }
    },
    finish: (work) => {
      if (running === handle && current) {
        settle({ ...current, ...work, stage: 'finished', settledAt: now() })
      }
    },
    stop: () => {
      if (running === handle && current) {
        settle({ ...current, stage: 'stopped', settledAt: now() })
      }
    },
    abandon: () => {
      if (running === handle) {
        running = null
      }
      if (running === null && unsettledRequests === 0) {
        publish(lastSettled)
      }
    }
  }
  return handle
}

/** Runs one scan request through the scanner process, publishing its progress until it settles. */
export async function requestLocalAiVaultScan<T extends { work: AiVaultScanWork | null }>(
  request: (listener: AiVaultServiceScanListener) => Promise<T>,
  now: () => number = Date.now
): Promise<T> {
  const progress = trackLocalAiVaultScanProgress(now)
  let value: T
  unsettledRequests++
  try {
    value = await request(progress)
  } catch (error) {
    unsettledRequests--
    if (error instanceof AiVaultServiceDeadlineError) {
      progress.stop()
    } else {
      progress.abandon()
    }
    throw error
  }
  unsettledRequests--
  progress.finish(value.work)
  return value
}

export function resetLocalAiVaultScanProgressForTests(): void {
  latest = null
  lastSettled = null
  running = null
  unsettledRequests = 0
  listeners.clear()
}
