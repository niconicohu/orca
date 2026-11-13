import type { StructuredAgentSessionMutationContext } from '../operations/structured-agent-session-mutation-context'
import type { StructuredAgentSessionClientDelivery } from '../publication/subscribers/structured-agent-session-client-delivery'
import type { StructuredAgentSessionHost } from '../host/structured-agent-session-host'
import { StructuredAgentSessionUsageLimitContinue } from './structured-agent-session-usage-limit-continue'
import { journalDatabasePath } from '../../agent-session-journal/database/journal-host-database'
import { UsageLimitCutWorkerClient } from './usage-limit-cut-worker-client'

export function start(
  context: StructuredAgentSessionMutationContext,
  host: Pick<StructuredAgentSessionHost, 'send'>,
  delivery: Pick<StructuredAgentSessionClientDelivery, 'publishStatus' | 'readUsageLimitCut'>
): StructuredAgentSessionUsageLimitContinue {
  const limit = new StructuredAgentSessionUsageLimitContinue({
    host: context.deps,
    sessions: context.sessions,
    readLoadedCut: delivery.readUsageLimitCut,
    savedCuts: new UsageLimitCutWorkerClient(
      journalDatabasePath(context.deps.journalDatabase.stateDirectory)
    ),
    serialize: context.serialize,
    send: (params) => host.send({ callerKey: 'trusted-local:usage-limit-continue' }, params),
    publish: delivery.publishStatus,
    now: context.now
  })
  limit.start()
  return limit
}

/** A reopened chat re-reads its cut from the loaded journal. */
export function opened(
  limit: Pick<StructuredAgentSessionUsageLimitContinue, 'forget'> | undefined,
  queued: { onOpened: (id: string) => void },
  id: string
): void {
  limit?.forget(id)
  queued.onOpened(id)
}
