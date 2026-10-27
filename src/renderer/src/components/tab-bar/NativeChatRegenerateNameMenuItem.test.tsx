// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { TabSessionSurfaceSwitchMenuItems } from './TabSessionSurfaceSwitchMenuItems'

const mocks = vi.hoisted(() => ({
  owner: 'local',
  support: 'supported',
  namingActive: false,
  regenerate: vi.fn(async () => true),
  listeners: new Set<() => void>()
}))
vi.mock('./NativeChatCliForkMenuItems', () => ({ NativeChatCliForkMenuItems: () => null }))
vi.mock('./NativeChatSideChatMenuItem', () => ({ NativeChatSideChatMenuItem: () => null }))
vi.mock('./CliChatResumeMenuItems', () => ({ CliChatResumeMenuItems: () => null }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      unifiedTabsByWorktree: {
        workspace: [{ id: 'tab', worktreeId: 'workspace', executionHostId: mocks.owner }]
      }
    })
}))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  regenerateStructuredAgentSessionName: mocks.regenerate
}))
vi.mock('@/runtime/structured-agent-session-host-capability', () => ({
  useStructuredAgentSessionHostCapabilityState: () => mocks.support
}))
vi.mock('@/runtime/structured-agent-session-status-feed', () => ({
  getStructuredAgentSessionStatusFeed: () => ({
    activate: () => () => {},
    subscribe: (listener: () => void) => {
      mocks.listeners.add(listener)
      return () => mocks.listeners.delete(listener)
    },
    getNamingActive: () => mocks.namingActive
  })
}))

function mountMenu(nativeChat = true): void {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <TabSessionSurfaceSwitchMenuItems
          tab={{ id: 'tab', worktreeId: 'workspace' }}
          nativeChat={nativeChat ? { sessionId: 'chat', agent: 'codex' } : undefined}
          leadingSeparator
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

beforeEach(() => {
  mocks.owner = 'local'
  mocks.support = 'supported'
  mocks.namingActive = false
  mocks.regenerate.mockClear()
})
afterEach(cleanup)

describe('chat name retry without a retained naming error', () => {
  it.each(['local', 'runtime:paired'])(
    'offers a retry routed to %s after reopening the app',
    async (owner) => {
      mocks.owner = owner
      mountMenu()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Regenerate name' }))
      await waitFor(() =>
        expect(mocks.regenerate).toHaveBeenCalledExactlyOnceWith(
          owner === 'local' ? { kind: 'local' } : { kind: 'environment', environmentId: 'paired' },
          'chat'
        )
      )
    }
  )

  it.each(['unknown', 'unsupported'])(
    'does not invoke a host whose capability is %s',
    (support) => {
      mocks.support = support
      mountMenu()
      expect(screen.queryByRole('menuitem', { name: 'Regenerate name' })).toBeNull()
      expect(mocks.regenerate).not.toHaveBeenCalled()
    }
  )

  it('disables the action while the owning host is already naming the chat', () => {
    mountMenu()
    act(() => {
      mocks.namingActive = true
      for (const listener of mocks.listeners) {
        listener()
      }
    })
    const item = screen.getByRole('menuitem', { name: 'Regenerating…' })
    expect(item.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(item)
    expect(mocks.regenerate).not.toHaveBeenCalled()
  })

  it('keeps the generation action off terminal tabs', () => {
    mountMenu(false)
    expect(screen.queryByRole('menuitem', { name: 'Regenerate name' })).toBeNull()
  })
})
