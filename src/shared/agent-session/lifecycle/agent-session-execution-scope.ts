import type { AgentSessionExecutionLocation } from './agent-session-record'

/** NUL cannot occur in a host id, distro name, or workspace id, so no component can forge a join. */

/** Separate native/WSL/SSH workspace copies so one host cannot adjudicate another's lease. */
export function agentSessionScopeKey(location: AgentSessionExecutionLocation): string {
  return [location.executionHostId, location.wslDistro ?? '', location.workspaceId].join('\u0000')
}

export function agentSessionExecutionLocationsEqual(
  left: AgentSessionExecutionLocation,
  right: AgentSessionExecutionLocation
): boolean {
  return (
    agentSessionScopeKey(left) === agentSessionScopeKey(right) &&
    left.workspaceKind === right.workspaceKind
  )
}
