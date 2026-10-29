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

const viewport = vi.hoisted(() => ({ height: 800 }))

vi.mock('../hooks/use-now', () => ({ useNow: () => 200_000 }))
vi.mock('../platform/media-picker', () => ({
  useMediaPicker: () => ({
    pickImage: () => {
      throw new Error('Unexpected media picker use in a goal render')
    },
    pickImages: () => {
      throw new Error('Unexpected media picker use in a goal render')
    },
    pickFiles: () => {
      throw new Error('Unexpected media picker use in a goal render')
    }
  })
}))
vi.mock('react-native', async () => {
  const { reactNativeStub } = await import('./MobileNativeChatView.render-stubs.test-fixture')
  return {
    ...(await reactNativeStub()),
    useWindowDimensions: () => ({ width: 400, height: viewport.height })
  }
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
vi.mock('./native-chat/transcript/MobileNativeChatMessage', () => ({
  MobileNativeChatMessage: 'ChatMessage'
}))
vi.mock('./native-chat/transcript/MobileNativeChatLiveLine', () => ({
  MobileNativeChatLiveLine: 'LiveStatus'
}))
vi.mock('./native-chat/input/MobileNativeChatAsk', () => ({ MobileNativeChatAsk: 'ChatAsk' }))
vi.mock('./native-chat/input/MobileNativeChatPermission', () => ({
  MobileNativeChatPermission: 'ChatPermission'
}))
vi.mock('./native-chat/input/MobileNativeChatQuestion', () => ({
  MobileNativeChatQuestion: 'ChatQuestion'
}))
vi.mock('../components/ActionSheetModal', () => ({ ActionSheetModal: 'ActionSheetModal' }))
vi.mock('./native-chat/input/MobileNativeChatPromptCard', () => ({
  MobileNativeChatPromptCard: 'PromptCard'
}))
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
    expect(button.props.accessibilityLabel).toContain('1m 17s')
    await act(async () => button.props.onPress())
    expect(button.props.accessibilityState.expanded).toBe(true)
    expect(button.props.accessibilityLabel).toContain('Hide full goal')
  })

  it.each([360, 800])(
    'keeps a long expanded goal scrollable outside the composer in a %spx viewport',
    async (height) => {
      viewport.height = height
      const objective = 'A multi-paragraph objective that must stay readable.\n\n'.repeat(40)
      await render({ threadGoal: { ...threadGoal, goal: { ...threadGoal.goal, objective } } })
      const banner = root().findByProps({ testID: 'thread-goal-banner' })
      const button = banner.find((node) => hostType(node) === 'Pressable')
      await act(async () => button.props.onPress())
      const scrolls = banner.findAll((node) => hostType(node) === 'ScrollView')
      expect(scrolls).toHaveLength(1)
      const details = scrolls[0]
      if (!details) {
        throw new Error('Expanded goal must own a bounded scroll area')
      }
      const style = Object.assign({}, ...details.props.style)
      expect(style.maxHeight).toBeGreaterThan(0)
      expect(style.maxHeight).toBeLessThanOrEqual(height / 3)
      expect(
        details
          .findAll((node) => hostType(node) === 'Text')
          .some((node) => node.props.children === objective)
      ).toBe(true)
      expect(details.findAll((node) => hostType(node) === 'Composer')).toHaveLength(0)
      expect(root().findAll((node) => hostType(node) === 'Composer')).toHaveLength(1)
      await act(async () => button.props.onPress())
      expect(banner.findAll((node) => hostType(node) === 'ScrollView')).toHaveLength(0)
      expect(button.props.accessibilityState.expanded).toBe(false)
    }
  )

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
