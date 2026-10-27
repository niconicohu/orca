import { beforeEach, expect, it, vi } from 'vitest'
import { openMobileSideChat } from './mobile-native-chat-side-chat'
import { createMobileStructuredAgentSession } from './mobile-structured-agent-session-launch'
import type { PendingSessionSelection } from './pending-session-selection'
import type { MobileSessionTab } from './mobile-session-route-types'
import { createFakeRpcClient } from '../mobile-web-shell/bridge-host-test-fakes'

vi.mock('./mobile-structured-agent-session-launch', () => ({
  createMobileStructuredAgentSession: vi.fn()
}))

beforeEach(() => vi.clearAllMocks())

function navigation(tabs: MobileSessionTab[] = []) {
  const pendingSelectionRef: { current: PendingSessionSelection | null } = { current: null }
  return {
    pendingSelectionRef,
    sessionTabsRef: { current: tabs },
    switchSessionTabRef: { current: vi.fn() }
  }
}

it('selects a side chat already published before its create reply', async () => {
  const tab: MobileSessionTab = {
    type: 'agent-session',
    id: 'child-tab',
    sessionId: 'codex_child_123',
    agent: 'codex',
    title: 'Side chat',
    isActive: false
  }
  const nav = navigation([tab])
  vi.mocked(createMobileStructuredAgentSession).mockResolvedValue({
    kind: 'created',
    sessionId: tab.sessionId
  })
  await expect(
    openMobileSideChat({
      client: createFakeRpcClient(),
      worktreeId: 'folder',
      sessionId: 'codex_parent_123',
      agent: 'codex',
      navigation: nav,
      onError: vi.fn()
    })
  ).resolves.toBe(true)
  expect(nav.switchSessionTabRef.current).toHaveBeenCalledExactlyOnceWith(tab)
})

it('preserves a newer user tab pick while a side chat is being created', async () => {
  const nav = navigation()
  vi.mocked(createMobileStructuredAgentSession).mockImplementation(async () => {
    nav.pendingSelectionRef.current = { kind: 'tab', tabId: 'user-picked' }
    return { kind: 'created', sessionId: 'codex_child_123' }
  })
  await openMobileSideChat({
    client: createFakeRpcClient(),
    worktreeId: 'folder',
    sessionId: 'codex_parent_123',
    agent: 'codex',
    navigation: nav,
    onError: vi.fn()
  })
  expect(nav.pendingSelectionRef.current).toEqual({ kind: 'tab', tabId: 'user-picked' })
  expect(nav.switchSessionTabRef.current).not.toHaveBeenCalled()
})

it('keeps an uncertain child selectable instead of discarding its original session', async () => {
  const nav = navigation()
  const onError = vi.fn()
  vi.mocked(createMobileStructuredAgentSession).mockResolvedValue({
    kind: 'unknown',
    sessionId: 'codex_child_123',
    message: 'Tab publication could not be confirmed'
  })
  await expect(
    openMobileSideChat({
      client: createFakeRpcClient(),
      worktreeId: 'folder',
      sessionId: 'codex_parent_123',
      agent: 'codex',
      navigation: nav,
      onError
    })
  ).resolves.toBe(false)
  expect(nav.pendingSelectionRef.current).toMatchObject({
    kind: 'launched',
    surface: { sessionId: 'codex_child_123' }
  })
  expect(onError).toHaveBeenCalledOnce()
})
