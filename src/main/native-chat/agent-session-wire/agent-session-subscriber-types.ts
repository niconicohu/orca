import type { AgentJournalCursor } from '../../../shared/agent-session-journal-types'
import type {
  AgentSessionSubscribeEvent,
  AgentSessionSlashCommand
} from '../../../shared/agent-session-wire'
import type { QueuePublication } from './structured-agent-session-queued-publication'
import type { SubscriberFieldHooks } from './agent-session-subscriber-frame-fields'
import type { AgentSessionJournal } from '../agent-session-journal/journal-store'
import type { StructuredAgentSessionCurrentWork } from './structured-agent-session-current-work'

export type AgentSessionSubscriberEmit = (event: AgentSessionSubscribeEvent) => void
export type AgentSessionSubscribeInput = {
  id: string
  sessionId: string
  emit: AgentSessionSubscriberEmit
  cursor?: AgentJournalCursor
  /** Every frame to fit a phone's bridge frame; the RPC sets it for every phone. */
  snapshotLimit?: number
  boundedFrames?: boolean
}

export type Subscriber = {
  id: string
  sessionId: string
  emit: AgentSessionSubscriberEmit
  cursor: AgentJournalCursor
  fence: number
  snapshotLimit?: number
  boundedFrames: boolean
  commands?: AgentSessionSlashCommand[] | null
  /** The last draft list actually SENT — never advanced on a page that withheld
   *  it, or the final replacement would be suppressed by the identity dedup. */
  queuePublication?: QueuePublication
  /** Fingerprint of the background-task roster last SENT. */
  backgroundTasks?: string
  /** The current-work view the last frame's fields were read under
   *  (`StructuredAgentSessionCurrentWork.viewKey`); a change with no row still owes a frame. */
  workView?: string
}

export type AgentSessionSubscribersHooks = {
  readCommands?: (sessionId: string) => AgentSessionSlashCommand[] | undefined
  /** Revision-stable per emit: an unchanged list keeps its reference, so token
   *  streams never re-serialize it; any draft-table write changes it. */
  readQueuePublication?: (sessionId: string) => QueuePublication | undefined
  readBackgroundTasks?: SubscriberFieldHooks['readBackgroundTasks']
  /** Fires after publications that can change journal content. */
  onJournalPublished?: (sessionId: string, journal: AgentSessionJournal) => void
  /** The host's projection of current work (`structuredAgentSessionCurrentWork`), which every
   *  page and frame states as its turn and prompt fields. */
  readCurrentWork?: (
    sessionId: string,
    journal: AgentSessionJournal
  ) => StructuredAgentSessionCurrentWork | undefined
  now?: () => number
}
