import { describe, expect, it, vi } from 'vitest'
import { createFakeRpcClient, rpcSuccess } from '../mobile-web-shell/bridge-host-test-fakes'
import { STRUCTURED_AGENT_SESSION_REGENERATE_NAME_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import { structuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'
import type { MobileSessionTab } from './mobile-session-route-types'
import { getMobileChatNamingActions } from './mobile-native-chat-naming-actions'

vi.mock('lucide-react-native', () => ({ RefreshCw: 'RefreshCw' }))

function fixture(capabilities = [STRUCTURED_AGENT_SESSION_REGENERATE_NAME_RUNTIME_CAPABILITY]) {
  let generation = 1
  const client = createFakeRpcClient({ getGeneration: () => generation })
  const tab: Extract<MobileSessionTab, { type: 'agent-session' }> = {
    type: 'agent-session',
    id: 'tab',
    title: 'Original query',
    sessionId: 'chat',
    agent: 'codex',
    isActive: true
  }
  const controller = {
    client,
    clientRef: { current: client },
    sessionTabsRef: { current: [tab] },
    agentSessionHostSupport: structuredAgentSessionHostSupport(capabilities),
    showToast: vi.fn()
  }
  const onDismiss = vi.fn()
  const actions = getMobileChatNamingActions({ controller, tab, onDismiss })
  return { client, controller, actions, onDismiss, reconnect: () => generation++ }
}

describe('mobile chat name retry', () => {
  it('offers a retry without retained failure state and requests the selected session', async () => {
    const { actions, client, controller, onDismiss } = fixture()
    expect(actions[0].label).toBe('Regenerate name')
    const pending = actions[0].onPress()
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(client.requests[0].method).toBe('agentSession.regenerateName')
    expect(client.requests[0].args[1]).toEqual({ sessionId: 'chat' })
    client.requests[0].resolve(rpcSuccess('request', { accepted: true }))
    await pending
    expect(controller.showToast).toHaveBeenCalledWith('Chat name generation requested.')
  })

  it('hides the action on older hosts', () => {
    expect(fixture([]).actions).toEqual([])
  })

  it.each(['client', 'generation', 'tab'])('does not act on a stale %s', async (changed) => {
    const { actions, client, controller, reconnect } = fixture()
    if (changed === 'client') {
      controller.clientRef.current = createFakeRpcClient()
    } else if (changed === 'generation') {
      reconnect()
    } else {
      controller.sessionTabsRef.current = []
    }
    await actions[0].onPress()
    expect(client.requests).toHaveLength(0)
  })

  it('does not report success when the host refuses', async () => {
    const { actions, client, controller } = fixture()
    const pending = actions[0].onPress()
    client.requests[0].resolve(rpcSuccess('request', { accepted: false }))
    await pending
    expect(controller.showToast).toHaveBeenCalledWith('Could not request a new chat name.')
  })

  it('reports a transport error without replaying it', async () => {
    const { actions, client, controller } = fixture()
    const pending = actions[0].onPress()
    client.requests[0].reject(new Error('Disconnected'))
    await pending
    expect(client.requests).toHaveLength(1)
    expect(controller.showToast).toHaveBeenCalledWith(
      'Chat name request failed. Check the connection before retrying.'
    )
  })

  it('ignores feedback after changing hosts', async () => {
    const { actions, client, controller } = fixture()
    const pending = actions[0].onPress()
    controller.clientRef.current = createFakeRpcClient()
    client.requests[0].resolve(rpcSuccess('request', { accepted: true }))
    await pending
    expect(controller.showToast).not.toHaveBeenCalled()
  })
})
