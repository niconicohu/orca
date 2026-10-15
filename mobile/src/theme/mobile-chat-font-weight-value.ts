import { useSyncExternalStore } from 'react'
export type MobileChatFontWeight = 300 | 400 | 500
export type MobileChatFontWeightSnapshot = { weight: MobileChatFontWeight; ready: boolean }
let snapshot: MobileChatFontWeightSnapshot = { weight: 400, ready: false }
const listeners = new Set<() => void>()
export function publishMobileChatFontWeight(next: MobileChatFontWeightSnapshot): void {
  snapshot = next
  listeners.forEach((listener) => listener())
}
export const mobileChatFontWeightValue = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  read: () => snapshot
}
/** Read-only chat renders do not initialize native storage or compete with root hydration. */
export function useMobileChatFontWeightValue() {
  return useSyncExternalStore(
    mobileChatFontWeightValue.subscribe,
    mobileChatFontWeightValue.read,
    mobileChatFontWeightValue.read
  )
}
