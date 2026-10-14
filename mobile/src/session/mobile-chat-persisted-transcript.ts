import type { CachedMobileNativeChatRead } from './mobile-native-chat-route-cache'
import type { StructuredAgentSessionState } from '../../../src/shared/structured-agent-session-reducer'

/** Keep a contiguous recent suffix under Android's per-value SQLite read window. */
function recentSuffix<T>(rows: readonly T[]): T[] {
  let bytes = 0
  let first = rows.length
  while (first > 0) {
    const next = JSON.stringify(rows[first - 1]).length * 2
    if (bytes + next > 400 * 1024) {
      break
    }
    bytes += next
    first -= 1
  }
  return rows.slice(first)
}
export function persistedNativeChatRead(
  value: CachedMobileNativeChatRead
): CachedMobileNativeChatRead {
  const messages = recentSuffix(value.messages)
  const trimmed = messages.length < value.messages.length
  return {
    messages,
    limit: Math.max(40, messages.length),
    hasMore: value.hasMore || trimmed,
    beforeOffset: trimmed ? null : value.beforeOffset
  }
}
export function persistedStructuredChatRead(
  value: StructuredAgentSessionState
): StructuredAgentSessionState {
  const items = recentSuffix(value.items)
  return {
    ...value,
    items,
    submissions: [],
    fence: null,
    status: 'loading',
    hasOlder: value.hasOlder || items.length < value.items.length,
    backgroundTasks: null,
    activity: null,
    hostClock: undefined,
    commands: null,
    error: undefined,
    readRefusal: undefined
  }
}
export function validNativeChatRead(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'messages' in value &&
    Array.isArray(value.messages) &&
    value.messages.every(
      (row) =>
        row &&
        typeof row.id === 'string' &&
        Array.isArray(row.blocks) &&
        typeof row.role === 'string'
    ) &&
    'limit' in value &&
    typeof value.limit === 'number' &&
    'hasMore' in value &&
    typeof value.hasMore === 'boolean' &&
    'beforeOffset' in value &&
    (value.beforeOffset === null || typeof value.beforeOffset === 'number')
  )
}
export function validStructuredChatRead(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    Array.isArray(value.items) &&
    value.items.every(
      (row) =>
        row &&
        typeof row.itemId === 'string' &&
        typeof row.sequence === 'number' &&
        typeof row.revision === 'number' &&
        row.body &&
        typeof row.body === 'object'
    ) &&
    'submissions' in value &&
    Array.isArray(value.submissions) &&
    'epoch' in value &&
    (value.epoch === null || typeof value.epoch === 'string') &&
    'cursor' in value &&
    (value.cursor === null ||
      (typeof value.cursor === 'object' &&
        'sequence' in value.cursor &&
        typeof value.cursor.sequence === 'number' &&
        'epoch' in value.cursor &&
        typeof value.cursor.epoch === 'string'))
  )
}
