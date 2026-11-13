import { parentPort } from 'node:worker_threads'
import Database from '../../../sqlite/sync-database'
import { readSavedUsageLimitCut } from './structured-agent-session-usage-limit-chain'
import type {
  UsageLimitCutWorkerRequest,
  UsageLimitCutWorkerResponse
} from './usage-limit-cut-worker-protocol'

function readCut(request: UsageLimitCutWorkerRequest): UsageLimitCutWorkerResponse {
  let db: Database.Database | undefined
  try {
    db = new Database(request.path, { readonly: true, fileMustExist: true })
    // Replay's many queries must see one committed journal snapshot.
    db.exec('BEGIN')
    const cut = readSavedUsageLimitCut(db, request.sessionId)
    db.exec('COMMIT')
    return { id: request.id, ok: true, cut }
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    db?.close()
  }
}

parentPort?.on('message', (request: UsageLimitCutWorkerRequest) => {
  parentPort!.postMessage(readCut(request))
})
