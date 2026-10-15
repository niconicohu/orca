import { MobileChatText as Text } from '../components/MobileChatText'
import { useMobileTheme } from '../theme/use-mobile-theme'
import { Pressable, View } from 'react-native'
import { ChevronsDownUp, ChevronsUpDown, Square } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-native-chat-view-styles'

export function MobileNativeChatToolbar({
  toolsExpanded,
  onToggleTools,
  canStop,
  onStop
}: {
  toolsExpanded: boolean
  onToggleTools: () => void
  canStop?: boolean
  onStop?: () => void
}) {
  useMobileTheme()

  return (
    <View style={styles.chromeRow}>
      <View style={styles.chromeLeft}>
        <Pressable
          style={({ pressed }) => [styles.chromeToggle, pressed && styles.pressed]}
          onPress={() => onToggleTools()}
          hitSlop={8}
        >
          {toolsExpanded ? (
            <ChevronsDownUp size={14} color={colors.textMuted} strokeWidth={2} />
          ) : (
            <ChevronsUpDown size={14} color={colors.textMuted} strokeWidth={2} />
          )}
          <Text style={styles.chromeToggleLabel}>{toolsExpanded ? 'Collapse' : 'Tools'}</Text>
        </Pressable>
      </View>
      {canStop ? (
        <Pressable
          style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
          onPress={onStop}
          hitSlop={8}
          accessibilityLabel="Stop the agent"
        >
          <Square size={13} color={colors.statusRed} strokeWidth={2.4} fill={colors.statusRed} />
          <Text style={styles.stopLabel}>Stop</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
