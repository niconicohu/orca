import { createThemedStyles } from '../theme/mobile-themed-styles'
import { useMobileTheme } from '../theme/use-mobile-theme'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { colors } from '../theme/mobile-theme'

/**
 * What a route switch paints while the hybrid shell flag is still being read, which is a
 * development build only: a store build cannot have the flag on and never reaches this.
 *
 * The base background and nothing else placed on it, so the frame before the decision looks like
 * the frame after it whichever way the decision goes. Lifted out of the `web` route, which is
 * where this exact view already was, rather than written again: it is `HostProtocolGate`'s pending
 * state to the pixel, which is the surface directly above every switch that uses this one.
 */
export function ShellSwitchPendingScreen() {
  useMobileTheme()

  return (
    <View style={styles.pending}>
      <ActivityIndicator color={colors.textSecondary} accessibilityLabel="Loading" />
    </View>
  )
}

const styles = createThemedStyles(() =>
  StyleSheet.create({
    pending: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgBase
    }
  })
)
