import type { RpcClient } from '../transport/rpc-client'
import type { AgentSessionSubscribeEvent } from '../../../src/shared/agent-session-wire'
import { structuredAgentSessionHolderId } from '../../../src/shared/structured-agent-session-holder'
import { readMobileStructuredChatHistory } from './mobile-structured-chat-history-read'
import { applyMobileRecentPage } from './mobile-structured-chat-recent-page'
import { reduceMobileStructuredChatCheckpoint } from './mobile-structured-chat-checkpoint'
import { callAgentSession } from './mobile-structured-agent-session-rpc'
import { startMobileChatFirstRead } from './mobile-chat-first-read'
import { mobileStructuredChatReads as routeReads } from './mobile-structured-chat-route-cache'
import type { MobileStructuredChatState } from './mobile-structured-history-window'
function isSubscribeEvent(value: unknown): value is AgentSessionSubscribeEvent {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const type = (value as { type?: unknown }).type
  return type === 'snapshot' || type === 'batch' || type === 'reset' || type === 'end'
}

export function subscribeMobileStructuredChat({
  client,
  sessionId,
  sessionKey,
  wasReady,
  snapshotLimit,
  getCurrent,
  markReady,
  update
}: {
  client: RpcClient
  sessionId: string
  sessionKey: string
  snapshotLimit?: boolean
  wasReady: boolean
  getCurrent: () => MobileStructuredChatState | null
  markReady: () => void
  update: (transform: (previous: MobileStructuredChatState) => MobileStructuredChatState) => void
}): () => void {
  let ended = false
  let reading = !wasReady
  let pending: AgentSessionSubscribeEvent[] = []
  if (wasReady) {
    update((previous) => ({ ...previous, fence: null }))
  }
  if (!wasReady) {
    update((previous) => ({
      ...previous,
      fence: null,
      syncing: true,
      status: previous.items.length ? 'ready' : 'loading'
    }))
    void routeReads.restore(client, sessionKey ?? '').then((restored) => {
      if (ended || !reading || !restored) {
        return
      }
      update((previous) =>
        previous.items.length
          ? previous
          : { ...restored, fence: previous.fence, status: 'ready', syncing: true }
      )
    })
  }
  const holderId = structuredAgentSessionHolderId('mobile-chat')
  const held = callAgentSession(client, 'agentSession.hold', { sessionId, holderId })
  void held.catch(() => undefined)
  const complete = (
    page: import('../../../src/shared/agent-session-wire').AgentSessionHistoryPage,
    snapshot?: Extract<AgentSessionSubscribeEvent, { type: 'snapshot' | 'reset' }>
  ) => {
    if (!reading || ended || (sessionKey && !routeReads.allowed(client, sessionKey))) {
      return
    }
    reading = false
    const buffered = pending
    pending = []
    markReady()
    update((previous) => {
      let next = applyMobileRecentPage(previous, page)
      if (snapshot) {
        next = {
          ...next,
          fence: snapshot.fence,
          activity: snapshot.activity,
          commands: snapshot.commands,
          backgroundTasks: snapshot.backgroundTasks ?? next.backgroundTasks
        }
      }
      for (const event of buffered) {
        next = reduceMobileStructuredChatCheckpoint(next, { type: 'event', event }, Date.now())
      }
      return { ...next, syncing: false, status: 'ready' }
    })
  }
  const finishFirstRead = wasReady
    ? () => {}
    : startMobileChatFirstRead({
        read: () => readMobileStructuredChatHistory(client, sessionId),
        apply: (result) => {
          if (!result.ok) {
            throw new Error('Chat history could not be read')
          }
          complete(result.page)
        },
        fail: (error) => {
          if (!reading) {
            return
          }
          reading = false
          pending = []
          update((previous) => ({
            ...previous,
            syncing: false,
            status: previous.items.length ? 'ready' : 'error',
            error: error.message
          }))
        }
      })
  const endStream = client.subscribe(
    'agentSession.subscribe',
    {
      sessionId,
      ...(snapshotLimit ? { snapshotLimit: 40 } : {}),
      ...(wasReady && getCurrent()?.cursor ? { cursor: getCurrent()?.cursor } : {})
    },
    (raw) => {
      if (ended) {
        return
      }
      if (isSubscribeEvent(raw)) {
        if (reading && (raw.type === 'snapshot' || raw.type === 'reset')) {
          const items = raw.page.items.slice(-40)
          const first = items[0]
          const page = {
            ...raw.page,
            items,
            hasOlder: raw.page.hasOlder || items.length < raw.page.items.length,
            window: {
              ...raw.page.window,
              oldest: first ? { epoch: raw.page.epoch, sequence: first.sequence } : null,
              nextCursor: first
                ? { epoch: raw.page.epoch, sequence: first.sequence }
                : raw.page.window.nextCursor
            }
          }
          complete(page, raw)
        } else if (reading) {
          pending.push(raw)
          if (pending.length > 128) {
            finishFirstRead()
            reading = false
            pending = []
            update((previous) => ({
              ...previous,
              syncing: false,
              error: 'Chat changed before history loaded. Reopen to retry.'
            }))
          }
        } else {
          update((previous) =>
            reduceMobileStructuredChatCheckpoint(
              previous,
              { type: 'event', event: raw },
              Date.now()
            )
          )
        }
      } else if (typeof raw === 'object' && raw !== null && 'type' in raw && raw.type === 'error') {
        update((previous) => ({
          ...previous,
          syncing: false,
          error: 'message' in raw ? String(raw.message) : 'Chat stream failed'
        }))
      }
    }
  )
  return () => {
    ended = true
    finishFirstRead()
    endStream()
    const latest = getCurrent()
    if (latest?.status === 'ready') {
      routeReads.set(client, sessionKey, {
        ...latest,
        fence: null,
        status: 'ready',
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
}
