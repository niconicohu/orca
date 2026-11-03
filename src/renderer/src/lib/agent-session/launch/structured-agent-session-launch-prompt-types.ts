import type { AgentJournalSkillRef } from '../../../../../shared/agent-session/journal/agent-session-journal-types'

export type StructuredPromptDeliveryResult = {
  delivered: boolean
  failureNotified: boolean
  /** Not sent, and waiting in the new chat's composer, which now owns the text. */
  inComposer?: true
  /** An admitted recipient took ownership before it was explicitly discarded. */
  recipientOwned?: true
  /** Nobody could confirm it went: the host may hold it. */
  unconfirmed?: true
  /** Another send of the chat held its one slot, so this one never went. */
  busy?: true
}

export type StructuredLaunchPromptOptions = {
  prompt?: string
  skills?: readonly AgentJournalSkillRef[]
  promptDelivery?: 'auto-submit' | 'submit-after-ready' | 'draft'
  onPromptDelivered?: () => void
}
