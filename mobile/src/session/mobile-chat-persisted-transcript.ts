import { z } from 'zod'
import type { MobileStructuredChatState } from './mobile-structured-history-window'
import type { CachedMobileNativeChatRead } from './mobile-native-chat-route-cache'

/** Keep a contiguous recent suffix under Android's per-value SQLite read window. */
function recentSuffix<T>(rows: readonly T[], budget = 400 * 1024): T[] {
  let bytes = 0
  let first = rows.length
  while (first > 0) {
    const next = JSON.stringify(rows[first - 1]).length * 2
    if (bytes + next > budget) {
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
  value: MobileStructuredChatState
): MobileStructuredChatState {
  const items = recentSuffix(value.items, 300 * 1024)
  return {
    ...value,
    items,
    submissions: [],
    fence: null,
    status: 'ready',
    syncing: undefined,
    initialSyncRevision: undefined,
    ...(value.mobileHistory
      ? {
          mobileHistory: {
            ...value.mobileHistory,
            before: items[0]?.sequence ?? value.mobileHistory.before,
            detached: recentSuffix(value.mobileHistory.detached, 64 * 1024),
            covered: items.length
              ? value.mobileHistory.covered
                  .map((range) => ({
                    first: Math.max(range.first, items[0]!.sequence),
                    last: Math.min(range.last, items.at(-1)!.sequence)
                  }))
                  .filter((range) => range.first <= range.last)
              : []
          }
        }
      : {}),
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
const historyMetadata = z.object({
  before: z.number().nonnegative().nullable(),
  minimumSnapshot: z.number().nonnegative(),
  covered: z
    .array(
      z.object({ first: z.number(), last: z.number() }).refine((range) => range.first <= range.last)
    )
    .max(32),
  detached: z
    .array(
      z.object({
        itemId: z.string(),
        revision: z.number(),
        sequence: z.number(),
        body: z.object({}).passthrough()
      })
    )
    .max(200),
  deleted: z.record(z.string(), z.number())
})
function validHistoryMetadata(value: unknown): boolean {
  return value === undefined || historyMetadata.safeParse(value).success
}
export function validStructuredChatRead(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (!('mobileHistory' in value) || validHistoryMetadata(value.mobileHistory)) &&
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
