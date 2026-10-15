import { colors } from '../theme/mobile-theme'
import { createThemedStyles } from '../theme/mobile-themed-styles'
import { useMobileTheme } from '../theme/use-mobile-theme'
import { useEffect, useRef } from 'react'
import { Activity } from 'lucide-react-native'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import type { AgentWorkingMode } from '../../../src/shared/agent-status-types'

type WorktreeStatus = 'working' | 'active' | 'permission' | 'done' | 'inactive'

// Keep the desktop state vocabulary while adapting indicator contrast.
const STATUS_COLORS = createThemedStyles(() => ({
  working: colors.agentWorking,
  active: colors.agentDone,
  done: colors.agentDone,
  permission: colors.agentAttention,
  inactive: colors.agentInactive
})) satisfies Record<WorktreeStatus, string>

export function AgentSpinner({
  status,
  workingMode
}: {
  status: WorktreeStatus
  workingMode?: AgentWorkingMode
}) {
  useMobileTheme()

  const spinValue = useRef(new Animated.Value(0)).current
  const monitoring = status === 'working' && workingMode === 'monitoring'

  useEffect(() => {
    if (status === 'working' && !monitoring) {
      const animation = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true
        })
      )
      animation.start()
      return () => animation.stop()
    }
    spinValue.setValue(0)
  }, [monitoring, status, spinValue])

  const color = STATUS_COLORS[status] ?? STATUS_COLORS.inactive

  if (monitoring) {
    return (
      <View style={styles.wrapper} accessibilityLabel="Monitoring background tasks">
        <Activity size={12} color={STATUS_COLORS.working} />
      </View>
    )
  }

  if (status === 'working') {
    const rotate = spinValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg']
    })
    return (
      <View style={styles.wrapper}>
        <Animated.View style={[styles.spinner, { borderColor: color, transform: [{ rotate }] }]} />
      </View>
    )
  }

  return (
    <View style={styles.wrapper}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  // Why: 12x12 wrapper centered around an 8x8 inner glyph mirrors the
  // desktop's `inline-flex h-3 w-3 ... items-center justify-center` shell
  // around `size-2` indicator — keeps row height/baseline alignment stable
  // across status transitions.
  wrapper: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  spinner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderTopColor: 'transparent'
  }
})
