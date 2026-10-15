import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { isRootAgentJournalItem } from '../../../src/shared/agent-session-journal-producer'
import { MOBILE_UNANCHORED_TURN_KEY } from './use-mobile-native-chat-turn-status'

export type MobileChatTurnPresentation = {
  turnKey: string
  anchor: boolean
  hasDetails: boolean
  activityHidden: boolean
}

function isCompactionBoundary(message: NativeChatMessage): boolean {
  return (
    message.role === 'system' &&
    message.blocks.length > 0 &&
    message.blocks.every((block) => block.type === 'text' && block.presentation === 'compaction')
  )
}

/** Disclosure follows available content, not optional clock measurements. */
export function mobileNativeChatTurnPresentation(
  messages: readonly NativeChatMessage[],
  activeTurnKey: string | null,
  expanded: ReadonlySet<string>,
  allExpanded = false
) {
  const groups = new Map<string, NativeChatMessage[]>()
  let key = MOBILE_UNANCHORED_TURN_KEY
  for (const message of messages) {
    if (message.role === 'user' && isRootAgentJournalItem(message)) {
      key = message.id
    }
    const group = groups.get(key)
    if (group) {
      group.push(message)
    } else {
      groups.set(key, [message])
    }
  }
  const rows = new Map<string, MobileChatTurnPresentation>()
  const visibleMessages: NativeChatMessage[] = []
  for (const [turnKey, group] of groups) {
    const final = group.findLast(
      (message) =>
        message.role === 'assistant' &&
        isRootAgentJournalItem(message) &&
        message.blocks.some((block) => block.type === 'text' || block.type === 'image-ref')
    )
    const hasDetails = group.some(
      (message) =>
        message.role !== 'user' &&
        !isCompactionBoundary(message) &&
        (message.blocks.some(
          (block) => block.type === 'tool-call' || block.type === 'tool-result'
        ) ||
          (message.id !== final?.id && message.blocks.length > 0))
    )
    const open = turnKey === activeTurnKey || expanded.has(turnKey) || allExpanded
    for (const [index, message] of group.entries()) {
      const anchor = index === 0
      const activityHidden =
        !open &&
        hasDetails &&
        message.role !== 'user' &&
        message.id !== final?.id &&
        !isCompactionBoundary(message)
      rows.set(message.id, { turnKey, anchor, hasDetails, activityHidden })
      if (!activityHidden || anchor) {
        visibleMessages.push(message)
      }
    }
  }
  return { rows, visibleMessages }
}
