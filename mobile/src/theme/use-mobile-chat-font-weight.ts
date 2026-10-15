import { useEffect } from 'react'
import {
  publishMobileChatFontWeight,
  useMobileChatFontWeightValue,
  type MobileChatFontWeight
} from './mobile-chat-font-weight-value'
export type { MobileChatFontWeight } from './mobile-chat-font-weight-value'
import AsyncStorage from '@react-native-async-storage/async-storage'
export const DEFAULT_MOBILE_CHAT_FONT_WEIGHT: MobileChatFontWeight = 400
export function normalizeMobileChatFontWeight(value: unknown): MobileChatFontWeight {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 400
  }
  return value < 350 ? 300 : value < 450 ? 400 : 500
}
import { persistMirrored } from '../storage/mirrored-storage-keys'

const KEY = 'orca:chatFontWeight'
let value: MobileChatFontWeight = DEFAULT_MOBILE_CHAT_FONT_WEIGHT
let loaded = false
let version = 0
let hydration: Promise<void> | undefined
let writes = Promise.resolve()
const notify = () => publishMobileChatFontWeight({ weight: value, ready: loaded })
export async function hydrateMobileChatFontWeight(): Promise<void> {
  if (!hydration) {
    const requested = version
    hydration = AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (version === requested) {
          value = normalizeMobileChatFontWeight(raw === null ? undefined : Number(raw))
        }
      })
      .catch(() => {})
      .finally(() => {
        loaded = true
        notify()
      })
  }
  return hydration
}
export function setMobileChatFontWeight(next: number): Promise<void> {
  version += 1
  value = normalizeMobileChatFontWeight(next)
  const saved = String(value)
  notify()
  const write = writes.then(() => persistMirrored(KEY, saved))
  writes = write.catch(() => {})
  return write
}
export function useMobileChatFontWeight() {
  const state = useMobileChatFontWeightValue()
  useEffect(() => {
    if (!loaded) {
      void hydrateMobileChatFontWeight()
    }
  }, [])
  return { ...state, setWeight: setMobileChatFontWeight }
}
