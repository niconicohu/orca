import type { AiVaultAgent } from '../../shared/ai-vault-types'
import type { AiVaultScanWork } from '../../shared/ai-vault-scan-progress'
import { AiVaultScanTally } from './ai-vault-scan-tally'

// Why: the parent's scan deadline is a no-progress window, so the child has to
// say when a scan's work advanced. Keyed by the request's cancel signal, which
// every work site already receives, so the index loop or an interactive read
// running through the same readers can never extend a scan's deadline.
const reporters = new WeakMap<AbortSignal, { note: () => void; tally: AiVaultScanTally }>()

// Rate-limited because a cold scan consumes thousands of chunks and stats, and
// the parent only reads the counter as "still moving" inside a 130 s window.
export const AI_VAULT_SCAN_PROGRESS_INTERVAL_MS = 1_000

/**
 * Reports advancing work for the scan that owns `signal`, at most once per
 * interval and only when the counter moved, until the returned stop is called.
 * Each report carries what the scan has found and read so far.
 */
export function trackAiVaultScanProgress(
  signal: AbortSignal,
  report: (units: number, work: AiVaultScanWork) => void,
  now: () => number = () => performance.now()
): () => void {
  let units = 0
  let lastReportedAt = Number.NEGATIVE_INFINITY
  const tally = new AiVaultScanTally()
  reporters.set(signal, {
    tally,
    note: () => {
      units++
      const at = now()
      if (at - lastReportedAt < AI_VAULT_SCAN_PROGRESS_INTERVAL_MS) {
        return
      }
      lastReportedAt = at
      report(units, tally.snapshot())
    }
  })
  return () => {
    reporters.delete(signal)
  }
}

/** Counts one unit of real work for the scan that owns `signal`; a no-op for any other work. */
export function noteAiVaultScanProgress(signal: AbortSignal | undefined): void {
  if (signal) {
    reporters.get(signal)?.note()
  }
}

function tallyFor(signal: AbortSignal | undefined): AiVaultScanTally | undefined {
  return signal ? reporters.get(signal)?.tally : undefined
}

/** What the scan owning `signal` has found and read; null for untracked work. */
export function aiVaultScanWork(signal: AbortSignal | undefined): AiVaultScanWork | null {
  return tallyFor(signal)?.snapshot() ?? null
}

/** Marks one of an agent's folders or databases as being listed until the returned close. */
export function openAiVaultScanSource(
  signal: AbortSignal | undefined,
  agent: AiVaultAgent
): () => void {
  return tallyFor(signal)?.openSource(agent) ?? (() => undefined)
}

export function noteAiVaultScanFileFound(
  signal: AbortSignal | undefined,
  agent: AiVaultAgent,
  file: { path: string; dev?: number; ino?: number }
): void {
  tallyFor(signal)?.addFile(agent, file)
}

export function noteAiVaultScanDatabases(
  signal: AbortSignal | undefined,
  agent: AiVaultAgent,
  count: number
): void {
  tallyFor(signal)?.addDatabases(agent, count)
}

/** Discovery is over: the scan now reads `total` more transcripts. */
export function noteAiVaultScanReading(signal: AbortSignal | undefined, total: number): void {
  tallyFor(signal)?.startReading(total)
}

export function noteAiVaultScanFilesRead(signal: AbortSignal | undefined, count: number): void {
  tallyFor(signal)?.addRead(count)
}
