import { useRef, useState } from 'react'
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  normalizeMobileChatFontWeight,
  DEFAULT_MOBILE_CHAT_FONT_WEIGHT,
  type MobileChatFontWeight,
  useMobileChatFontWeight
} from '../theme/use-mobile-chat-font-weight'
import { useMobileTheme } from '../theme/use-mobile-theme'
import { createThemedStyles } from '../theme/mobile-themed-styles'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { MobileMarkdown } from '../components/MobileMarkdown'

/** Shared native slider: three detents, drag preview, commit only on release. */
export function MobileChatFontWeightSetting() {
  useMobileTheme()
  const { weight, setWeight } = useMobileChatFontWeight()
  const [draft, setDraft] = useState<MobileChatFontWeight | null>(null)
  const [error, setError] = useState<string | null>(null)
  const width = useRef(1)
  const track = useRef<View>(null)
  const left = useRef(0)
  const selected = useRef(weight)
  const current = draft ?? weight
  const commit = (next: MobileChatFontWeight) => {
    setDraft(null)
    setError(null)
    void setWeight(next).catch(() => setError('Could not save font weight. Try again.'))
  }
  const move = (pageX: number) => {
    selected.current = normalizeMobileChatFontWeight(
      300 + ((pageX - left.current) / width.current) * (500 - 300)
    )
    setDraft(selected.current)
  }
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => move(event.nativeEvent.pageX),
    onPanResponderMove: (event) => move(event.nativeEvent.pageX),
    onPanResponderRelease: () => commit(selected.current),
    onPanResponderTerminate: () => setDraft(null)
  })
  const fraction = (current - 300) / (500 - 300)
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>Font weight</Text>
          <Text style={styles.description}>
            Adjust chat text weight. Bold text keeps its emphasis.
          </Text>
        </View>
        <Text style={styles.value}>
          {current === 300 ? 'Light' : current === 400 ? 'Regular' : 'Medium'}
        </Text>
        <Pressable
          accessibilityLabel="Reset font weight"
          onPress={() => commit(DEFAULT_MOBILE_CHAT_FONT_WEIGHT)}
          style={styles.reset}
        >
          <Text style={styles.description}>Reset</Text>
        </Pressable>
      </View>
      <View
        ref={track}
        style={styles.touch}
        {...responder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Chat font weight"
        accessibilityValue={{ min: 300, max: 500, now: current }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) =>
          commit(
            normalizeMobileChatFontWeight(
              current + (event.nativeEvent.actionName === 'increment' ? 1 : -1) * 100
            )
          )
        }
        onLayout={(event) => {
          width.current = event.nativeEvent.layout.width
          track.current?.measureInWindow((x) => {
            left.current = x
          })
        }}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
          {[0, 1, 2].map((stop) => (
            <View key={stop} style={[styles.tick, { left: `${stop * 50}%` }]} />
          ))}
          <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
        </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.description}>Light</Text>
        <View style={styles.copy} />
        <Text style={styles.description}>Medium</Text>
      </View>
      <MobileMarkdown
        content={
          'The quick brown fox jumps over the lazy dog.\n\n正文预览 · **Bold emphasis** · `inline code`'
        }
        textWeight={current}
      />
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
    card: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.card,
      backgroundColor: colors.bgPanel,
      gap: spacing.sm
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    copy: { flex: 1 },
    title: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '500' },
    description: { color: colors.textSecondary, fontSize: typography.metaSize },
    value: { color: colors.textPrimary, fontSize: typography.metaSize },
    reset: { padding: spacing.sm },
    touch: { height: 44, justifyContent: 'center' },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.borderSubtle },
    fill: { height: 6, borderRadius: 3, backgroundColor: colors.textSecondary },
    tick: {
      position: 'absolute',
      width: 2,
      height: 6,
      backgroundColor: colors.textMuted,
      marginLeft: -1
    },
    thumb: {
      position: 'absolute',
      top: -6,
      marginLeft: -9,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.textPrimary
    },
    error: { color: colors.statusRed, fontSize: typography.metaSize }
  })
)
