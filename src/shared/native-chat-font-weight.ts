export const MIN_NATIVE_CHAT_FONT_WEIGHT = 400
export const MAX_NATIVE_CHAT_FONT_WEIGHT = 500
export const NATIVE_CHAT_FONT_WEIGHT_STEP = 25
export const DEFAULT_NATIVE_CHAT_FONT_WEIGHT = MIN_NATIVE_CHAT_FONT_WEIGHT

export function normalizeNativeChatFontWeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_NATIVE_CHAT_FONT_WEIGHT
  }
  const bounded = Math.max(
    MIN_NATIVE_CHAT_FONT_WEIGHT,
    Math.min(MAX_NATIVE_CHAT_FONT_WEIGHT, value)
  )
  return Math.round(bounded / NATIVE_CHAT_FONT_WEIGHT_STEP) * NATIVE_CHAT_FONT_WEIGHT_STEP
}
