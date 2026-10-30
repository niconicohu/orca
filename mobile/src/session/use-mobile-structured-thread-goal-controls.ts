import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import type {
  AgentSessionThreadGoalChange,
  AgentSessionThreadGoalResult
} from '../../../src/shared/agent-session-thread-goal-wire'
import {
  agentSessionWriteNoticeEnglish,
  agentSessionWriteNoticeParts
} from '../../../src/shared/agent-session-refusal-notice'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileStructuredAgentMutate } from './use-mobile-structured-agent-mutation'

export type MobileThreadGoalControls = {
  pending: boolean
  disabled: boolean
  change: (change: AgentSessionThreadGoalChange) => Promise<boolean>
}

export function useMobileStructuredThreadGoalControls(args: {
  sessionKey: string
  client: RpcClient | null
  fence: number | null
  enabled: boolean
  supported: boolean
  mutate: MobileStructuredAgentMutate
  reread: () => void
  onSendError: (message: string) => void
}): MobileThreadGoalControls | undefined {
  const { sessionKey, client, fence, enabled, supported, mutate, reread, onSendError } = args
  const context = useMemo(
    () => ({ live: false, pending: false }),
    [sessionKey, client, fence, enabled, supported]
  )
  useLayoutEffect(() => {
    context.live = true
    return () => {
      context.live = false
    }
  }, [context])
  const [pendingContext, setPendingContext] = useState<typeof context | null>(null)
  const change = useCallback(
    async (next: AgentSessionThreadGoalChange): Promise<boolean> => {
      if (!context.live || context.pending || !enabled || !supported || fence === null) {
        return false
      }
      context.pending = true
      setPendingContext(context)
      try {
        const result = await mutate<AgentSessionThreadGoalResult>(
          'agentSession.threadGoal',
          'agentSession.threadGoal',
          { change: next },
          () => context.live
        )
        if (!context.live) {
          return false
        }
        if (result.status === 'unknown') {
          onSendError(
            agentSessionWriteNoticeEnglish(
              agentSessionWriteNoticeParts({ kind: 'unconfirmed' }, 'goal')
            )
          )
        }
        if (result.status === 'accepted' && result.sameFence) {
          reread()
          return true
        }
        return false
      } finally {
        context.pending = false
        if (context.live) {
          setPendingContext(null)
        }
      }
    },
    [context, enabled, supported, fence, mutate, reread, onSendError]
  )
  return supported ? { pending: pendingContext === context, disabled: !enabled, change } : undefined
}
