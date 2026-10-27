import { act } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import {
  installChatViewHooks,
  render,
  root,
  update,
  hostType
} from './MobileNativeChatView.harness.test-fixture'
import type { MobileNativeChatThreadGoal } from './MobileNativeChatThreadGoalBanner'

vi.mock('../hooks/use-now', () => ({ useNow: () => 200_000 }))
vi.mock('react-native', async () => {
  const { reactNativeStub } = await import('./MobileNativeChatView.render-stubs.test-fixture')
  return reactNativeStub()
})
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))
vi.mock('react-native-gesture-handler', async () => {
  const { gestureHandlerStub } = await import('./MobileNativeChatView.render-stubs.test-fixture')
  return gestureHandlerStub()
})
vi.mock('lucide-react-native', () => ({
  ArrowDown: 'ArrowDown',
  ChevronsDownUp: 'ChevronsDownUp',
  ChevronsUpDown: 'ChevronsUpDown',
  Square: 'Square',
  Goal: 'Goal',
  ChevronDown: 'ChevronDown',
  ChevronUp: 'ChevronUp'
}))
vi.mock('./MobileNativeChatMessage', () => ({ MobileNativeChatMessage: 'ChatMessage' }))
vi.mock('./MobileNativeChatLiveLine', () => ({ MobileNativeChatLiveLine: 'LiveStatus' }))
vi.mock('./MobileNativeChatAsk', () => ({ MobileNativeChatAsk: 'ChatAsk' }))
vi.mock('./MobileNativeChatPermission', () => ({ MobileNativeChatPermission: 'ChatPermission' }))
vi.mock('./MobileNativeChatQuestion', () => ({ MobileNativeChatQuestion: 'ChatQuestion' }))
vi.mock('../components/ActionSheetModal', () => ({ ActionSheetModal: 'ActionSheetModal' }))
vi.mock('./native-chat/composer/MobileNativeChatComposer', async () => {
  const { composerStub } = await import('./MobileNativeChatView.render-stubs.test-fixture')
  return composerStub()
})

describe('mobile goal banner', () => {
  installChatViewHooks()
  const threadGoal: MobileNativeChatThreadGoal = {
    goal: {
      objective: 'Keep the full objective visible on the phone',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 500,
      timeUsedSeconds: 67,
      createdAt: 1_000,
      updatedAt: 10_000
    },
    runningTurn: { startedAt: 20_000 },
    hostClockOffsetMs: 170_000
  }
  const texts = () =>
    root()
      .findAll((node) => hostType(node) === 'Text')
      .flatMap((node) =>
        typeof node.props.children === 'string'
          ? [node.props.children]
          : Array.isArray(node.props.children)
            ? node.props.children.filter((x: unknown) => typeof x === 'string')
            : []
      )

  it('renders goal text and host-clock elapsed time above the composer, with full text on tap', async () => {
    await render({ threadGoal })
    expect(texts()).toContain(threadGoal.goal.objective)
    expect(texts().join('')).toContain('Pursuing goal')
    expect(texts()).toContain('1m 17s')
    const banner = root().findByProps({ testID: 'thread-goal-banner' })
    const button = banner.find((node) => hostType(node) === 'Pressable')
    expect(button.props.accessibilityState.expanded).toBe(false)
    await act(async () => button.props.onPress())
    expect(button.props.accessibilityState.expanded).toBe(true)
    expect(button.props.accessibilityLabel).toContain('Hide full goal')
  })

  it('keeps an idle goal set, renders paused/blocked/limited goals, and hides completed or cleared goals', async () => {
    await render({ threadGoal: null })
    for (const [status, label] of [
      ['active', 'Goal set'],
      ['paused', 'Paused goal'],
      ['blocked', 'Goal blocked'],
      ['budgetLimited', 'Goal limited'],
      ['usageLimited', 'Goal limited']
    ] as const) {
      await update({
        threadGoal: { ...threadGoal, goal: { ...threadGoal.goal, status }, runningTurn: null }
      })
      expect(texts().join('')).toContain(label)
      expect(texts()).toContain('1m 7s')
    }
    await update({
      threadGoal: { ...threadGoal, goal: { ...threadGoal.goal, status: 'complete' } }
    })
    expect(root().findAllByProps({ testID: 'thread-goal-banner' })).toHaveLength(0)
    await update({ threadGoal: null })
    expect(root().findAllByProps({ testID: 'thread-goal-banner' })).toHaveLength(0)
  })
})
