import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { ChevronDown, ChevronUp, Goal } from 'lucide-react-native'
import type { AgentJournalThreadGoal } from '../../../src/shared/agent-session-journal-types'
import { agentSessionThreadGoalElapsedSeconds } from '../../../src/shared/agent-session-thread-goal'
import {
  NATIVE_CHAT_THREAD_GOAL_COPY as copy,
  nativeChatThreadGoalStatusKey
} from '../../../src/shared/native-chat-thread-goal-copy'
import { formatNativeChatDuration } from '../../../src/shared/native-chat-turn-status'
import { useNow } from '../hooks/use-now'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'

export type MobileNativeChatThreadGoal = {
  goal: AgentJournalThreadGoal
  runningTurn: { startedAt: number | null } | null
  hostClockOffsetMs: number
}

export function MobileNativeChatThreadGoalBanner({
  goal,
  runningTurn,
  hostClockOffsetMs
}: MobileNativeChatThreadGoal): React.JSX.Element | null {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { height } = useWindowDimensions()
  const [expanded, setExpanded] = useState(false)
  const now = useNow(1_000, goal.status === 'active' && runningTurn !== null)
  const key = nativeChatThreadGoalStatusKey(goal.status, runningTurn !== null)
  if (key === null) {
    return null
  }
  const label = {
    pursuing: t('components.native-chat.goal.pursuing', copy.pursuing),
    set: t('components.native-chat.goal.set', copy.set),
    paused: t('components.native-chat.goal.paused', copy.paused),
    blocked: t('components.native-chat.goal.blocked', copy.blocked),
    limited: t('components.native-chat.goal.limited', copy.limited)
  }[key]
  const action = expanded
    ? t('components.native-chat.goal.collapse', copy.collapse)
    : t('components.native-chat.goal.expand', copy.expand)
  const elapsed = formatNativeChatDuration(
    agentSessionThreadGoalElapsedSeconds(goal, now - hostClockOffsetMs, runningTurn)
  )
  return (
    <View style={styles.strip} testID="thread-goal-banner">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action}: ${label} — ${goal.objective}, ${elapsed}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Goal size={14} color={colors.textMuted} />
        <Text style={styles.objective} numberOfLines={1}>
          <Text style={styles.label}>{label} </Text>
          {goal.objective}
        </Text>
        <Text style={styles.elapsed} importantForAccessibility="no" accessibilityElementsHidden>
          {elapsed}
        </Text>
        {expanded ? (
          <ChevronUp size={14} color={colors.textMuted} />
        ) : (
          <ChevronDown size={14} color={colors.textMuted} />
        )}
      </Pressable>
      {expanded ? (
        <ScrollView
          style={[styles.details, { maxHeight: height / 4 }]}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.fullObjective}>{goal.objective}</Text>
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  strip: {
    marginHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderTopLeftRadius: radii.row,
    borderTopRightRadius: radii.row,
    backgroundColor: colors.bgPanel
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  objective: { flex: 1, minWidth: 0, fontSize: typography.metaSize, color: colors.textSecondary },
  label: { fontWeight: '600', color: colors.textPrimary },
  elapsed: {
    fontSize: typography.metaSize,
    color: colors.textMuted,
    fontVariant: ['tabular-nums']
  },
  details: { minHeight: 0, flexShrink: 1 },
  fullObjective: {
    padding: spacing.sm,
    fontSize: typography.metaSize,
    color: colors.textSecondary
  },
  pressed: { opacity: 0.7 }
}))
