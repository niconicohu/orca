import type { AgentJournalRenderItem } from '../../../src/shared/agent-session-journal-types'
import type { StructuredAgentSessionState } from '../../../src/shared/structured-agent-session-reducer'

/** Device-only metadata. Wire cursors describe journal time, never historical coverage. */
export type MobileHistoryWindow = {
  before: number | null
  covered: { first: number; last: number }[]
  detached: AgentJournalRenderItem[]
  deleted: Record<string, number>
  /** Pages older than evicted tombstones must be re-read, not trusted. */
  minimumSnapshot: number
}
export type MobileStructuredChatState = StructuredAgentSessionState & {
  mobileHistory?: MobileHistoryWindow
  syncing?: boolean
  initialSyncRevision?: number
}
export const MAX_MOBILE_DELETIONS = 2048
export const MAX_DETACHED_ITEMS = 200

export function historyWindow(state: MobileStructuredChatState): MobileHistoryWindow {
  return (
    state.mobileHistory ?? {
      before: state.items[0]?.sequence ?? null,
      covered: state.items.length
        ? [{ first: state.items[0]!.sequence, last: state.items.at(-1)!.sequence }]
        : [],
      detached: [],
      deleted: {},
      minimumSnapshot: 0
    }
  )
}
