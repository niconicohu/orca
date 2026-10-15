import { boundMobileChatEntries } from '../cache/bound-mobile-chat-entries'
import { mobileStructuredChatReads as routeReads } from './mobile-structured-chat-route-cache'
import { subscribeMobileStructuredChat } from './subscribe-mobile-structured-chat'
import { measureChatRead } from '../diagnostics/chat-runtime-diagnostics'
import { historyWindow, type MobileStructuredChatState } from './mobile-structured-history-window'
import type {
  MobileStructuredAgentStateArgs,
  MobileStructuredAgentState
} from './mobile-structured-agent-state-contract'
import { useMobileChatCheckpoint } from './use-mobile-chat-checkpoint'
import { reduceMobileStructuredChatCheckpoint } from './mobile-structured-chat-checkpoint'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AgentSessionHistoryResult } from '../../../src/shared/agent-session-wire'
import {
  EMPTY_STRUCTURED_AGENT_SESSION,
  type StructuredAgentSessionAction
} from '../../../src/shared/structured-agent-session-reducer'
import { callAgentSession } from './mobile-structured-agent-session-rpc'

export function useMobileStructuredAgentState(
  args: MobileStructuredAgentStateArgs
): MobileStructuredAgentState {
  const { client, connected, enabled, sessionId, sessionKey, snapshotLimit } = args
  const cacheClient = useRef(client)
  const clientChanged = cacheClient.current !== client
  const cached = client && sessionKey ? routeReads.get(client, sessionKey) : null
  // Keep a bounded cache so offline tab switches select the right transcript
  // synchronously without growing for the lifetime of the app.
  const [sessionStates, setSessionStates] = useState<Map<string, MobileStructuredChatState>>(
    () => new Map(cached && sessionKey ? [[sessionKey, cached]] : [])
  )
  if (clientChanged) {
    cacheClient.current = client
    setSessionStates(new Map())
  }
  const state =
    enabled && sessionKey
      ? (!clientChanged && sessionStates.get(sessionKey)) ||
        cached ||
        EMPTY_STRUCTURED_AGENT_SESSION
      : EMPTY_STRUCTURED_AGENT_SESSION
  const [loadingOlder, setLoadingOlder] = useState(false)
  const readyKeys = useRef(new Set<string>())
  if (clientChanged) {
    readyKeys.current.clear()
  }
  const olderInFlight = useRef(false)
  const stateRef = useRef<MobileStructuredChatState>(state)
  const sessionKeyRef = useRef(sessionKey)
  const streamGenerationRef = useRef(0)
  useLayoutEffect(() => {
    stateRef.current = state
    sessionKeyRef.current = sessionKey
    for (const key of readyKeys.current) {
      if (!sessionStates.has(key)) {
        readyKeys.current.delete(key)
      }
    }
  }, [sessionKey, state, sessionStates])

  const apply = useCallback(
    (action: StructuredAgentSessionAction) => {
      if (!sessionKey || (client && !routeReads.allowed(client, sessionKey))) {
        return
      }
      setSessionStates((current) => {
        const previous =
          current.get(sessionKey) ??
          (client ? routeReads.get(client, sessionKey) : null) ??
          EMPTY_STRUCTURED_AGENT_SESSION
        const reading = action.type === 'loading' ? { ...previous, fence: null } : previous
        const next = reduceMobileStructuredChatCheckpoint(reading, action, Date.now())
        if (next === previous) {
          return current
        }
        const updated = new Map(current)
        updated.delete(sessionKey)
        updated.set(sessionKey, next)
        return boundMobileChatEntries(updated, sessionKey)
      })
    },
    [client, sessionKey]
  )

  useEffect(
    () =>
      routeReads.subscribeInvalidation(() => {
        if (!client) {
          return
        }
        setSessionStates((previous) => {
          const next = new Map(previous)
          for (const key of next.keys()) {
            if (!routeReads.allowed(client, key)) {
              next.delete(key)
            }
          }
          return next.size === previous.size ? previous : next
        })
      }),
    [client]
  )

  const update = useCallback(
    (transform: (previous: MobileStructuredChatState) => MobileStructuredChatState) => {
      if (!client || !sessionKey || !routeReads.allowed(client, sessionKey)) {
        return
      }
      setSessionStates((current) => {
        const previous = current.get(sessionKey) ?? cached ?? EMPTY_STRUCTURED_AGENT_SESSION
        const next = transform(previous)
        const updated = new Map(current)
        updated.delete(sessionKey)
        updated.set(sessionKey, next)
        return boundMobileChatEntries(updated, sessionKey)
      })
    },
    [client, sessionKey]
  )

  useMobileChatCheckpoint(() => {
    if (
      client &&
      sessionKey &&
      (stateRef.current.items.length > 0 || stateRef.current.status === 'ready')
    ) {
      const current = stateRef.current
      routeReads.set(client, sessionKey, {
        ...current,
        fence: null,
        status: 'ready',
        backgroundTasks: null,
        activity: null,
        hostClock: undefined
      })
    }
  })

  useEffect(() => {
    streamGenerationRef.current += 1
    sessionKeyRef.current = sessionKey
    setLoadingOlder(false)
    olderInFlight.current = false
    if (!client || !sessionId || !enabled) {
      return
    }
    if (!connected) {
      // The cleanup above drops the dead hold and stream; keyed state keeps this
      // session's transcript visible while another tab can be selected.
      return
    }
    return subscribeMobileStructuredChat({
      client,
      sessionId,
      sessionKey: sessionKey ?? '',
      snapshotLimit,
      wasReady: !!sessionKey && readyKeys.current.has(sessionKey),
      getCurrent: () => (sessionKeyRef.current === sessionKey ? stateRef.current : null),
      markReady: () => {
        if (sessionKey) {
          readyKeys.current.add(sessionKey)
        }
      },
      update
    })
  }, [update, client, connected, enabled, sessionId, sessionKey, snapshotLimit])

  const loadEarlier = useCallback(() => {
    const current = stateRef.current
    if (!client || !sessionId || !sessionKey || loadingOlder || !current.hasOlder) {
      return
    }
    if (!current.epoch || historyWindow(current).before === null) {
      return
    }
    const requestSessionKey = sessionKey
    const requestGeneration = streamGenerationRef.current
    const isCurrentRead = (): boolean =>
      sessionKeyRef.current === requestSessionKey &&
      streamGenerationRef.current === requestGeneration
    if (olderInFlight.current) {
      return
    }
    olderInFlight.current = true
    setLoadingOlder(true)
    void (async () => {
      const window = historyWindow(stateRef.current)
      const sequence = window.before ?? stateRef.current.items[0]?.sequence
      if (sequence === undefined || !stateRef.current.epoch) {
        return
      }
      const cursor = { epoch: stateRef.current.epoch, sequence }
      const result = await measureChatRead(client, sessionId, 'agentSession.history.before', () =>
        callAgentSession<AgentSessionHistoryResult>(client, 'agentSession.history', {
          sessionId,
          direction: 'before',
          cursor,
          limit: 40
        })
      )
      if (!isCurrentRead()) {
        return
      }
      if (!result.ok) {
        apply({ type: 'history-page', page: result.page })
        return
      }
      apply({ type: 'older-page', requestedCursor: cursor, page: result.page })
    })()
      .catch((error: unknown) => {
        if (isCurrentRead()) {
          apply({ type: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      })
      .finally(() => {
        if (isCurrentRead()) {
          olderInFlight.current = false
          setLoadingOlder(false)
        }
      })
  }, [apply, client, loadingOlder, sessionId, sessionKey])

  return { state, stateRef, loadingOlder, loadEarlier }
}
