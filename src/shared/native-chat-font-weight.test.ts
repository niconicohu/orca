import { describe, expect, it } from 'vitest'
import { normalizeNativeChatFontWeight } from './native-chat-font-weight'

describe('chat prose weight', () => {
  it('bounds and snaps persisted values while preserving a legible legacy default', () => {
    for (const value of [undefined, null, '600', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normalizeNativeChatFontWeight(value)).toBe(400)
    }
    expect(normalizeNativeChatFontWeight(200)).toBe(400)
    expect(normalizeNativeChatFontWeight(900)).toBe(500)
    expect(normalizeNativeChatFontWeight(437)).toBe(425)
    expect(normalizeNativeChatFontWeight(438)).toBe(450)
    for (const value of [400, 425, 450, 475, 500]) {
      expect(normalizeNativeChatFontWeight(value)).toBe(value)
    }
  })
})
