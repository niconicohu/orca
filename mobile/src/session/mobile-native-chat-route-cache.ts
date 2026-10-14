import { persistedNativeChatRead, validNativeChatRead } from './mobile-chat-persisted-transcript'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { createMobileChatReadCache } from '../cache/mobile-chat-read-cache'

export type CachedMobileNativeChatRead = {
  messages: NativeChatMessage[]
  hasMore: boolean
  beforeOffset: number | null
  limit: number
}

export const mobileNativeChatRouteReads = createMobileChatReadCache<CachedMobileNativeChatRead>(
  'native-chat',
  { valid: validNativeChatRead, compact: persistedNativeChatRead }
)
