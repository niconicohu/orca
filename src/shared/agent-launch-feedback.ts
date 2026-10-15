/** Process-local presentation only: never persisted, published, or treated as an agent session. */
export type AgentLaunchFeedbackEntry = {
  id: string
  title: string
  error?: string
}
export type AgentLaunchFeedbackSnapshot = {
  entries: readonly AgentLaunchFeedbackEntry[]
  selectedId: string | null
  selectionMarker?: string | null
}
const EMPTY: AgentLaunchFeedbackSnapshot = { entries: [], selectedId: null }
const MAX_SCOPES = 32
const MAX_ENTRIES = 8

export function createAgentLaunchFeedbackStore() {
  const scopes = new Map<string, AgentLaunchFeedbackSnapshot>()
  const listeners = new Set<() => void>()
  const read = (scope: string) => scopes.get(scope) ?? EMPTY
  const publish = (scope: string, next: AgentLaunchFeedbackSnapshot) => {
    scopes.delete(scope)
    if (next.entries.length) {
      scopes.set(scope, next)
    }
    while (scopes.size > MAX_SCOPES) {
      const oldest = scopes.keys().next().value
      if (oldest !== undefined) {
        scopes.delete(oldest)
      }
    }
    listeners.forEach((listener) => listener())
  }
  return {
    read,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    begin(scope: string, id: string, title: string, selectionMarker?: string | null) {
      const previous = read(scope)
      publish(scope, {
        entries: [...previous.entries.filter((entry) => entry.id !== id), { id, title }].slice(
          -MAX_ENTRIES
        ),
        selectedId: id,
        selectionMarker
      })
    },
    fail(scope: string, id: string, error: string) {
      const previous = read(scope)
      if (!previous.entries.some((entry) => entry.id === id)) {
        return
      }
      publish(scope, {
        ...previous,
        entries: previous.entries.map((entry) => (entry.id === id ? { ...entry, error } : entry))
      })
    },
    remove(scope: string, id: string) {
      const previous = read(scope)
      if (!previous.entries.some((entry) => entry.id === id)) {
        return
      }
      publish(scope, {
        ...previous,
        entries: previous.entries.filter((entry) => entry.id !== id),
        selectedId: previous.selectedId === id ? null : previous.selectedId
      })
    },
    select(scope: string, id: string | null, selectionMarker?: string | null) {
      const previous = read(scope)
      if (id !== null && !previous.entries.some((entry) => entry.id === id)) {
        return
      }
      if (previous.selectedId === id && previous.selectionMarker === selectionMarker) {
        return
      }
      publish(scope, { ...previous, selectedId: id, selectionMarker })
    }
  }
}
