import { createContext, useContext } from 'react'
import type { StyleProp, TextStyle } from 'react-native'
import {
  useMobileChatFontWeightValue,
  type MobileChatFontWeight
} from './mobile-chat-font-weight-value'

/** Markdown previews can override the chat preference without changing saved settings. */
export const MobileChatTypography = createContext<MobileChatFontWeight | undefined>(undefined)

export function useMobileChatTextStyle(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const { weight } = useMobileChatFontWeightValue()
  const override = useContext(MobileChatTypography)
  const emphasis = chatTextEmphasis(style)
  const chosen = override ?? weight
  if (emphasis || chosen === 400) {
    return style
  }
  return [style, { fontWeight: chosen }]
}

function chatTextEmphasis(style: unknown): boolean | undefined {
  if (Array.isArray(style)) {
    for (const entry of style.toReversed()) {
      const emphasis = chatTextEmphasis(entry)
      if (emphasis !== undefined) {
        return emphasis
      }
    }
    return undefined
  }
  if (!style || typeof style !== 'object' || !('fontWeight' in style)) {
    return undefined
  }
  return style.fontWeight === 'bold' || Number(style.fontWeight) >= 600
}
