import { forwardRef } from 'react'
import { Text, TextInput, type TextProps, type TextInputProps } from 'react-native'
import { useMobileChatTextStyle } from '../theme/mobile-chat-typography'

/** Chat labels, prose and status copy share one preference; semantic emphasis stays explicit. */
export const MobileChatText = forwardRef<Text, TextProps>(function MobileChatText(props, ref) {
  return <Text {...props} ref={ref} style={useMobileChatTextStyle(props.style)} />
})

/** Native placeholders inherit the same font weight as their editable draft. */
export const MobileChatTextInput = forwardRef<TextInput, TextInputProps>(
  function MobileChatTextInput(props, ref) {
    return <TextInput {...props} ref={ref} style={useMobileChatTextStyle(props.style)} />
  }
)
