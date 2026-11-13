import type { HostUsageLimitCut } from './structured-agent-session-usage-limit-chain'
import type { StructuredAgentSessionHostDeps as HostDeps } from '../host/structured-agent-session-host-types'
import type { SavedUsageLimitCuts } from './usage-limit-cut-worker-protocol'

type Deps = {
  logger: HostDeps['logger']
  sessions: ReadonlyMap<string, unknown>
  savedCuts: Pick<SavedUsageLimitCuts, 'read'>
  readLoadedCut: (id: string) => HostUsageLimitCut | null
}

/** The cuts of chats that aren't loaded, read from history a few per pass. */
export class UsageLimitColdCuts {
  private readonly cuts = new Map<string, HostUsageLimitCut | null>()
  private readonly pending = new Map<string, Promise<HostUsageLimitCut | null>>()
  /** Pass of each chat's last failed history read; failed reads wait behind unread chats. */
  private readonly failures = new Map<string, number>()
  private passes = 0

  constructor(private readonly deps: Deps) {}

  get size(): number {
    return this.cuts.size + this.failures.size
  }

  has(id: string): boolean {
    return this.cuts.has(id)
  }

  read(id: string): HostUsageLimitCut | null {
    if (this.deps.sessions.has(id)) {
      this.cuts.delete(id)
      return this.deps.readLoadedCut(id)
    }
    return this.cuts.get(id) ?? null
  }

  async load(id: string): Promise<HostUsageLimitCut | null> {
    if (this.deps.sessions.has(id) || this.cuts.has(id)) {
      return this.read(id)
    }
    let pending = this.pending.get(id)
    if (!pending) {
      pending = Promise.resolve()
        .then(() => this.deps.savedCuts.read(id))
        .then((cut) => {
          if (this.pending.get(id) === pending && !this.deps.sessions.has(id)) {
            this.cuts.set(id, cut)
          }
          return this.read(id)
        })
        .catch((error) => {
          if (this.pending.get(id) !== pending) {
            return this.read(id)
          }
          throw error
        })
        .finally(() => {
          if (this.pending.get(id) === pending) {
            this.pending.delete(id)
          }
        })
      this.pending.set(id, pending)
    }
    return pending
  }

  /** At most three history reads per pass; a read that throws stays retryable without starving others. */
  async readUnread(visible: readonly string[]): Promise<void> {
    const pass = ++this.passes
    const unread = visible.filter((id) => !this.deps.sessions.has(id) && !this.cuts.has(id))
    unread.sort((a, b) => (this.failures.get(a) ?? 0) - (this.failures.get(b) ?? 0))
    for (const id of unread.slice(0, 3)) {
      try {
        await this.load(id)
        this.failures.delete(id)
      } catch (error) {
        if (!this.failures.has(id)) {
          this.deps.logger.warn('usage-limit continue could not read a chat', {
            scope: 'usage-limit-continue',
            sessionId: id,
            error
          })
        }
        this.failures.set(id, pass)
      }
    }
  }

  retain(shown: ReadonlySet<string>): void {
    for (const cache of [this.cuts, this.failures, this.pending]) {
      for (const id of cache.keys()) {
        if (!shown.has(id)) {
          cache.delete(id)
        }
      }
    }
  }

  forget(id: string): void {
    this.cuts.delete(id)
    this.failures.delete(id)
    this.pending.delete(id)
  }

  clear(): void {
    this.cuts.clear()
    this.failures.clear()
    this.pending.clear()
  }
}
