import { MobileChatTypography } from '../theme/mobile-chat-typography'
import { useMobileChatFontWeightValue } from '../theme/mobile-chat-font-weight-value'
import { MobileChatText as Text } from '../components/MobileChatText'
import { MobileChatSyncPresentation } from './MobileChatSyncPresentation'
import { MobileChatPositioningCover } from './MobileChatPositioningCover'
import { useMobileChatNativeLayout } from './use-mobile-chat-native-layout'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { ArrowDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react-native'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-native-chat-view-styles'
import { mobileNativeChatListFooter } from './mobile-native-chat-list-footer'
import { mobileNativeChatListHeader } from './mobile-native-chat-list-header'
import {
  buildMobileNativeChatTransientData,
  mobileNativeChatEmptyState
} from './mobile-native-chat-render-data'
import { useMobileNativeChatPageHistory } from './use-mobile-native-chat-page-history'
import { useMobileNativeChatPinchGesture } from './use-mobile-native-chat-pinch-gesture'
import {
  mobileNativeChatRowAnchor,
  useMobileNativeChatTailFollow
} from './use-mobile-native-chat-tail-follow'
import { useMobileNativeChatTurnDisclosure } from './use-mobile-native-chat-turn-disclosure'
import {
  mobileNativeChatComposerPlaceholder,
  useSettledMobileNativeChatInputLock
} from './use-mobile-native-chat-input-lease'
import { MobileNativeChatLiveLine } from './MobileNativeChatLiveLine'
import { MobileNativeChatStopButton } from './MobileNativeChatStopButton'
import { MobileAgentWorkingIndicator } from './MobileAgentWorkingIndicator'
import { MobileNativeChatComposer } from './MobileNativeChatComposer'
import { MobileNativeChatPromptCard } from './MobileNativeChatPromptCard'
import { NO_COMPOSER_TRAY } from './use-mobile-native-chat-composer-tray'
import { MobileNativeChatMessage } from './MobileNativeChatMessage'
import { MobileNativeChatScrollHold } from './MobileNativeChatScrollHold'
import { mobileNativeChatUnsentNotices } from './mobile-native-chat-unsent-notices'

/** Why the composer input is locked: the transport is disconnected, or the
 *  terminal subscription has not acknowledged its input lease yet. */
export type { MobileNativeChatInputLockReason } from './mobile-native-chat-view-props'
import type { MobileNativeChatViewProps as Props } from './mobile-native-chat-view-props'

function MobileNativeChatViewContent({
  syncing,
  onPresentationReady,
  messages,
  folded,
  status,
  error,
  readFailedFinally = false,
  agent,
  agentWorking,
  canStop = agentWorking,
  structuredActivityUi = false,
  turnIndicator = null,
  workingStartedAt,
  settledTurns,
  turnJournal = null,
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
  onCollapseAsk,
  onCollapsePrompt,
  collapsedPrompt,
  question,
  onAnswerQuestion,
  permission,
  promptKey,
  onRespondPermission,
  composerTray: { content: trayContent, composerInputRef: inputRef } = NO_COMPOSER_TRAY,
  onOpenFile,
  keyboardInset = 0
}: Props & { onPresentationReady?: () => void }): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const [toolsExpanded, setToolsExpanded] = useState(false)
  // Lift the composer clear of the keyboard, plus the bottom safe-area so it
  // never sits under the home indicator / nav bar (mirrors the terminal dock).
  const bottomPad = keyboardInset > 0 ? keyboardInset + insets.bottom : insets.bottom
  const { fontScale, pinchGesture } = useMobileNativeChatPinchGesture()

  // `data` is the list source: folded transcript + synthetic streaming bubble +
  // route-owned accepted echoes. Memoize on the same deps so the
  // downstream autoscroll effects/`renderItem` keep referential stability.
  const { data } = useMemo(
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
  // Per-turn status rows: one live indicator while the turn runs, then a settled
  // "Worked for N" row. The structured lane owns them; the bridge lane keeps its
  // three-dot indicator.
  // The display status, decided once in the session hook.
  const stopping = turnIndicator?.stopping === true
  const turns = useMobileNativeChatTurnDisclosure({
    messages: data,
    enabled: structuredActivityUi,
    isWorking: agentWorking === true,
    workingStartedAt,
    settledTurns,
    turnJournal,
    thinking: turnIndicator?.thinking === true,
    activityText: turnIndicator?.activityText ?? null,
    stopping,
    lineYields: structuredActivityUi && (ask != null || permission != null || question != null),
    scopeKey: sendSurfaceId
  })

  const nativeLayout = useMobileChatNativeLayout(sendSurfaceId, turns.listMessages.length - 1)
  const {
    listRef,
    showJumpToTail,
    initialPosition,
    detachFromTail,
    jumpToTail,
    beginUserScroll,
    endUserDrag,
    beginMomentum,
    endMomentum,
    canPageFromScroll,
    recordScrollMetrics
  } = useMobileNativeChatTailFollow<NativeChatMessage>({
    hasItems: turns.listMessages.length > 0,
    itemCount: turns.listMessages.length,
    scopeKey: sendSurfaceId,
    measurePosition: nativeLayout.measurePosition
  })
  useEffect(() => {
    if (initialPosition.ready) {
      onPresentationReady?.()
    }
  }, [initialPosition.ready, onPresentationReady])

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
      // Near the top — page in older history. Only the reader's scroll: a pin reports offsets too.
      if (contentOffset.y < 60 && hasMore && !loadingEarlier && canPageFromScroll()) {
        loadEarlier()
      }
    },
    [hasMore, loadingEarlier, loadEarlier, canPageFromScroll, recordScrollMetrics, initialPosition]
  )

  const unsentNotices = useMemo(
    () => mobileNativeChatUnsentNotices(turnJournal, agent),
    [turnJournal, agent]
  )
  const renderItem = useCallback(
    ({ item, index }: { item: NativeChatMessage; index: number }) => (
      <MobileNativeChatMessage
        message={item}
        nativeRowRef={index === turns.listMessages.length - 1 ? nativeLayout.rowRef : undefined}
        onNativeRowLayout={
          index === turns.listMessages.length - 1 ? nativeLayout.onLastRowLayout : undefined
        }
        toolsExpanded={toolsExpanded}
        fontScale={fontScale}
        onOpenFile={onOpenFile}
        structuredActivityUi={structuredActivityUi}
        onToggleTurn={turns.onToggleTurn}
        unsentNotice={item.unsent ? unsentNotices.get(item.id) : undefined}
        {...turns.resolveRow(index, item)}
      />
    ),
    [toolsExpanded, fontScale, onOpenFile, structuredActivityUi, turns, unsentNotices, nativeLayout]
  )

  const history = useMobileNativeChatPageHistory(turns.listMessages, renderItem)

  const liveStatus = turns.liveLine ? (
    <MobileNativeChatLiveLine
      line={turns.liveLine}
      onToggleReasoning={turns.onToggleReasoning}
      fontScale={fontScale}
      onOpenFile={onOpenFile}
    />
  ) : null

  const emptyState = mobileNativeChatEmptyState(status, agent ?? null, error)
  const showLoading = status === 'loading' && messages.length === 0

  const lockReason = useSettledMobileNativeChatInputLock(inputLockReason)
  // Why only Send, terminal-backed only: that send types into the agent's prompt and can answer it,
  // while drafting never does; the host queues a structured send behind it.
  const expandedPromptOwnsSend =
    !structuredActivityUi && !collapsedPrompt && (ask ?? permission ?? question) != null
  const emptyStateView = emptyState ? (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>{emptyState.title}</Text>
      <Text style={styles.emptySubtitle}>{emptyState.subtitle}</Text>
    </View>
  ) : null

  // Whatever was already on screen: nothing here can act on a chat that cannot load, and its words
  // say why once, as a fresh open's do.
  if (readFailedFinally && emptyStateView) {
    return <View style={[styles.root, { paddingBottom: bottomPad }]}>{emptyStateView}</View>
  }

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      {syncing && messages.length > 0 ? (
        <View style={styles.loadEarlier}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={styles.loadEarlierText}>Syncing…</Text>
        </View>
      ) : null}
      {showLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : (
        <GestureHandlerRootView style={styles.listWrap}>
          <View ref={nativeLayout.viewportRef} style={styles.listWrap} collapsable={false}>
            <MobileNativeChatScrollHold headKey={turns.listMessages[0]?.id} listRef={listRef} />
            <GestureDetector gesture={pinchGesture}>
              <FlatList
                {...initialPosition.listProps}
                ref={listRef}
                data={history.listRows}
                keyExtractor={(item) => item.id}
                renderItem={history.renderListRow}
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
                maintainVisibleContentPosition={mobileNativeChatRowAnchor(hasMore === true)}
                ListHeaderComponent={history.withHistory(
                  mobileNativeChatListHeader(hasMore, loadingEarlier, loadEarlier)
                )}
                ListFooterComponent={
                  <View>
                    {mobileNativeChatListFooter(liveStatus, turns.waitingRows, renderItem)}
                    <View ref={nativeLayout.footerRef} collapsable={false} />
                  </View>
                }
                ListEmptyComponent={emptyStateView}
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
      {trayContent}
      <MobileNativeChatPromptCard
        key={promptKey ?? undefined}
        {...{ ask, askKey, onDismissAsk, onAnswerAsk, onCancelAsk, onCancelPrompt, onCollapseAsk }}
        {...{ permission, onRespondPermission, question, onAnswerQuestion, onCollapsePrompt }}
        collapsedPrompt={collapsedPrompt}
      />
      <View style={styles.chromeRow}>
        <View style={styles.chromeLeft}>
          {agentWorking && !structuredActivityUi ? <MobileAgentWorkingIndicator /> : null}
          <Pressable
            style={({ pressed }) => [styles.chromeToggle, pressed && styles.pressed]}
            onPress={() => setToolsExpanded((v) => !v)}
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
          // Only this phone's own request holds Stop: a repeat is how a stuck stop escalates.
          <MobileNativeChatStopButton
            onStop={onStop}
            held={agentWorking === true && turnIndicator?.stopRequestInFlight === true}
          />
        ) : null}
      </View>
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
        {...{ getSendCompletionGeneration, getComposerEditGeneration, inputRef }}
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
        sendDisabled={expandedPromptOwnsSend}
        placeholder={mobileNativeChatComposerPlaceholder(lockReason, turnIndicator?.afterStop)}
        filePaths={filePaths}
        onNeedFiles={onNeedFiles}
      />
    </View>
  )
}

export function MobileNativeChatView(props: Props): React.JSX.Element {
  const { weight } = useMobileChatFontWeightValue()
  return (
    <MobileChatTypography.Provider value={weight}>
      <MobileChatSyncPresentation
        props={props}
        render={(next) => <MobileNativeChatViewContent {...next} />}
      />
    </MobileChatTypography.Provider>
  )
}
