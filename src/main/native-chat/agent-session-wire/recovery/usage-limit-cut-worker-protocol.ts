import type { HostUsageLimitCut } from './structured-agent-session-usage-limit-chain'

export type UsageLimitCutWorkerRequest = { id: number; path: string; sessionId: string }
export type UsageLimitCutWorkerResponse =
  | { id: number; ok: true; cut: HostUsageLimitCut | null }
  | { id: number; ok: false; error: string }

export type SavedUsageLimitCuts = {
  read(sessionId: string): Promise<HostUsageLimitCut | null>
  dispose(): void
}
