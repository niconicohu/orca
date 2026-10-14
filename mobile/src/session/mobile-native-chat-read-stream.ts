import {
  applyAppend,
  createNativeChatMerger,
  replaceList
} from '../../../src/shared/native-chat-merge'
import type { MobileNativeChatStreamFrame } from './mobile-native-chat-stream-frame'

/** A history response is a base, while any earlier live appends are newer overlays. */
export function createMobileNativeChatReadStream(
  apply: (raw: unknown) => void,
  finishRead: () => void
) {
  let baseSeen = false
  const buffered = createNativeChatMerger()
  return {
    stream(raw: unknown): void {
      if (!raw || typeof raw !== 'object' || !('type' in raw)) {
        return
      }
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: frame application validates message arrays and supported opcodes.
      const frame = raw as MobileNativeChatStreamFrame
      if (frame.type === 'appended' && !baseSeen && Array.isArray(frame.messages)) {
        applyAppend(buffered, frame.messages, 2000)
        return
      }
      if (frame.type === 'replacement' || (frame.type === 'snapshot' && !frame.pending)) {
        baseSeen = true
        replaceList(buffered, [])
        finishRead()
      }
      apply(raw)
    },
    history(raw: unknown): void {
      if (baseSeen) {
        return
      }
      if (
        raw &&
        typeof raw === 'object' &&
        'type' in raw &&
        raw.type === 'snapshot' &&
        !('pending' in raw && raw.pending)
      ) {
        baseSeen = true
        apply(raw)
        apply({ type: 'appended', messages: buffered.list })
        replaceList(buffered, [])
      } else {
        if (raw && typeof raw === 'object' && 'type' in raw && raw.type === 'error') {
          baseSeen = true
          replaceList(buffered, [])
        }
        apply(raw)
      }
    }
  }
}
