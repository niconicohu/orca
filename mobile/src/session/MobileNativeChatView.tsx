import type { MobileNativeChatViewProps as Props } from './mobile-native-chat-view-props'
export type { MobileNativeChatInputLockReason } from './mobile-native-chat-view-props'
import { useMobileTheme } from '../theme/use-mobile-theme'
import { MobileNativeChatToolbar } from './MobileNativeChatToolbar'
import { MobileChatPositioningCover } from './MobileChatPositioningCover'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { ArrowDown } from 'lucide-react-native'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import {
  nativeChatSubagentLabel,
  nativeChatSubagentLabels
} from '../../../src/shared/native-chat-subagent-attribution'
import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-native-chat-view-styles'
import {
  buildMobileNativeChatTransientData,
  mobileNativeChatEmptyState
} from './mobile-native-chat-render-data'
import { useMobileNativeChatPinchGesture } from './use-mobile-native-chat-pinch-gesture'
import { useMobileChatNativeLayout } from './use-mobile-chat-native-layout'
import { useMobileNativeChatTailFollow } from './use-mobile-native-chat-tail-follow'
import { useMobileNativeChatTurnDisclosure } from './use-mobile-native-chat-turn-disclosure'
import { useSettledMobileNativeChatInputLock } from './use-mobile-native-chat-input-lease'
import { MobileNativeChatTurnActivity } from './MobileNativeChatTurnStatus'
import { MobileNativeChatComposer } from './MobileNativeChatComposer'
import { MobileNativeChatPromptCard } from './MobileNativeChatPromptCard'
import { MobileNativeChatMessage } from './MobileNativeChatMessage'

/** Why the composer input is locked: the transport is disconnected, or the
 *  terminal subscription has not acknowledged its input lease yet. */

export function MobileNativeChatView({
  messages,
  folded,
  status,
  error,
  agent,
  agentWorking,
  canStop = agentWorking,
  structuredActivityUi = false,
  turnIndicator = null,
  workingStartedAt,
  settledTurns,
  onStop,
  streaming,
  hasMore,
  loadingEarlier,
  onLoadEarlier,
  onSend,
  sendSurfaceId,
  getSendCompletionGeneration,
  getComposerEditGeneration,
  pending,
  imagePreviewsByMessageId,
  composerText,
  onComposerTextChange,
  onAttachImage,
  attachments,
  onRemoveAttachment,
  isAttaching,
  onMicPress,
  micActive,
  dictationMode,
  onMicPressIn,
  onMicPressOut,
  inputLockReason,
  sendErrorMessage,
  onClearSendError,
  filePaths,
  onNeedFiles,
  sessionOptions,
  ask,
  askKey,
  onDismissAsk,
  onAnswerAsk,
  onCancelAsk,
  onCancelPrompt,
  question,
  onAnswerQuestion,
  permission,
  onRespondPermission,
  onOpenFile,
  keyboardInset = 0
}: Props): React.JSX.Element {
  useMobileTheme()

  const insets = useSafeAreaInsets()
  const [toolsExpanded, setToolsExpanded] = useState(false)
  // Lift the composer clear of the keyboard, plus the bottom safe-area so it
  // never sits under the home indicator / nav bar (mirrors the terminal dock).
  const bottomPad = keyboardInset > 0 ? keyboardInset + insets.bottom : insets.bottom
  const { fontScale, pinchGesture } = useMobileNativeChatPinchGesture()

  // `data` is the list source: folded transcript + synthetic streaming bubble +
  // route-owned accepted echoes. Memoize on the same deps so the
  // downstream autoscroll effects/`renderItem` keep referential stability.
  const { data: allData } = useMemo(
    () =>
      buildMobileNativeChatTransientData({
        messages,
        folded,
        streaming,
        pending,
        imagePreviewsByMessageId
      }),
    [messages, folded, streaming, pending, imagePreviewsByMessageId]
  )
  const turns = useMobileNativeChatTurnDisclosure({
    messages: allData,
    enabled: structuredActivityUi,
    isWorking: agentWorking === true,
    workingStartedAt,
    settledTurns,
    thinking: turnIndicator?.thinking === true,
    activityText: turnIndicator?.activityText ?? null,
    scopeKey: sendSurfaceId,
    allActivityExpanded: toolsExpanded
  })
  const data = turns.visibleMessages
  const nativeLayout = useMobileChatNativeLayout(sendSurfaceId, data.length - 1)
  const subagentLabels = useMemo(() => nativeChatSubagentLabels(messages), [messages])
  const {
    listRef,
    showJumpToTail,
    followingTail,
    initialPosition,
    jumpToTail,
    beginUserScroll,
    endUserDrag,
    beginMomentum,
    endMomentum,
    detachFromTail,
    recordScrollMetrics,
    canPageFromScroll
  } = useMobileNativeChatTailFollow<NativeChatMessage>({
    hasItems: data.length > 0,
    itemCount: data.length,
    scopeKey: sendSurfaceId,
    measurePosition: nativeLayout.measurePosition
  })

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      const accepted = await onSend(text)
      if (!accepted) {
        return false
      }
      // The route-owned banner outlives this send; a success must retire it too,
      // or a stale "Message not sent" sits above the delivered message.
      onClearSendError?.()
      // Always jump to the newest message when the user sends.
      jumpToTail()
      return true
    },
    [onSend, onClearSendError, jumpToTail]
  )

  const loadEarlier = useCallback(() => {
    detachFromTail()
    onLoadEarlier?.()
  }, [detachFromTail, onLoadEarlier])

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = e.nativeEvent
      recordScrollMetrics(e.nativeEvent)
      initialPosition.scrolled(e.nativeEvent)
      // Near the top — page in older history.
      if (canPageFromScroll() && contentOffset.y < 60 && hasMore && !loadingEarlier) {
        loadEarlier()
      }
    },
    [hasMore, loadingEarlier, loadEarlier, recordScrollMetrics, canPageFromScroll, initialPosition]
  )

  // Per-turn status rows: one live indicator while the turn runs, then a settled
  // "Worked for N" row. The structured lane owns them; the bridge lane keeps its
  // three-dot indicator.

  const renderItem = useCallback(
    ({ item, index }: { item: NativeChatMessage; index: number }) => (
      <MobileNativeChatMessage
        message={item}
        nativeRowRef={index === turns.visibleMessages.length - 1 ? nativeLayout.rowRef : undefined}
        onNativeRowLayout={
          index === turns.visibleMessages.length - 1 ? nativeLayout.onLastRowLayout : undefined
        }
        toolsExpanded={toolsExpanded}
        fontScale={fontScale}
        onOpenFile={onOpenFile}
        structuredActivityUi={structuredActivityUi}
        onToggleTurn={turns.onToggleTurn}
        subagentLabel={nativeChatSubagentLabel(subagentLabels, item)}
        {...turns.resolveRow(index, item)}
      />
    ),
    [
      toolsExpanded,
      fontScale,
      onOpenFile,
      structuredActivityUi,
      subagentLabels,
      turns,
      data.length,
      nativeLayout.rowRef,
      nativeLayout.onLastRowLayout
    ]
  )

  const emptyState = mobileNativeChatEmptyState(status, agent ?? null, error)
  const showLoading = status === 'loading' && messages.length === 0

  const lockReason = useSettledMobileNativeChatInputLock(inputLockReason)

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      {showLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : (
        <GestureHandlerRootView style={styles.listWrap}>
          <View ref={nativeLayout.viewportRef} style={styles.listWrap} collapsable={false}>
            <GestureDetector gesture={pinchGesture}>
              <FlatList
                key={sendSurfaceId}
                {...initialPosition.listProps}
                maintainVisibleContentPosition={
                  followingTail ? undefined : { minIndexForVisible: 0 }
                }
                ref={listRef}
                data={data}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                // Let link/file taps land while the composer keyboard is up
                // instead of being swallowed by the dismiss gesture.
                keyboardShouldPersistTaps="handled"
                onScroll={onScroll}
                onScrollBeginDrag={beginUserScroll}
                onScrollEndDrag={endUserDrag}
                onMomentumScrollBegin={beginMomentum}
                onMomentumScrollEnd={endMomentum}
                scrollEventThrottle={32}
                ListHeaderComponent={
                  hasMore ? (
                    <Pressable
                      style={styles.loadEarlier}
                      onPress={loadEarlier}
                      disabled={loadingEarlier}
                    >
                      {loadingEarlier ? (
                        <ActivityIndicator size="small" color={colors.textMuted} />
                      ) : (
                        <Text style={styles.loadEarlierText}>Load earlier messages</Text>
                      )}
                    </Pressable>
                  ) : null
                }
                ListFooterComponent={
                  <View>
                    {agentWorking &&
                    (!structuredActivityUi || turns.active) &&
                    !(structuredActivityUi && (ask || permission || question)) ? (
                      <MobileNativeChatTurnActivity
                        thinking={turns.active?.thinking ?? turnIndicator?.thinking ?? false}
                        activityText={turns.activeActivityText}
                      />
                    ) : null}
                    <View ref={nativeLayout.footerRef} collapsable={false} />
                  </View>
                }
                ListEmptyComponent={
                  emptyState ? (
                    <View style={styles.center}>
                      <Text style={styles.emptyTitle}>{emptyState.title}</Text>
                      <Text style={styles.emptySubtitle}>{emptyState.subtitle}</Text>
                    </View>
                  ) : null
                }
              />
            </GestureDetector>
            <MobileChatPositioningCover ready={initialPosition.ready} />
            {/* Jump-to-latest control. */}
            {showJumpToTail ? (
              <Pressable
                accessibilityLabel="Scroll to latest"
                style={[styles.fab, styles.fabBottom]}
                onPress={jumpToTail}
              >
                <ArrowDown size={18} color={colors.textPrimary} strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>
        </GestureHandlerRootView>
      )}
      <MobileNativeChatPromptCard
        ask={ask}
        askKey={askKey}
        onDismissAsk={onDismissAsk}
        onAnswerAsk={onAnswerAsk}
        onCancelAsk={onCancelAsk}
        onCancelPrompt={onCancelPrompt}
        permission={permission}
        onRespondPermission={onRespondPermission}
        question={question}
        onAnswerQuestion={onAnswerQuestion}
      />
      <MobileNativeChatToolbar
        toolsExpanded={toolsExpanded}
        onToggleTools={() => setToolsExpanded((v) => !v)}
        canStop={canStop}
        onStop={onStop}
      />
      {sendErrorMessage ? (
        // This banner is the only channel for a send failure — announce it.
        <View
          style={styles.sendError}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.sendErrorText}>{sendErrorMessage}</Text>
        </View>
      ) : null}
      <MobileNativeChatComposer
        structuredCommands={
          structuredActivityUi ? (sessionOptions?.controller.conversationCommands ?? []) : undefined
        }
        value={composerText}
        onChangeText={onComposerTextChange}
        onSend={handleSend}
        sendSurfaceId={sendSurfaceId}
        {...{ getSendCompletionGeneration, getComposerEditGeneration }}
        agent={agent}
        sessionOptions={sessionOptions}
        onAttachImage={onAttachImage}
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
        isAttaching={isAttaching}
        onMicPress={onMicPress}
        micActive={micActive}
        dictationMode={dictationMode}
        onMicPressIn={onMicPressIn}
        onMicPressOut={onMicPressOut}
        disabled={lockReason !== null}
        placeholder={
          lockReason === 'disconnected'
            ? 'Reconnecting…'
            : lockReason === 'waiting'
              ? 'Waiting for terminal…'
              : 'Message, @files, /commands'
        }
        filePaths={filePaths}
        onNeedFiles={onNeedFiles}
      />
    </View>
  )
}
