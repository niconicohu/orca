import type { RpcMethodName } from '../transport/rpc-params-contract'

const NAMED_METHODS: ReadonlySet<string> = new Set([
  'status.get',
  'settings.get',
  'agentSession.hold',
  'agentSession.release',
  'agentSession.subscribe',
  'agentSession.subscribeStatus',
  'agentSession.options',
  'agentSession.currentRequests',
  'agentSession.modelCatalog',
  'agentSession.conversationOutline',
  'agentSession.history',
  'agentSession.subscribeAvailability',
  'agentSession.subscribeTurnCompletions',
  'agentSession.threadGoal',
  'terminal.subscribe'
] satisfies readonly RpcMethodName[])

export function bridgeProgressMethod(method: string): string {
  return NAMED_METHODS.has(method) ? method : 'other'
}

type StreamProgress = {
  method: string
  startedAt: number
  seq: number
  unacked: readonly unknown[]
  unackedBytes: number
}

export function bridgeStreamsProgress(streams: Iterable<StreamProgress>): string {
  const entries = [...streams]
  const visible = entries
    .sort(
      (a, b) =>
        Number(b.method.startsWith('agentSession.')) - Number(a.method.startsWith('agentSession.'))
    )
    .slice(0, 6)
    .map(
      (record) =>
        `${bridgeProgressMethod(record.method)}:frames=${record.seq},unacked=${record.unacked.length},bytes=${record.unackedBytes},ageMs=${Date.now() - record.startedAt}`
    )
  return `streams=${entries.length}; streamProgress=[${visible.join('|')}]`
}

// Three observations per bridge distinguish host waits from a page that stopped acknowledging.
export function startBridgeProgressLog(
  read: () => string,
  report: (detail: string) => void
): () => void {
  const startedAt = Date.now()
  const timers = [10_000, 30_000, 60_000].map((delay) =>
    setTimeout(() => report(`ageMs=${Date.now() - startedAt}; ${read()}`), delay)
  )
  return () => {
    for (const timer of timers) {
      clearTimeout(timer)
    }
  }
}
