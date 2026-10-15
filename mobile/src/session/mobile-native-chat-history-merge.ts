import type { NativeChatMessage } from '../../../src/shared/native-chat-types'

/** Transcript hosts have no revisions. Only objects changed after the request overlay its answer. */
export function mergeMobileOlderTranscript(
  page: NativeChatMessage[],
  current: NativeChatMessage[],
  requested: ReadonlyMap<string, NativeChatMessage>,
  growingTail = false
): NativeChatMessage[] {
  const byId = new Map(page.map((message) => [message.id, message]))
  for (const message of current) {
    if ((!growingTail && !byId.has(message.id)) || requested.get(message.id) !== message) {
      byId.set(message.id, message)
    }
  }
  return [...byId.values()]
}
