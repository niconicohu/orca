import { useEffect, useRef, type RefObject } from 'react'
import { useMobileChatCheckpoint } from './use-mobile-chat-checkpoint'
import { boundMobileChatEntries } from '../cache/bound-mobile-chat-entries'
import {
  mobileNativeChatRouteReads as routeReads,
  type CachedMobileNativeChatRead
} from './mobile-native-chat-route-cache'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { RpcClient } from '../transport/rpc-client'
import { createNativeChatTranscriptRetention } from '../../../src/shared/native-chat-transcript-retention'
export function useMobileNativeChatReadCheckpoint({
  client,
  identity,
  messages,
  hasMore,
  settledReady,
  beforeOffsetRef,
  limitRef,
  transcriptRetentionRef
}: {
  client: RpcClient | null
  identity: string
  messages: NativeChatMessage[]
  hasMore: boolean
  settledReady: boolean
  beforeOffsetRef: RefObject<number | null>
  limitRef: RefObject<number>
  transcriptRetentionRef: RefObject<ReturnType<typeof createNativeChatTranscriptRetention>>
}) {
  const readyReads = useRef(new Map<string, CachedMobileNativeChatRead>())
  const lastReadyReadRef = useRef<{
    client: RpcClient
    identity: string
    value: CachedMobileNativeChatRead
  } | null>(null)
  const owningClient = useRef(client)
  if (owningClient.current !== client) {
    readyReads.current.clear()
    lastReadyReadRef.current = null
    owningClient.current = client
  }
  useEffect(() => {
    if (settledReady) {
      transcriptRetentionRef.current.capture(identity, messages)
      if (client) {
        readyReads.current.delete(identity)
        readyReads.current.set(identity, {
          messages,
          hasMore,
          beforeOffset: beforeOffsetRef.current,
          limit: limitRef.current
        })
        boundMobileChatEntries(readyReads.current, identity)
        lastReadyReadRef.current = {
          client,
          identity,
          value: {
            messages,
            hasMore,
            beforeOffset: beforeOffsetRef.current,
            limit: limitRef.current
          }
        }
      }
    }
  }, [client, identity, messages, hasMore, settledReady])

  useEffect(
    () =>
      routeReads.subscribeInvalidation(() => {
        if (!client) {
          return
        }
        for (const key of readyReads.current.keys()) {
          if (!routeReads.allowed(client, key)) {
            readyReads.current.delete(key)
          }
        }
        if (
          lastReadyReadRef.current &&
          !routeReads.allowed(client, lastReadyReadRef.current.identity)
        ) {
          lastReadyReadRef.current = null
        }
      }),
    [client]
  )

  useMobileChatCheckpoint(() => {
    const last = lastReadyReadRef.current
    if (last) {
      routeReads.set(last.client, last.identity, last.value)
    }
  })

  return { readyReads, lastReadyReadRef }
}
