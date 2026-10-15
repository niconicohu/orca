import { recordChatClientDiagnostic } from '../diagnostics/chat-runtime-diagnostics'
import { useMobileNativeChatHistory } from './use-mobile-native-chat-history'
import { useMobileNativeChatReadCheckpoint } from './use-mobile-native-chat-read-checkpoint'
import { createMobileNativeChatReadStream } from './mobile-native-chat-read-stream'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createNativeChatTranscriptRetention,
  encodeNativeChatTranscriptIdentity
} from '../../../src/shared/native-chat-transcript-retention'
import { createNativeChatMerger, replaceList } from '../../../src/shared/native-chat-merge'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { buildNativeChatSubscriptionId } from '../../../src/shared/native-chat-stream-unsubscribe'
import type { RpcClient } from '../transport/rpc-client'
import { mobileNativeChatRouteReads as routeReads } from './mobile-native-chat-route-cache'
import { startMobileNativeChatFirstRead } from './mobile-native-chat-first-read'
import {
  applyMobileNativeChatStreamFrame,
  type MobileNativeChatStreamFrame
} from './mobile-native-chat-stream-frame'

export type MobileNativeChatStatus =
  | 'idle'
  | 'loading'
  | 'waiting-session'
  /** The host answered, but the session has no transcript file yet — render the
   *  empty chat instead of a spinner while the read stays open. */
  | 'awaiting-transcript'
  | 'ready'
  | 'error'

export type MobileNativeChatSession = {
  messages: NativeChatMessage[]
  status: MobileNativeChatStatus
  /** True while `messages` cannot be trusted as this session's real history:
   *  the read is in flight, the transcript has not been written yet, OR the
   *  subscription effect has not yet caught up to a just-changed agent/session,
   *  so `messages`/`status` still describe the previous tab. Consumers that
   *  decide something from an empty transcript (the launch-draft seed) must
   *  wait for this to clear. */
  transcriptLoading: boolean
  error?: string
  syncing?: boolean
  initialSyncRevision?: number
  /** True when an older page may exist (the last read filled the window). */
  hasMore: boolean
  /** Whether an older-history page is currently loading. */
  loadingEarlier: boolean
  /** Grow the window to page in older history. */
  loadEarlier: () => void
}

// Small first page for a fast first paint; grows by a page as the user scrolls.
const INITIAL_LIMIT = 40

/** Subscribe to an agent's native-chat transcript over the paired connection.
 *  Reads a small recent window for a fast first paint, tails it for live turns,
 *  and pages in older history on demand. Read results replace the list (they are
 *  an ordered tail); live appends merge by id so order stays stable. */
export function useMobileNativeChatSession(args: {
  client: RpcClient | null
  /** Stable host/workspace source; unlike `client`, it survives manual reconnect. */
  sourceIdentity: string
  agent: string | null
  sessionId: string | null
  transcriptPath: string | null
}): MobileNativeChatSession {
  const { client, sourceIdentity, agent, sessionId, transcriptPath } = args
  const [messages, setMessages] = useState<NativeChatMessage[]>([])
  const identity = encodeNativeChatTranscriptIdentity([
    sourceIdentity,
    agent,
    sessionId,
    transcriptPath
  ])
  const cachedRead = client ? routeReads.get(client, identity) : null
  // Pre-read status is a pure function of the props, so derive it rather than
  // letting the effect write it a commit later.
  const initialStatus: MobileNativeChatStatus =
    !client || !agent ? 'idle' : !sessionId ? 'waiting-session' : 'loading'
  // Only the settled outcome is genuinely async, and it is tagged with the
  // identity it describes so a just-switched tab is never judged by the
  // previous tab's transcript — the effect that clears `messages` is passive
  // and lands a commit late.
  const [read, setRead] = useState<{
    client: RpcClient
    identity: string
    status: MobileNativeChatStatus
  } | null>(null)
  // Drop it the moment its subscription stops being the live one — identity and
  // client are the effect's only inputs, so together they catch every re-run.
  // Without this a toggle out of chat view and back (agent null, then the same
  // identity again) would resurface a settled 'ready' over an emptied list.
  let current = read
  if (current !== null && (current.identity !== identity || current.client !== client)) {
    current = null
    setRead(null)
  }
  // A settled read only counts while the props still call for one: losing the
  // client/agent/session means idle or waiting-session outranks it outright.
  const settled = initialStatus === 'loading' ? current : null
  const status = settled ? settled.status : initialStatus
  const [syncState, setSyncState] = useState<{
    identity: string
    syncing: boolean
    revision: number
  }>({ identity, syncing: false, revision: 0 })
  const [error, setError] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const loadingEarlierRef = useRef(false)
  const beforeOffsetRef = useRef<number | null>(null)
  // Stateful id-dedup merger: caches the id→index map so each live append frame
  // costs O(incoming), not O(existing+incoming) (#18). `replaceList` resets the
  // base (read / loadEarlier ordered tails); `applyAppend` folds live frames in.
  const mergerRef = useRef(createNativeChatMerger())
  const limitRef = useRef(INITIAL_LIMIT)
  // Tracks the live session so a late loadEarlier resolve can detect a swap.
  const sessionIdRef = useRef<string | null>(sessionId)
  sessionIdRef.current = sessionId
  const streamGenerationRef = useRef(0)
  // Whether this subscription already delivered its base snapshot; later
  // snapshots on the same subscription are reconnect replays, not fresh bases.
  const snapshotSeenRef = useRef(false)
  const [initialRetention] = useState(() => {
    const retention = createNativeChatTranscriptRetention()
    if (cachedRead) {
      retention.capture(identity, cachedRead.messages)
    }
    return retention
  })
  const transcriptRetentionRef = useRef(initialRetention)
  const settledReady = settled?.status === 'ready'
  const { readyReads, lastReadyReadRef } = useMobileNativeChatReadCheckpoint({
    client,
    identity,
    messages,
    hasMore,
    settledReady,
    beforeOffsetRef,
    limitRef,
    transcriptRetentionRef
  })

  // Replace the base list (read results are an ordered tail). Resets the merger
  // cache so the index is rebuilt once over the new base.
  const setList = useCallback((next: readonly NativeChatMessage[]) => {
    replaceList(mergerRef.current, next)
    setMessages(mergerRef.current.list)
  }, [])

  useEffect(() => {
    let cancelled = false
    // Why: disconnect/agent/session loss must invalidate a page request before
    // the early idle/waiting return can clear the visible source.
    streamGenerationRef.current += 1
    const inProcess = readyReads.current.get(identity)
    const retained = inProcess ?? (client ? routeReads.get(client, identity) : null)
    if (retained) {
      transcriptRetentionRef.current.capture(identity, retained.messages)
    }
    limitRef.current = retained?.limit ?? INITIAL_LIMIT
    loadingEarlierRef.current = false
    snapshotSeenRef.current = retained !== null
    setLoadingEarlier(false)
    setList(retained?.messages ?? [])
    if (retained && client) {
      setRead({ client, identity, status: 'ready' })
    }
    setSyncState((current) => ({
      identity,
      syncing: !inProcess && !!client && !!agent && !!sessionId,
      revision: current.identity === identity ? current.revision : 0
    }))
    setError(undefined)
    setHasMore(retained?.hasMore ?? false)
    beforeOffsetRef.current = retained?.beforeOffset ?? null
    if (!client || !agent) {
      return
    }
    if (!sessionId) {
      return
    }

    let firstDiagnosticFrame = true
    let firstSyncComplete = !!inProcess
    let finishFirstRead = (): void => {}
    const receive = (raw: unknown): void => {
      if (cancelled || !routeReads.allowed(client, identity)) {
        return
      }
      const frame = raw as MobileNativeChatStreamFrame
      if (firstDiagnosticFrame || frame.type === 'error') {
        firstDiagnosticFrame = false
        recordChatClientDiagnostic(client, sessionId, 'transcript-frame', {
          type: frame.type,
          messages:
            'messages' in frame && Array.isArray(frame.messages) ? frame.messages.length : 0,
          pending: 'pending' in frame && !!frame.pending
        })
      }
      const applied = applyMobileNativeChatStreamFrame({
        merger: mergerRef.current,
        frame,
        limit: limitRef.current,
        replaceSnapshot: !snapshotSeenRef.current
      })
      if (applied.kind === 'ignored') {
        return
      }
      if (applied.kind === 'error') {
        setRead({ client, identity, status: 'error' })
        setError(applied.error)
        return
      }
      if (frame.type === 'snapshot' && !applied.pending) {
        snapshotSeenRef.current = true
      }
      if (
        applied.windowReplaced ||
        (frame.type === 'snapshot' &&
          applied.beforeOffset !== undefined &&
          applied.beforeOffset !== beforeOffsetRef.current)
      ) {
        // A replay may merge history but still replace the byte cursor used by an in-flight page.
        streamGenerationRef.current += 1
        loadingEarlierRef.current = false
        setLoadingEarlier(false)
      }
      if (applied.windowReplaced) {
        limitRef.current = INITIAL_LIMIT
        beforeOffsetRef.current = applied.beforeOffset ?? null
        setHasMore(applied.hasMore ?? applied.messages.length >= INITIAL_LIMIT)
      }
      setMessages(applied.messages)
      if (!applied.pending && !firstSyncComplete) {
        firstSyncComplete = true
        setSyncState((current) => ({
          identity,
          syncing: false,
          revision: (current.identity === identity ? current.revision : 0) + 1
        }))
      }
      if (!applied.windowReplaced && applied.hasMore != null) {
        setHasMore(applied.hasMore)
      }
      if (!applied.windowReplaced && applied.beforeOffset != null) {
        beforeOffsetRef.current = applied.beforeOffset
      }
      if (applied.cursorInvalidated) {
        // Live trimming loses the byte anchor; the next page must use a growing-tail read.
        streamGenerationRef.current += 1
        loadingEarlierRef.current = false
        setLoadingEarlier(false)
        beforeOffsetRef.current = null
      }
      setError(undefined)
      setRead({ client, identity, status: applied.pending ? 'awaiting-transcript' : 'ready' })
    }
    const flow = createMobileNativeChatReadStream(receive, () => finishFirstRead())
    void routeReads.restore(client, identity).then((restored) => {
      if (cancelled || snapshotSeenRef.current || !restored || !Array.isArray(restored.messages)) {
        return
      }
      transcriptRetentionRef.current.capture(identity, restored.messages)
      setList(restored.messages)
      snapshotSeenRef.current = true
      setRead({ client, identity, status: 'ready' })
      limitRef.current = restored.limit
      beforeOffsetRef.current = restored.beforeOffset
      setHasMore(restored.hasMore)
    })
    finishFirstRead = inProcess
      ? () => {}
      : startMobileNativeChatFirstRead({
          client,
          agent,
          sessionId,
          transcriptPath,
          receive: flow.history
        })
    const unsubscribe = client.subscribe(
      'nativeChat.subscribe',
      {
        agent,
        sessionId,
        limit: INITIAL_LIMIT,
        subscriptionId: buildNativeChatSubscriptionId(agent, sessionId),
        capabilities: { transcriptPending: 1 },
        ...(transcriptPath ? { transcriptPath } : {})
      },
      flow.stream
    )

    return () => {
      cancelled = true
      finishFirstRead()
      const last = lastReadyReadRef.current
      if (last?.client === client && last.identity === identity) {
        routeReads.set(client, identity, last.value)
      }
      unsubscribe()
    }
  }, [client, agent, sessionId, transcriptPath, identity, setList])

  const loadEarlier = useMobileNativeChatHistory({
    client,
    agent,
    sessionId,
    transcriptPath,
    hasMore,
    setHasMore,
    setLoadingEarlier,
    setList,
    setHistoryError: setError,
    loadingEarlierRef,
    sessionIdRef,
    streamGenerationRef,
    limitRef,
    beforeOffsetRef,
    mergerRef
  })

  // Held for any unsettled read, not just an in-flight one: a stream error or a
  // dropped client would otherwise trade the conversation for an error card.
  const visibleMessages = transcriptRetentionRef.current.visible({
    identity,
    messages,
    settled: settledReady
  })

  return {
    // Withheld until the settled read belongs to this identity: the effect that
    // clears the previous tab's list is passive, so `messages` lags a commit.
    messages: visibleMessages,
    status,
    syncing: syncState.identity === identity && syncState.syncing,
    initialSyncRevision: syncState.identity === identity ? syncState.revision : 0,
    transcriptLoading:
      status === 'loading' ||
      status === 'awaiting-transcript' ||
      (syncState.identity === identity && syncState.syncing),
    error,
    hasMore,
    loadingEarlier,
    loadEarlier
  }
}
