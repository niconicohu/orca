import { createElement, useEffect, useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileSessionTab, Terminal } from './mobile-session-route-types'
import { useMobileCachedSessionTabs } from './use-mobile-cached-session-tabs'

const chat: MobileSessionTab = {
  type: 'agent-session',
  id: 'chat',
  title: 'Chat',
  sessionId: 'session',
  agent: 'codex',
  isActive: true
}
let renderer: ReactTestRenderer | null = null
let shown: { tabs: MobileSessionTab[]; active: string | null } | null = null
function Harness({
  client,
  seed = false,
  workspace = 'workspace'
}: {
  client: RpcClient
  seed?: boolean
  workspace?: string
}): null {
  const [tabs, setTabs] = useState<MobileSessionTab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [, setTerminals] = useState<Terminal[]>([])
  const [, setHandle] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (seed) {
      setTabs([chat])
      setActive('chat')
      setLoaded(true)
    }
  }, [seed])
  useMobileCachedSessionTabs({
    client,
    hostId: 'host',
    worktreeId: workspace,
    created: undefined,
    sessionTabs: tabs,
    activeSessionTabId: active,
    terminalsLoaded: loaded,
    setSessionTabs: setTabs,
    setActiveSessionTabId: setActive,
    setTerminals,
    setActiveHandle: setHandle
  })
  shown = { tabs, active }
  return null
}
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  shown = null
})
async function mount(client: RpcClient, seed = false, workspace?: string): Promise<void> {
  await act(async () => {
    renderer = create(createElement(Harness, { client, seed, workspace }))
  })
}

it('restores the selected chat before another tab response arrives', async () => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: connection identity only; no RPC is sent by this hook.
  const client = {} as RpcClient
  await mount(client, true)
  act(() => renderer?.unmount())
  await mount(client)
  expect(shown).toEqual({ tabs: [chat], active: 'chat' })
})

it('does not restore another workspace or a replacement connection', async () => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: connection identity only.
  const client = {} as RpcClient
  await mount(client, true)
  act(() => renderer?.unmount())
  await mount(client, false, 'other')
  expect(shown?.tabs).toEqual([])
  act(() => renderer?.unmount())
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: distinct connection identity only.
  await mount({} as RpcClient)
  expect(shown?.tabs).toEqual([])
})
