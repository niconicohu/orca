import type { RpcClient } from './rpc-client'
import type { MobileWebBundleManifestRead } from './mobile-web-bundle-reply-schemas'
import { mobileWebBundleManifestRead } from './mobile-web-bundle-operations'
import { runRpcOperation } from './rpc-operation'

type ManifestRead = {
  generation: number | undefined
  connectedAt: number | null
  promise: Promise<MobileWebBundleManifestRead>
  stop: () => void
}

const reads = new WeakMap<RpcClient, ManifestRead>()

export function forgetMobileWebBundleManifest(client: RpcClient): void {
  const read = reads.get(client)
  reads.delete(client)
  read?.stop()
}

// A host serves one immutable install per connection; never carry its manifest through recovery or migration.
export function readMobileWebBundleManifest(
  client: RpcClient
): Promise<MobileWebBundleManifestRead> {
  const generation = client.getGeneration?.()
  const connectedAt = client.getLastConnectedAt()
  const current = reads.get(client)
  if (
    current &&
    client.getState() === 'connected' &&
    current.generation === generation &&
    current.connectedAt === connectedAt
  ) {
    return current.promise
  }
  forgetMobileWebBundleManifest(client)
  const promise = runRpcOperation(client, mobileWebBundleManifestRead, null).then(
    (result) => result.manifest
  )
  if (client.getState() !== 'connected') {
    return promise
  }
  const read: ManifestRead = { generation, connectedAt, promise, stop: () => {} }
  reads.set(client, read)
  const forgetCurrent = () => {
    if (reads.get(client) === read) {
      forgetMobileWebBundleManifest(client)
    }
  }
  read.stop = client.onStateChange((state) => {
    if (state !== 'connected') {
      forgetCurrent()
    }
  })
  if (reads.get(client) !== read) {
    read.stop()
  }
  void promise.catch(forgetCurrent)
  return promise
}
