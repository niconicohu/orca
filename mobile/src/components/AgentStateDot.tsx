import { colors } from '../theme/mobile-theme'
import { createThemedStyles } from '../theme/mobile-themed-styles'
import { useMobileTheme } from '../theme/use-mobile-theme'
import { useEffect, useRef } from 'react'
import { Activity } from 'lucide-react-native'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import type { AgentDotState } from '../worktree/agent-row-display'

// Match desktop state meanings, with contrast appropriate to each app palette.
const DOT_COLORS = createThemedStyles(() => ({
  done: colors.agentDone,
  blocked: colors.agentAttention,
  waiting: colors.agentAttention,
  interrupted: colors.agentAttention,
  failed: colors.agentAttention,
  idle: colors.agentInactive
})) satisfies Record<Exclude<AgentDotState, 'working' | 'monitoring'>, string>

export function AgentStateDot({ state }: { state: AgentDotState }) {
  useMobileTheme()

  const spinValue = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (state === 'working') {
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
    return undefined
  }, [state, spinValue])

  if (state === 'working') {
    const rotate = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
    return (
      <View style={styles.wrapper}>
        <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />
      </View>
    )
  }

  if (state === 'monitoring') {
    return (
      <View style={styles.wrapper} accessibilityLabel="Monitoring background tasks">
        <Activity size={10} color={colors.agentWorking} />
      </View>
    )
  }

  return (
    <View style={styles.wrapper}>
      <View style={[styles.dot, { backgroundColor: DOT_COLORS[state] }]} />
    </View>
  )
}

const styles = createThemedStyles(() =>
  StyleSheet.create({
    wrapper: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
    dot: { width: 6, height: 6, borderRadius: 3 },
    spinner: {
      width: 6,
      height: 6,
      borderRadius: 3,
      borderWidth: 1.5,
      borderColor: colors.agentWorking,
      borderTopColor: 'transparent'
    }
  })
)
