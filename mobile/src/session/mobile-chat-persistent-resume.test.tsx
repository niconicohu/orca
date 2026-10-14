import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { encodeNativeChatTranscriptIdentity as identity } from '../../../src/shared/native-chat-transcript-retention'
const disk = vi.hoisted(() => new Map<string, string>())
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      disk.set(key, value)
    },
    removeItem: async (key: string) => {
      disk.delete(key)
    },
    getAllKeys: async () => [...disk.keys()]
  }
}))
import {
  registerChatCheckpointClient,
  chatCheckpointStore
} from '../cache/mobile-chat-checkpoint-registry'
import { mobileNativeChatRouteReads } from './mobile-native-chat-route-cache'
import { useMobileNativeChatSession } from './use-mobile-native-chat-session'
const host = { id: 'host', publicKeyB64: 'public', deviceToken: 'device' }
const source = identity(['host', 'workspace'])
let renderer: ReactTestRenderer | null = null
let value: ReturnType<typeof useMobileNativeChatSession> | null = null
function Harness({ client }: { client: RpcClient }) {
  value = useMobileNativeChatSession({
    client,
    sourceIdentity: source,
    agent: 'codex',
    sessionId: 's',
    transcriptPath: null
  })
  return null
}
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.useRealTimers()
})
it('restores persisted messages into the actual hook under a new connection before network history returns', async () => {
  vi.useFakeTimers()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: seed client is used only as cache identity.
  const seed = {} as RpcClient
  registerChatCheckpointClient(seed, host)
  const messages = [
    {
      id: 'cached',
      role: 'assistant' as const,
      source: 'transcript' as const,
      timestamp: 1,
      blocks: [{ type: 'text' as const, text: 'retained after restart' }]
    }
  ]
  mobileNativeChatRouteReads.set(seed, identity([source, 'codex', 's', null]), {
    messages,
    limit: 40,
    hasMore: false,
    beforeOffset: 0
  })
  await chatCheckpointStore.settled()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only supplied RPC members are used by this hook.
  const client = {
    sendRequest: vi.fn(() => new Promise<never>(() => {})),
    subscribe: vi.fn(() => () => {})
  } as unknown as RpcClient
  registerChatCheckpointClient(client, host)
  await act(async () => {
    renderer = create(createElement(Harness, { client }))
  })
  expect(value?.messages).toEqual(messages)
  expect(value?.transcriptLoading).toBe(true)
  expect(client.subscribe).toHaveBeenCalledOnce()
})
