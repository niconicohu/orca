import type { AgentJournalSnapshot } from '../../../shared/agent-session-journal-types'
import type { AgentSessionLatestTurn } from '../../../shared/agent-session-wire'
import { isRootAgentJournalItem } from '../../../shared/agent-session-journal-producer'
import { readAgentJournalTurn } from '../../../shared/agent-session-turn-record'

/** The active/completed lifecycle checkpoint must survive a bounded visible history window. */
export function readAgentSessionLatestTurn(
  snapshot: AgentJournalSnapshot
): AgentSessionLatestTurn | null {
  for (let index = snapshot.items.length - 1; index >= 0; index -= 1) {
    const item = snapshot.items[index]!
    const turn = readAgentJournalTurn(item.body)
    if (turn && isRootAgentJournalItem(item)) {
      return { itemId: item.itemId, observedAt: item.observedAt, turn }
    }
  }
  return null
}
