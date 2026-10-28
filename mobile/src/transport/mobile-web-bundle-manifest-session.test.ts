import { describe, expect, it } from 'vitest'
import { computeMobileWebBundleId } from '../../../src/shared/mobile-web-bundle/manifest-contract'
import { createFakeRpcClient, rpcSuccess } from '../mobile-web-shell/bridge-host-test-fakes'
import type { MobileWebBundleManifestRead } from './mobile-web-bundle-reply-schemas'
import {
  forgetMobileWebBundleManifest,
  readMobileWebBundleManifest
} from './mobile-web-bundle-manifest-session'
import type { ConnectionState } from './types'

const ASSETS = [
  { path: 'index.html', sha256: 'a'.repeat(64), byteLength: 1, contentType: 'text/html' }
]
const MANIFEST: MobileWebBundleManifestRead = {
  schemaVersion: 1,
  buildId: computeMobileWebBundleId(ASSETS),
  runtimeProtocolVersion: 5,
  minCompatibleRuntimeProtocolVersion: 2,
  pageVersion: 1,
  entrypoint: 'index.html',
  totalBytes: 1,
  assets: ASSETS,
  routes: [{ pathname: '/h/[hostId]', grants: ['navigate'] }]
}

function fixture() {
  let state: ConnectionState = 'connected'
  let generation = 1
  const client = createFakeRpcClient({
    getState: () => state,
    getGeneration: () => generation,
    getLastConnectedAt: () => 1
  })
  return {
    client,
    move: () => {
      generation += 1
    },
    state: (next: ConnectionState) => {
      state = next
      client.pushState(next)
    }
  }
}

function answer(
  client: ReturnType<typeof fixture>['client'],
  index = 0,
  manifest = MANIFEST
): void {
  const request = client.requests[index]
  if (!request) {
    throw new Error('Expected the physical manifest request')
  }
  request.resolve(rpcSuccess(String(index), { manifest, chunkBytes: 1024 }))
}

describe('the mobile web manifest within an authenticated connection', () => {
  it('shares an in-flight read and its validated result across page consumers', async () => {
    const { client } = fixture()
    const first = readMobileWebBundleManifest(client)
    const concurrent = readMobileWebBundleManifest(client)
    expect(concurrent).toBe(first)
    expect(client.requests).toHaveLength(1)
    expect(client.requests[0]?.method).toBe('mobileWeb.bundle.manifest')
    answer(client)
    await expect(first).resolves.toEqual(MANIFEST)
    expect(readMobileWebBundleManifest(client)).toBe(first)
    expect(client.stateListeners()).toBe(1)
  })

  it('reads new routes after reconnect even when assets and the connection timestamp match', async () => {
    const f = fixture()
    const first = readMobileWebBundleManifest(f.client)
    answer(f.client)
    await first
    f.state('reconnecting')
    expect(f.client.stateListeners()).toBe(0)
    f.state('connected')

    const next = readMobileWebBundleManifest(f.client)
    const changed = { ...MANIFEST, routes: [{ pathname: '/h/[hostId]', grants: ['storage'] }] }
    answer(f.client, 1, changed)
    await expect(next).resolves.toEqual(changed)
    expect(f.client.requests).toHaveLength(2)
    expect(f.client.stateListeners()).toBe(1)
  })

  it('rechecks after logical migration without a connection-state edge', async () => {
    const f = fixture()
    const first = readMobileWebBundleManifest(f.client)
    answer(f.client)
    await first
    f.move()
    const migrated = readMobileWebBundleManifest(f.client)
    expect(migrated).not.toBe(first)
    answer(f.client, 1)
    await migrated
    expect(f.client.stateListeners()).toBe(1)
  })

  it('honors a new authentication timestamp on clients without a logical generation', async () => {
    let timestamp = 1
    const client = createFakeRpcClient({ getLastConnectedAt: () => timestamp })
    const first = readMobileWebBundleManifest(client)
    answer(client)
    await first
    timestamp = 2
    const next = readMobileWebBundleManifest(client)
    expect(next).not.toBe(first)
    answer(client, 1)
    await next
  })

  it('forces a new read when the user explicitly retries', async () => {
    const { client } = fixture()
    const first = readMobileWebBundleManifest(client)
    answer(client)
    await first
    forgetMobileWebBundleManifest(client)
    expect(client.stateListeners()).toBe(0)
    const retry = readMobileWebBundleManifest(client)
    expect(retry).not.toBe(first)
    answer(client, 1)
    await retry
  })

  it('never reuses an incompatible manifest response', async () => {
    const { client } = fixture()
    const invalid = readMobileWebBundleManifest(client)
    answer(client, 0, { ...MANIFEST, buildId: 'invalid' })
    await expect(invalid).rejects.toThrow()
    expect(client.stateListeners()).toBe(0)
    const retry = readMobileWebBundleManifest(client)
    answer(client, 1)
    await expect(retry).resolves.toEqual(MANIFEST)
  })

  it('does not let an old read failure erase a replacement connection result', async () => {
    const f = fixture()
    const old = readMobileWebBundleManifest(f.client)
    const failed = expect(old).rejects.toThrow('old socket closed')
    f.state('reconnecting')
    f.state('connected')
    const next = readMobileWebBundleManifest(f.client)
    answer(f.client, 1)
    await next
    f.client.requests[0]?.reject(new Error('old socket closed'))
    await failed
    expect(readMobileWebBundleManifest(f.client)).toBe(next)
    expect(f.client.requests).toHaveLength(2)
  })

  it('keeps different host clients separate', async () => {
    const a = fixture().client
    const b = fixture().client
    const first = readMobileWebBundleManifest(a)
    const other = readMobileWebBundleManifest(b)
    expect(first).not.toBe(other)
    answer(a)
    answer(b)
    await Promise.all([first, other])
    expect(a.requests).toHaveLength(1)
    expect(b.requests).toHaveLength(1)
  })
})
