import { createMobileChatReadCache } from '../cache/mobile-chat-read-cache'
import {
  validStructuredChatRead,
  persistedStructuredChatRead
} from './mobile-chat-persisted-transcript'
import type { MobileStructuredChatState } from './mobile-structured-history-window'
export const mobileStructuredChatReads = createMobileChatReadCache<MobileStructuredChatState>(
  'structured-chat',
  { valid: validStructuredChatRead, compact: persistedStructuredChatRead }
)
