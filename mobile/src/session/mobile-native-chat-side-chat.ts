import { useCallback } from 'react'
import type { MobileSessionTab } from './mobile-session-route-types'
import type { MobileSessionFeedbackCapabilitiesModel } from './use-mobile-session-feedback-capabilities'
import {
  launchedSelection,
  withLaunchReply,
  withoutUnansweredLaunch,
  resolveLaunchedSelection
} from './pending-session-selection'
import { structuredSessionOperationId } from './structured-session-operation-id'
import type { RpcClient } from '../transport/rpc-client'
import { createMobileStructuredAgentSession } from './mobile-structured-agent-session-launch'

export async function openMobileSideChat(input: {
  client: RpcClient
  worktreeId: string
  sessionId: string
  agent: string
  question?: string
  onError: (message: string) => void
  navigation: Pick<
    MobileSessionFeedbackCapabilitiesModel,
    'pendingSelectionRef' | 'sessionTabsRef' | 'switchSessionTabRef'
  >
}): Promise<boolean> {
  const lock = structuredSessionOperationId()
  const { pendingSelectionRef, sessionTabsRef, switchSessionTabRef } = input.navigation
  pendingSelectionRef.current = launchedSelection(lock, {}, null)
  const result = await createMobileStructuredAgentSession(
    input.client,
    input.worktreeId,
    input.agent,
    input.sessionId,
    input.question
  )
  if (result.kind === 'created') {
    pendingSelectionRef.current = withLaunchReply(pendingSelectionRef.current, lock, result)
    const landed = resolveLaunchedSelection(pendingSelectionRef.current, sessionTabsRef.current)
    const tab = sessionTabsRef.current.find((entry) => entry.id === landed.landedTabId)
    if (tab) {
      switchSessionTabRef.current?.(tab)
    }
    return true
  }
  pendingSelectionRef.current = withoutUnansweredLaunch(pendingSelectionRef.current, lock)
  input.onError('message' in result ? result.message : 'This host cannot open a side chat.')
  return false
}

export function useMobileSideChat(scope: MobileSessionFeedbackCapabilitiesModel) {
  const { client, agentSessionHostSupport, worktreeId, showToast, activeSessionTab } = scope
  const handleOpenSideChat = useCallback(
    async (tab: Extract<MobileSessionTab, { type: 'agent-session' }>, question = '') => {
      const current = scope.sessionTabsRef.current.find((entry) => entry.id === tab.id)
      if (
        !client ||
        scope.clientRef.current !== client ||
        !agentSessionHostSupport?.sideChat ||
        current?.type !== 'agent-session' ||
        current.sessionId !== tab.sessionId ||
        current.agent !== tab.agent ||
        !current.sideChatSupported
      ) {
        return false
      }
      return openMobileSideChat({
        client,
        worktreeId,
        sessionId: tab.sessionId,
        agent: tab.agent,
        question,
        navigation: {
          pendingSelectionRef: scope.pendingSelectionRef,
          sessionTabsRef: scope.sessionTabsRef,
          switchSessionTabRef: scope.switchSessionTabRef
        },
        onError: (message) => showToast(message, 3000)
      })
    },
    [
      client,
      scope.clientRef,
      scope.sessionTabsRef,
      scope.pendingSelectionRef,
      scope.switchSessionTabRef,
      agentSessionHostSupport?.sideChat,
      worktreeId,
      showToast
    ]
  )
  const openCurrentSideChat = useCallback(
    (question: string) =>
      activeSessionTab?.type === 'agent-session'
        ? handleOpenSideChat(activeSessionTab, question)
        : Promise.resolve(false),
    [activeSessionTab, handleOpenSideChat]
  )
  return { handleOpenSideChat, openCurrentSideChat }
}
