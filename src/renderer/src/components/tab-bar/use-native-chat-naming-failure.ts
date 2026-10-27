import { useCallback, useMemo, useState } from 'react'
import type { StructuredChatTabNamingFailure } from '@/runtime/structured-conversation-name'
import { structuredAgentSessionTargetForHost } from '@/runtime/structured-agent-session-owner'
import { useNativeChatNameGeneration } from './use-native-chat-name-generation'

export type NativeChatNamingFailureControls = {
  message: string
  /** Known before the card opens: the host check starts when the failure arrives. */
  canRegenerate: boolean
  regenerating: boolean
  regenerate: () => void
  dialogOpen: boolean
  setDialogOpen: (open: boolean) => void
  readFullOutput: () => Promise<string | null>
}

/** What a chat tab offers for its failed name: the error, its dialog, and Regenerate name. */
export function useNativeChatNamingFailure(
  failure: StructuredChatTabNamingFailure | null | undefined
): NativeChatNamingFailureControls | null {
  const executionHostId = failure?.executionHostId ?? null
  const sessionId = failure?.sessionId
  const failedAt = failure?.error.failedAt
  const [dialogOpen, setDialogOpen] = useState(false)
  const failing = failure !== null && failure !== undefined
  const target = useMemo(
    () => (failing ? structuredAgentSessionTargetForHost(executionHostId) : null),
    [executionHostId, failing]
  )
  const generation = useNativeChatNameGeneration(target, sessionId)
  const { regenerate: requestNameGeneration } = generation
  const regenerate = useCallback(() => {
    void requestNameGeneration()
  }, [requestNameGeneration])
  const readFullOutput = useCallback(async () => {
    // The full output never leaves the host that ran the agent; a paired one shows the message.
    const local = structuredAgentSessionTargetForHost(executionHostId)?.kind === 'local'
    return local && sessionId
      ? window.api.nativeChat.getConversationNameFailureOutput(sessionId)
      : null
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- A new diagnostic must reload output even when its message is unchanged.
  }, [executionHostId, sessionId, failedAt])
  if (!failure) {
    return null
  }
  return {
    message: failure.error.message,
    canRegenerate: generation.canRegenerate,
    regenerating: generation.regenerating,
    regenerate,
    dialogOpen,
    setDialogOpen,
    readFullOutput
  }
}
