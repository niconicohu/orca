import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { regenerateStructuredAgentSessionName } from '@/runtime/structured-agent-session-client'
import { useStructuredAgentSessionHostCapabilityState } from '@/runtime/structured-agent-session-host-capability'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import { STRUCTURED_AGENT_SESSION_REGENERATE_NAME_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'

const noSubscription = () => () => {}

export function useNativeChatNameGeneration(
  target: RuntimeClientTarget | null,
  sessionId: string | undefined
) {
  const support = useStructuredAgentSessionHostCapabilityState(
    target,
    STRUCTURED_AGENT_SESSION_REGENERATE_NAME_RUNTIME_CAPABILITY
  )
  const feed = useMemo(
    () => (target && sessionId ? getStructuredAgentSessionStatusFeed(target) : null),
    [target, sessionId]
  )
  useEffect(() => feed?.activate(), [feed])
  const regenerating = useSyncExternalStore(
    feed?.subscribe ?? noSubscription,
    () => (sessionId ? (feed?.getNamingActive(sessionId) ?? null) : null),
    () => null
  )
  const regenerate = useCallback(
    () =>
      target && sessionId && support === 'supported'
        ? regenerateStructuredAgentSessionName(target, sessionId)
        : Promise.resolve(false),
    [target, support, sessionId]
  )
  return {
    canRegenerate: target !== null && !!sessionId && support === 'supported',
    regenerating: regenerating === true,
    regenerate
  }
}
