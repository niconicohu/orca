import { StyleSheet, Text } from 'react-native'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'

export function MobileSessionSideChatBadge() {
  const t = useMobileTranslation()
  return <Text style={styles.badge}>{t('session.sideChat.badge', 'btw')}</Text>
}

const styles = themedStyleSheet(() => ({
  badge: {
    flexShrink: 0,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    backgroundColor: colors.bgRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    paddingHorizontal: spacing.xs,
    color: colors.textSecondary,
    fontWeight: '500',
    fontSize: typography.metaSize
  }
}))
