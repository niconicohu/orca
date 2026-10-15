import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { createThemedStyles } from '../theme/mobile-themed-styles'
import { useMobileTheme } from '../theme/use-mobile-theme'
import { useMobileAppearance } from '../theme/use-mobile-appearance'
import type { MobileAppearance } from '../theme/mobile-appearance-controller'

const choices: { value: MobileAppearance; label: string }[] = [
  { value: 'system', label: 'Follow system' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' }
]

export function MobileAppearanceSettings() {
  useMobileTheme()
  const { preference, setPreference, error } = useMobileAppearance()
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Theme</Text>
      <View style={styles.section}>
        {choices.map(({ value, label }) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: preference === value }}
            onPress={() => void setPreference(value)}
            style={({ pressed }) => [
              styles.segment,
              preference === value && styles.segmentActive,
              pressed && styles.pressed
            ]}
          >
            <Text style={[styles.label, preference === value && styles.labelActive]}>
              {value === 'system' ? 'System' : label}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = createThemedStyles(() =>
  StyleSheet.create({
    container: { marginBottom: spacing.lg },
    heading: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      marginBottom: spacing.sm
    },
    section: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.bgBase,
      borderRadius: radii.button,
      padding: spacing.xs
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.button - 1
    },
    segmentActive: { backgroundColor: colors.bgRaised },
    pressed: { backgroundColor: colors.bgPanel },
    label: { color: colors.textSecondary, fontSize: typography.bodySize },
    labelActive: { color: colors.textPrimary, fontWeight: '600' },
    error: { marginTop: spacing.sm, fontSize: typography.metaSize, color: colors.statusRed }
  })
)
