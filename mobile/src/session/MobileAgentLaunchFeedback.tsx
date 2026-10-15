import { useEffect } from 'react'
import { focusedChatInput, blurLeavingChatInput } from './retained-chat-input-focus'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { MobileChatText as Text } from '../components/MobileChatText'
import { colors, spacing } from '../theme/mobile-theme'
import { createThemedStyles } from '../theme/mobile-themed-styles'
import { useMobileTheme } from '../theme/use-mobile-theme'
import type { MobileSessionController } from './use-mobile-session-controller'
import {
  mobileAgentLaunchFeedback,
  useMobileAgentLaunchFeedback
} from './mobile-agent-launch-feedback'
import { styles as sessionStyles } from './mobile-session-styles'

export function MobileAgentLaunchFeedback({
  controller,
  mode
}: {
  controller: MobileSessionController
  mode: 'tabs' | 'pane'
}) {
  useMobileTheme()
  const feedback = useMobileAgentLaunchFeedback(
    controller.client,
    controller.worktreeId,
    controller.activeSessionTabId
  )
  const selectedId = feedback.selected?.id
  useEffect(() => {
    if (mode === 'pane' && selectedId) {
      blurLeavingChatInput(focusedChatInput())
    }
  }, [mode, selectedId])
  const hide = (id: string) => {
    mobileAgentLaunchFeedback.remove(feedback.scope, id)
    if (
      controller.pendingSelectionRef.current?.kind === 'launched' &&
      controller.pendingSelectionRef.current.lock === id
    ) {
      controller.pendingSelectionRef.current = null
    }
  }
  if (mode === 'tabs') {
    return (
      <>
        {feedback.entries.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="tab"
            accessibilityLabel={`Creating ${entry.title}`}
            accessibilityState={{ selected: feedback.selected?.id === entry.id }}
            style={[
              sessionStyles.tab,
              feedback.selected?.id === entry.id && sessionStyles.tabActive
            ]}
            onPress={() =>
              mobileAgentLaunchFeedback.select(
                feedback.scope,
                entry.id,
                controller.activeSessionTabId
              )
            }
          >
            <View style={styles.row}>
              {entry.error ? null : <ActivityIndicator size="small" color={colors.textSecondary} />}
              <Text numberOfLines={1} style={sessionStyles.tabText}>
                {entry.title}
              </Text>
            </View>
          </Pressable>
        ))}
      </>
    )
  }
  const entry = feedback.selected
  return entry ? (
    <View style={styles.pane} testID="agent-launch-preparing">
      {entry.error ? null : <ActivityIndicator color={colors.textSecondary} />}
      <Text style={styles.title}>
        {entry.error ? `Could not open ${entry.title}` : `Creating ${entry.title}…`}
      </Text>
      <Text style={styles.description}>
        {entry.error ?? 'Waiting for the host to prepare the session.'}
      </Text>
      <Pressable onPress={() => hide(entry.id)} style={sessionStyles.createButton}>
        <Text style={sessionStyles.createButtonText}>Hide progress</Text>
      </Pressable>
    </View>
  ) : null
}
const styles = createThemedStyles(() =>
  StyleSheet.create({
    pane: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bgBase,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: { color: colors.textPrimary, textAlign: 'center' },
    description: { color: colors.textSecondary, textAlign: 'center' }
  })
)
