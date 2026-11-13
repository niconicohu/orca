import { spawnWorkerThread } from '../../../worker-threads/worker-thread-spawn'
import {
  currentWorkerEntryLayout,
  resolveWorkerThreadEntryPath
} from '../../../worker-threads/worker-thread-entry-path'
import { WorkerThreadRequestQueue } from '../../../worker-threads/worker-thread-request-queue'
import type {
  SavedUsageLimitCuts,
  UsageLimitCutWorkerRequest,
  UsageLimitCutWorkerResponse
} from './usage-limit-cut-worker-protocol'

export class UsageLimitCutWorkerClient implements SavedUsageLimitCuts {
  private readonly queue = new WorkerThreadRequestQueue<
    UsageLimitCutWorkerRequest,
    UsageLimitCutWorkerResponse
  >({
    factory: () =>
      spawnWorkerThread(
        resolveWorkerThreadEntryPath(
          currentWorkerEntryLayout(__dirname),
          'usage-limit-cut-worker-entry.js'
        )
      ),
    idleTeardownMs: 60_000,
    maxConsecutiveDeaths: 2,
    awaitRetirement: true,
    createUnavailableError: (message) => new Error(message),
    describeTimeout: (ms) => `Usage limit journal reader timed out after ${ms}ms`,
    describeExit: (code) => `Usage limit journal reader exited with code ${code}`,
    describeCrashLoop: (error) => `Usage limit journal reader crashed repeatedly (${error})`,
    onUnavailable: (error) =>
      console.warn('[usage-limit-continue] journal reader unavailable:', error)
  })

  constructor(private readonly path: string) {}

  async read(sessionId: string) {
    const response = await this.queue.dispatch((id) => ({ id, path: this.path, sessionId }), 30_000)
    if (!response.ok) {
      throw new Error(response.error)
    }
    return response.cut
  }

  dispose(): void {
    this.queue.dispose()
  }
}
