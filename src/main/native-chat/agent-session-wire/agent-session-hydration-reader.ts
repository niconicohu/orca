import type { AgentSessionJournal } from '../agent-session-journal/journal-store'
import { readAgentSessionHydrationPage } from './agent-session-history-page'

/** One publication can serve several subscriber limits without re-reading each equal window. */
export function createAgentSessionHydrationReader(journal: AgentSessionJournal, fence: number) {
  const pages = new Map<number | undefined, ReturnType<typeof readAgentSessionHydrationPage>>()
  return (limit: number | undefined) => {
    let page = pages.get(limit)
    if (!page) {
      page = readAgentSessionHydrationPage(journal, fence, limit)
      pages.set(limit, page)
    }
    return page
  }
}
