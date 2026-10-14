import { Pressable, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { styles } from './mobile-native-chat-message-styles'
export function MobileNativeChatTextActions({
  text,
  selecting,
  onToggle
}: {
  text: string
  selecting: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <View style={[styles.row, styles.toolRunHeader]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy message"
        hitSlop={8}
        onPress={() => void Clipboard.setStringAsync(text)}
      >
        <Text style={styles.subagentCaption}>Copy</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selecting ? 'Finish selecting text' : 'Select message text'}
        accessibilityState={{ selected: selecting }}
        hitSlop={8}
        onPress={onToggle}
      >
        <Text style={styles.subagentCaption}>{selecting ? 'Done selecting' : 'Select text'}</Text>
      </Pressable>
    </View>
  )
}
