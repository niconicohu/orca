import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it } from 'vitest'
import { createFakeRpcClient } from '../mobile-web-shell/bridge-host-test-fakes'
import {
  bindMobileAgentLaunchFeedback,
  mobileAgentLaunchFeedback,
  mobileAgentLaunchFeedbackScope,
  observeMobileAgentLaunchFeedback,
  useMobileAgentLaunchFeedback
} from './mobile-agent-launch-feedback'

let tree: ReactTestRenderer | undefined
afterEach(() => act(() => tree?.unmount()))

it('shows local progress immediately, respects a different tab, and settles on host publication', () => {
  const client = createFakeRpcClient()
  const scope = mobileAgentLaunchFeedbackScope(client, 'workspace')
  let selected: string | null = null
  function Harness({ active }: { active: string }) {
    selected = useMobileAgentLaunchFeedback(client, 'workspace', active).selected?.id ?? null
    return null
  }
  act(() => {
    tree = create(createElement(Harness, { active: 'old' }))
  })
  act(() => mobileAgentLaunchFeedback.begin(scope, 'request', 'Codex', 'old'))
  expect(selected).toBe('request')
  expect(client.requests).toEqual([])
  act(() => tree!.update(createElement(Harness, { active: 'other' })))
  expect(selected).toBeNull()
  act(() => tree!.update(createElement(Harness, { active: 'old' })))
  expect(selected).toBeNull()
  bindMobileAgentLaunchFeedback(client, 'workspace', 'request', { sessionId: 'codex-session' })
  act(() =>
    observeMobileAgentLaunchFeedback(client, 'workspace', [
      {
        type: 'agent-session',
        id: 'host-tab',
        title: 'Codex',
        isActive: false,
        agent: 'codex',
        sessionId: 'codex-session'
      }
    ])
  )
  expect(mobileAgentLaunchFeedback.read(scope).entries).toEqual([])
})

it('matches the host Terminal fallback without creating a sibling Chat', () => {
  const client = createFakeRpcClient()
  const scope = mobileAgentLaunchFeedbackScope(client, 'workspace')
  mobileAgentLaunchFeedback.begin(scope, 'request', 'Codex', 'old')
  bindMobileAgentLaunchFeedback(client, 'workspace', 'request', { handle: 'pty' })
  observeMobileAgentLaunchFeedback(client, 'workspace', [
    {
      type: 'terminal',
      id: 'host-tab',
      parentTabId: 'parent',
      title: 'Codex',
      isActive: false,
      terminal: 'pty'
    }
  ])
  expect(mobileAgentLaunchFeedback.read(scope).entries).toEqual([])
  expect(client.requests).toEqual([])
})
