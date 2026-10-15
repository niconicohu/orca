import { useMobileTheme } from '../theme/use-mobile-theme'
import { ActivityIndicator, View } from 'react-native'
import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-native-chat-view-styles'

export function MobileChatPositioningCover({ ready }: { ready: boolean }) {
  useMobileTheme()

  return ready ? null : (
    <View style={styles.positioningCover} testID="chat-initial-position-loading">
      <ActivityIndicator color={colors.textSecondary} accessibilityLabel="Loading chat" />
    </View>
  )
}
