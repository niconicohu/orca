import { mergeMobileOlderTranscript } from './mobile-native-chat-history-merge'
import { useCallback, type MutableRefObject } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import type { NativeChatMerger } from '../../../src/shared/native-chat-merge'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { nativeChatSessionPageRead } from './mobile-session-read-operations'
const PAGE = 60
const MAX_MESSAGES = 2000
type ReadSessionResult =
  | { messages: NativeChatMessage[]; hasMore?: boolean; beforeOffset?: number }
  | { error: string }
export function useMobileNativeChatHistory(args: {
  client: RpcClient | null
  agent: string | null
  sessionId: string | null
  transcriptPath: string | null
  hasMore: boolean
  setHasMore: (value: boolean) => void
  setLoadingEarlier: (value: boolean) => void
  setHistoryError: (message: string | undefined) => void
  setList: (next: readonly NativeChatMessage[]) => void
  loadingEarlierRef: MutableRefObject<boolean>
  sessionIdRef: MutableRefObject<string | null>
  streamGenerationRef: MutableRefObject<number>
  limitRef: MutableRefObject<number>
  beforeOffsetRef: MutableRefObject<number | null>
  mergerRef: MutableRefObject<NativeChatMerger>
}): () => void {
  const {
    client,
    agent,
    sessionId,
    transcriptPath,
    hasMore,
    setHasMore,
    setLoadingEarlier,
    setList,
    setHistoryError,
    loadingEarlierRef,
    sessionIdRef,
    streamGenerationRef,
    limitRef,
    beforeOffsetRef,
    mergerRef
  } = args
  return useCallback(() => {
    if (!client || !agent || !sessionId || loadingEarlierRef.current || !hasMore) {
      return
    }
    // Capture the session this page belongs to; a swap underneath us must not
    // apply this read's result onto the new session (mirrors desktop's guard).
    const requestSessionId = sessionId
    const requestGeneration = streamGenerationRef.current
    const held = Math.max(limitRef.current, mergerRef.current.list.length)
    const nextLimit = Math.min(held + PAGE, MAX_MESSAGES)
    const pageLimit = nextLimit - held
    if (pageLimit <= 0) {
      setHasMore(false)
      return
    }
    const requestedMessages = new Map(
      mergerRef.current.list.map((message) => [message.id, message])
    )
    const beforeOffset = beforeOffsetRef.current
    loadingEarlierRef.current = true
    setLoadingEarlier(true)
    setHistoryError(undefined)
    void (async () => {
      try {
        const response = await nativeChatSessionPageRead.request(client, {
          agent,
          sessionId,
          limit: beforeOffset === null ? nextLimit : pageLimit,
          ...(beforeOffset === null ? {} : { beforeOffset }),
          ...(transcriptPath ? { transcriptPath } : {})
        })
        const accepted = nativeChatSessionPageRead.interpret(response)
        if (!accepted.accepted) {
          throw new Error('Earlier history could not be read. Try again.')
        }
        // The read is `z.unknown()` because the reply is a union, so an accepted success can still
        // carry no result at all, or null; `'error' in` throws on either.
        const payload = accepted.value
        if (payload === null || typeof payload !== 'object') {
          return
        }
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: main cast this payload unread; the reader hands back the same result.
        const result = payload as ReadSessionResult
        if ('error' in result) {
          throw new Error(result.error)
        }
        // Drop a stale resolve from a session that swapped underneath us.
        if (
          sessionIdRef.current !== requestSessionId ||
          streamGenerationRef.current !== requestGeneration
        ) {
          return
        }
        limitRef.current = nextLimit
        if (beforeOffset !== null && result.beforeOffset != null) {
          beforeOffsetRef.current = result.beforeOffset
          setList(
            mergeMobileOlderTranscript(result.messages, mergerRef.current.list, requestedMessages)
          )
          setHasMore(
            nextLimit < MAX_MESSAGES && (result.hasMore ?? result.messages.length >= pageLimit)
          )
        } else {
          // Older runtimes ignore the cursor and return the growing tail.
          setList(
            mergeMobileOlderTranscript(
              result.messages,
              mergerRef.current.list,
              requestedMessages,
              true
            )
          )
          setHasMore(result.messages.length >= nextLimit)
        }
      } catch (error) {
        if (
          sessionIdRef.current === requestSessionId &&
          streamGenerationRef.current === requestGeneration
        ) {
          setHistoryError(
            error instanceof Error ? error.message : 'Earlier history could not be read. Try again.'
          )
        }
      } finally {
        // A late page from a prior tab must not unlock the current tab's request.
        if (
          sessionIdRef.current === requestSessionId &&
          streamGenerationRef.current === requestGeneration
        ) {
          loadingEarlierRef.current = false
          setLoadingEarlier(false)
        }
      }
    })()
  }, [client, agent, sessionId, transcriptPath, hasMore, setList])
}
