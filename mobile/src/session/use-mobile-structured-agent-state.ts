import type {
  MobileStructuredAgentStateArgs,
  MobileStructuredAgentState
} from './mobile-structured-agent-state-contract'
import {
  persistedStructuredChatRead,
  validStructuredChatRead
} from './mobile-chat-persisted-transcript'
import { useMobileChatCheckpoint } from './use-mobile-chat-checkpoint'
import { reduceMobileStructuredChatCheckpoint } from './mobile-structured-chat-checkpoint'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  AgentSessionHistoryResult,
  AgentSessionSubscribeEvent
} from '../../../src/shared/agent-session-wire'
import { AGENT_SESSION_HISTORY_MAX_LIMIT } from '../../../src/shared/agent-session-wire'
import { structuredAgentSessionHolderId } from '../../../src/shared/structured-agent-session-holder'
import {
  EMPTY_STRUCTURED_AGENT_SESSION,
  oldestStructuredAgentSessionCursor,
  type StructuredAgentSessionAction,
  type StructuredAgentSessionState
} from '../../../src/shared/structured-agent-session-reducer'
import { callAgentSession } from './mobile-structured-agent-session-rpc'
import { createMobileChatReadCache } from '../cache/mobile-chat-read-cache'
import {
  startMobileChatFirstRead,
  MOBILE_CHAT_FIRST_READ_TIMEOUT_MS
} from './mobile-chat-first-read'

const MAX_RETAINED_SESSION_STATES = 32
/** Bounded so a busy stream cannot turn one Load-earlier tap into an endless read chain. */
const OLDER_PAGE_ANCHOR_ATTEMPTS = 3
const routeReads = createMobileChatReadCache<StructuredAgentSessionState>('structured-chat', {
  valid: validStructuredChatRead,
  compact: persistedStructuredChatRead
})

function isSubscribeEvent(value: unknown): value is AgentSessionSubscribeEvent {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const type = (value as { type?: unknown }).type
  return type === 'snapshot' || type === 'batch' || type === 'reset' || type === 'end'
}

export function useMobileStructuredAgentState(
  args: MobileStructuredAgentStateArgs
): MobileStructuredAgentState {
  const { client, connected, enabled, sessionId, sessionKey } = args
  const cached = client && sessionKey ? routeReads.get(client, sessionKey) : null
  // Keep a bounded cache so offline tab switches select the right transcript
  // synchronously without growing for the lifetime of the app.
  const [sessionStates, setSessionStates] = useState<Map<string, StructuredAgentSessionState>>(
    () => new Map(cached && sessionKey ? [[sessionKey, cached]] : [])
  )
  const state =
    enabled && sessionKey
      ? (sessionStates.get(sessionKey) ?? cached ?? EMPTY_STRUCTURED_AGENT_SESSION)
      : EMPTY_STRUCTURED_AGENT_SESSION
  const [loadingOlder, setLoadingOlder] = useState(false)
  const stateRef = useRef(state)
  const sessionKeyRef = useRef(sessionKey)
  const streamGenerationRef = useRef(0)
  useLayoutEffect(() => {
    stateRef.current = state
    sessionKeyRef.current = sessionKey
  }, [sessionKey, state])

  const apply = useCallback(
    (action: StructuredAgentSessionAction) => {
      if (!sessionKey) {
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
        while (updated.size > MAX_RETAINED_SESSION_STATES) {
          const oldest = updated.keys().next().value
          if (oldest === undefined) {
            break
          }
          updated.delete(oldest)
        }
        return updated
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
        status: 'loading',
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
    if (!client || !sessionId || !enabled) {
      return
    }
    if (!connected) {
      // The cleanup above drops the dead hold and stream; keyed state keeps this
      // session's transcript visible while another tab can be selected.
      return
    }
    let ended = false
    let liveCheckpoint = false
    let hasBase = stateRef.current.epoch !== null
    const pendingBatches: AgentSessionSubscribeEvent[] = []
    const removedDuringRead = new Set<string>()
    void routeReads.restore(client, sessionKey ?? '').then((restored) => {
      if (ended || liveCheckpoint || !sessionKey || !restored || !Array.isArray(restored.items)) {
        return
      }
      setSessionStates((current) =>
        current.get(sessionKey)?.epoch
          ? current
          : new Map(current).set(sessionKey, { ...restored, fence: null, status: 'loading' })
      )
    })
    apply({ type: 'loading' })
    const holderId = structuredAgentSessionHolderId('mobile-chat')
    const held = callAgentSession(client, 'agentSession.hold', {
      sessionId,
      holderId
    })
    void held.catch(() => undefined)
    const finishFirstRead = startMobileChatFirstRead({
      read: () =>
        callAgentSession<AgentSessionHistoryResult>(
          client,
          'agentSession.history',
          { sessionId, direction: 'tail', limit: 40 },
          MOBILE_CHAT_FIRST_READ_TIMEOUT_MS
        ),
      apply: (result) => {
        if (!result.ok) {
          throw new Error('Chat history could not be read')
        }
        // A fallback page can display history; only the live stream grants write authority.
        liveCheckpoint = true
        const { fence: _fence, ...page } = result.page
        apply({
          type: 'history-page',
          page: {
            ...page,
            removedItemIds: [...new Set([...page.removedItemIds, ...removedDuringRead])]
          }
        })
        hasBase = true
        for (const event of pendingBatches) {
          apply({ type: 'event', event })
        }
        pendingBatches.length = 0
        removedDuringRead.clear()
      },
      fail: (error) => {
        liveCheckpoint = true
        hasBase = true
        pendingBatches.length = 0
        removedDuringRead.clear()
        apply({ type: 'error', message: error.message })
      }
    })
    const endStream = client.subscribe(
      'agentSession.subscribe',
      { sessionId, ...(stateRef.current.cursor ? { cursor: stateRef.current.cursor } : {}) },
      (raw) => {
        if (typeof raw === 'object' && raw !== null && 'type' in raw && raw.type === 'error') {
          apply({ type: 'error', message: 'message' in raw ? String(raw.message ?? '') : '' })
          return
        }
        if (isSubscribeEvent(raw)) {
          if (raw.type === 'batch') {
            if (!liveCheckpoint) {
              for (const id of raw.batch.removedItemIds) {
                removedDuringRead.add(id)
              }
              for (const item of raw.batch.items) {
                removedDuringRead.delete(item.itemId)
              }
            }
            if (!hasBase) {
              if (pendingBatches.length >= 128) {
                pendingBatches.length = 0
                removedDuringRead.clear()
                liveCheckpoint = true
                hasBase = true
                finishFirstRead()
                apply({
                  type: 'error',
                  message: 'Chat changed before history loaded. Reopen to retry.'
                })
              } else {
                pendingBatches.push(raw)
              }
              return
            }
          }
          if (raw.type === 'snapshot' || raw.type === 'reset') {
            hasBase = true
            pendingBatches.length = 0
            liveCheckpoint = true
            finishFirstRead()
          }
          apply({ type: 'event', event: raw })
        }
      }
    )
    return () => {
      ended = true
      finishFirstRead()
      endStream()
      const latest = stateRef.current
      if (sessionKey && sessionKeyRef.current === sessionKey && latest.status === 'ready') {
        routeReads.set(client, sessionKey, {
          ...latest,
          fence: null,
          status: 'loading',
          backgroundTasks: null,
          activity: null,
          hostClock: undefined
        })
      }
      void held
        .then(() =>
          callAgentSession(
            client,
            'agentSession.release',
            {
              sessionId,
              holderId
            },
            undefined,
            { failWhenDisconnected: true }
          ).catch(() => undefined)
        )
        .catch(() => undefined)
    }
  }, [apply, client, connected, enabled, sessionId, sessionKey])

  const loadEarlier = useCallback(() => {
    const current = stateRef.current
    if (!client || !sessionId || !sessionKey || loadingOlder || !current.hasOlder) {
      return
    }
    if (!oldestStructuredAgentSessionCursor(current)) {
      return
    }
    const requestSessionKey = sessionKey
    const requestGeneration = streamGenerationRef.current
    const isCurrentRead = (): boolean =>
      sessionKeyRef.current === requestSessionKey &&
      streamGenerationRef.current === requestGeneration
    setLoadingOlder(true)
    void (async () => {
      // A live batch can head-trim past the anchor mid-read, and the reducer drops that
      // page rather than leave a hole in the transcript. Re-anchor and retry.
      for (let attempt = 0; attempt < OLDER_PAGE_ANCHOR_ATTEMPTS; attempt += 1) {
        const cursor = oldestStructuredAgentSessionCursor(stateRef.current)
        if (!cursor || !isCurrentRead()) {
          return
        }
        const result = await callAgentSession<AgentSessionHistoryResult>(
          client,
          'agentSession.history',
          { sessionId, direction: 'before', cursor, limit: AGENT_SESSION_HISTORY_MAX_LIMIT }
        )
        if (!result.ok || !isCurrentRead()) {
          return
        }
        // The reducer drops a page whose anchor slid, so only an intact anchor lands.
        if (oldestStructuredAgentSessionCursor(stateRef.current)?.sequence === cursor.sequence) {
          apply({ type: 'older-page', requestedCursor: cursor, page: result.page })
          return
        }
      }
    })()
      .catch((error: unknown) => {
        if (isCurrentRead()) {
          apply({ type: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      })
      .finally(() => {
        if (isCurrentRead()) {
          setLoadingOlder(false)
        }
      })
  }, [apply, client, loadingOlder, sessionId, sessionKey])

  return { state, stateRef, loadingOlder, loadEarlier }
}
