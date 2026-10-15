import { useMobileChatTextStyle } from '../theme/mobile-chat-typography'
import { createElement, useContext } from 'react'
import type { MarkdownTextProps } from './mobile-markdown-inline-code-ranges'
import { MarkdownTextContext } from './mobile-markdown-text-setup'

export function MarkdownText(props: MarkdownTextProps): React.JSX.Element {
  const style = useMobileChatTextStyle(props.style)
  const { TextComponent, androidTranscript, onLongPress } = useContext(MarkdownTextContext)
  if (!androidTranscript) {
    return createElement(TextComponent, { ...props, style })
  }
  // Override selection without changing the nested spans' inherited behavior.
  return createElement(TextComponent, {
    ...props,
    style,
    ...(props.selectable === true ? { selectable: false } : {}),
    ...(onLongPress && props.onPress ? { onLongPress } : {})
  })
}
