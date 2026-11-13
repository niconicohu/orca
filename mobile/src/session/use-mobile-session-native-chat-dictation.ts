import { useEffect } from 'react'
import { useMobileSessionDictation } from './use-mobile-session-dictation'
import { useMobileNativeChatController } from './native-chat/use-mobile-native-chat-controller'
import { useMobileNativeChatReadability } from './native-chat/transcript/use-mobile-native-chat-readability'
import { useMobileNativeChatInputLease } from './native-chat/composer/use-mobile-native-chat-input-lease'
import { useMobileNativeChatSendError } from './native-chat/composer/use-mobile-native-chat-send-error'
import { mobileNativeChatScopeKey } from './native-chat/mobile-native-chat-scope-key'
import { mobileNativeChatOverlayInputLockReason } from './native-chat/mobile-native-chat-overlay-lock-reason'
import { useMobileSendCompletionGeneration } from './use-mobile-send-completion-generation'
import type { MobileSessionFeedbackCapabilitiesModel } from './use-mobile-session-feedback-capabilities'
import { useMobileSideChat } from './mobile-native-chat-side-chat'

export function useMobileSessionNativeChatDictation(
  scope: MobileSessionFeedbackCapabilitiesModel,
  sendLiveTerminalInput: (handle: string, bytes: string) => Promise<boolean>
) {
  const {
    hostId,
    worktreeId,
    client,
    pairedHostClient,
    connState,
    activeHandle,
    activeSessionTabId,
    deviceTokenRef,
    activeHandleRef,
    activeSessionTab,
    showToast,
    resetLiveInputFocus
  } = scope
  const nativeChatScopeKey = mobileNativeChatScopeKey(hostId, worktreeId, activeSessionTabId)
  const nativeChatSendError = useMobileNativeChatSendError({
    scopeKey: nativeChatScopeKey,
    showToast
  })
  const nativeChatTranscriptIsLocalReadable = useMobileNativeChatReadability(client, worktreeId)
  const handleOpenSideChat = useMobileSideChat(scope)
  const {
    ready: nativeChatInputLeaseReady,
    readyRef: nativeChatInputLeaseReadyRef,
    lockReason: nativeChatInputLockReason,
    markReady: markNativeChatInputLeaseReady,
    clear: clearNativeChatInputLease
  } = useMobileNativeChatInputLease({
    activeHandle,
    connected: connState === 'connected'
  })
  const nativeChatController = useMobileNativeChatController({
    client,
    pairedHostClient,
    hostId,
    worktreeId,
    activeSessionTab,
    activeSessionTabId,
    activeHandleRef,
    deviceTokenRef,
    nativeChatTranscriptIsLocalReadable,
    nativeChatInputLeaseReady,
    connState,
    agentSessionHostSupport: scope.agentSessionHostSupport,
    onSendError: nativeChatSendError.show,
    onQueuedEditNotice: showToast,
    onSendResolved: nativeChatSendError.clear
  })
  const { toggleTabChatView, showNativeChat, showNativeChatRef } = nativeChatController
  nativeChatSendError.bannerMountedRef.current = showNativeChat
  nativeChatSendError.keepWhile(nativeChatController.nativeChatCommandRefusalCauses)
  const nativeChatOverlayInputLockReason = mobileNativeChatOverlayInputLockReason(
    activeSessionTab,
    connState,
    nativeChatInputLockReason
  )
  const routeKey = nativeChatScopeKey ?? `${hostId}\0${worktreeId}`
  const getSendCompletionGeneration = useMobileSendCompletionGeneration({
    onBlur: resetLiveInputFocus,
    surfaceKey: JSON.stringify([routeKey, activeHandle, showNativeChat])
  })

  const sessionDictation = useMobileSessionDictation(
    scope,
    nativeChatController,
    sendLiveTerminalInput
  )

  useEffect(() => {
    scope.diffCommentsRef.current = scope.diffComments
  }, [scope.diffComments, scope.diffCommentsRef])
  return {
    handleOpenSideChat,
    nativeChatScopeKey,
    nativeChatSendError,
    nativeChatTranscriptIsLocalReadable,
    nativeChatInputLeaseReady,
    nativeChatInputLeaseReadyRef,
    nativeChatInputLockReason,
    nativeChatOverlayInputLockReason,
    markNativeChatInputLeaseReady,
    clearNativeChatInputLease,
    nativeChatController,
    getSendCompletionGeneration,
    toggleTabChatView,
    showNativeChat,
    showNativeChatRef,
    ...sessionDictation
  }
}

export type MobileSessionNativeChatDictationModel = MobileSessionFeedbackCapabilitiesModel &
  ReturnType<typeof useMobileSessionNativeChatDictation>
