import { beforeEach, expect, it, vi } from 'vitest'
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
  chatCheckpointStore,
  forgetHostChatCheckpoints
} from '../cache/mobile-chat-checkpoint-registry'
import { createMobileChatReadCache } from '../cache/mobile-chat-read-cache'
import {
  reconcileMobileChatCheckpoints,
  reconcileHostChatWorkspaces
} from './mobile-chat-checkpoint-cleanup'
const host = { id: 'host', publicKeyB64: 'public', deviceToken: 'device' }
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: cache tests use only object identity.
const client = {} as RpcClient
beforeEach(() => registerChatCheckpointClient(client, host))
it('restores a persistent checkpoint with a recreated logical client and clears removed sessions', async () => {
  const cache = createMobileChatReadCache<string>('native-chat')
  const key = identity([identity(['host', 'workspace']), 'codex', 'session', null])
  cache.set(client, key, 'history')
  await chatCheckpointStore.settled()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: cache identity only.
  const reopened = {} as RpcClient
  registerChatCheckpointClient(reopened, host)
  expect(await cache.restore(reopened, key)).toBe('history')
  reconcileMobileChatCheckpoints(client, 'host', 'workspace', [])
  expect(cache.get(client, key)).toBeNull()
  cache.set(client, key, 'late history')
  await chatCheckpointStore.settled()
  expect(await cache.restore(reopened, key)).toBeNull()
})
it('keeps another workspace and cleans all namespaces on host removal', async () => {
  const cache = createMobileChatReadCache<string>('structured-chat')
  const key = identity([identity(['host', 'other']), 'codex', 'kept'])
  cache.set(client, key, 'kept history')
  await chatCheckpointStore.settled()
  reconcileMobileChatCheckpoints(client, 'host', 'workspace', [])
  expect(cache.get(client, key)).toBe('kept history')
  await forgetHostChatCheckpoints('host')
  expect(cache.get(client, key)).toBeNull()
  expect(await cache.restore(client, key)).toBeNull()
})
it('does not inherit history when a pairing credential changes', async () => {
  const cache = createMobileChatReadCache<string>('native-chat')
  cache.set(client, 'key', 'private')
  await chatCheckpointStore.settled()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: cache identity only.
  const newPairing = {} as RpcClient
  registerChatCheckpointClient(newPairing, { ...host, deviceToken: 'other-device' })
  expect(await cache.restore(newPairing, 'key')).toBeNull()
})

it('reclaims a remotely removed workspace but preserves the floating workspace', async () => {
  const cache = createMobileChatReadCache<string>('native-chat')
  const removed = identity([identity(['host', 'gone']), 'codex', 's'])
  const floating = identity([identity(['host', 'global-floating-terminal']), 'codex', 's'])
  cache.set(client, removed, 'deleted workspace')
  cache.set(client, floating, 'floating history')
  await chatCheckpointStore.settled()
  reconcileHostChatWorkspaces(client, [])
  await chatCheckpointStore.settled()
  expect(cache.get(client, removed)).toBeNull()
  expect(cache.get(client, floating)).toBe('floating history')
})
