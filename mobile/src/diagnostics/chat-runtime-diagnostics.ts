import type { RpcClient } from '../transport/rpc-client'

export type ChatDiagnosticFacts = Record<string, boolean | number | null | undefined | string>
type HostTrace = { events: string[]; scopes: Map<string, number>; nextScope: number }
const traces = new Map<string, HostTrace>()
const clients = new WeakMap<RpcClient, string>()
const MAX_HOSTS = 8
const MAX_EVENTS = 80

export function registerChatDiagnosticClient(client: RpcClient, hostId: string): void {
  clients.set(client, hostId)
}

/** Only call with fixed labels and metadata; never message text, paths, tokens or raw errors. */
export function recordChatDiagnostic(
  hostId: string,
  scope: string,
  event: string,
  facts: ChatDiagnosticFacts
): void {
  let trace = traces.get(hostId)
  if (!trace) {
    trace = { events: [], scopes: new Map(), nextScope: 1 }
    traces.set(hostId, trace)
    if (traces.size > MAX_HOSTS) {
      const oldest = traces.keys().next().value
      if (oldest !== undefined) {
        traces.delete(oldest)
      }
    }
  }
  let alias = trace.scopes.get(scope)
  if (alias === undefined) {
    alias = trace.nextScope++
    trace.scopes.set(scope, alias)
    if (trace.scopes.size > MAX_EVENTS) {
      const oldest = trace.scopes.keys().next().value
      if (oldest !== undefined) {
        trace.scopes.delete(oldest)
      }
    }
  }
  const fields = Object.entries(facts)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  trace.events.push(`${new Date().toISOString()} [scope-${alias}] ${event} ${fields}`)
  if (trace.events.length > MAX_EVENTS) {
    trace.events.shift()
  }
}

export function recordChatClientDiagnostic(
  client: RpcClient,
  scope: string,
  event: string,
  facts: ChatDiagnosticFacts
): void {
  const hostId = clients.get(client)
  if (hostId) {
    recordChatDiagnostic(hostId, scope, event, facts)
  }
}

export async function measureChatRead<T>(
  client: RpcClient,
  scope: string,
  operation: string,
  read: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  recordChatClientDiagnostic(client, scope, operation, { phase: 'start' })
  try {
    const result = await read()
    recordChatClientDiagnostic(client, scope, operation, {
      phase: 'reply',
      elapsedMs: Date.now() - start,
      ok: result && typeof result === 'object' && 'ok' in result ? result.ok === true : true
    })
    return result
  } catch (error) {
    recordChatClientDiagnostic(client, scope, operation, {
      phase: 'rejected',
      elapsedMs: Date.now() - start
    })
    throw error
  }
}

export function chatRuntimeDiagnosticLines(hostId: string): string[] {
  return [
    'Chat runtime diagnostics (chat-trace.4; metadata only; current app process)',
    ...(traces.get(hostId)?.events ?? ['No chat events captured in this app process.'])
  ]
}
