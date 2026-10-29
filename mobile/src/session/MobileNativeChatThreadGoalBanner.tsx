import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown, ChevronUp, Goal } from 'lucide-react-native'
import type { AgentJournalThreadGoal } from '../../../src/shared/agent-session-journal-types'
import { agentSessionThreadGoalElapsedSeconds } from '../../../src/shared/agent-session-thread-goal'
import {
  NATIVE_CHAT_THREAD_GOAL_COPY as copy,
  nativeChatThreadGoalStatusKey
} from '../../../src/shared/native-chat-thread-goal-copy'
import { formatNativeChatDuration } from '../../../src/shared/native-chat-turn-status'
import { useNow } from '../hooks/use-now'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

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
  const [expanded, setExpanded] = useState(false)
  const now = useNow(1_000, goal.status === 'active' && runningTurn !== null)
  const key = nativeChatThreadGoalStatusKey(goal.status, runningTurn !== null)
  if (key === null) {
    return null
  }
  const elapsed = formatNativeChatDuration(
    agentSessionThreadGoalElapsedSeconds(goal, now - hostClockOffsetMs, runningTurn)
  )
  return (
    <View style={styles.strip} testID="thread-goal-banner">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? copy.collapse : copy.expand}: ${copy[key]} — ${goal.objective}, ${elapsed}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Goal size={14} color={colors.textMuted} />
        <Text style={styles.objective} numberOfLines={expanded ? undefined : 1}>
          <Text style={styles.label}>{copy[key]} </Text>
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
    </View>
  )
}

const styles = StyleSheet.create({
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
  pressed: { opacity: 0.7 }
})
