import { createElement, useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mobileNativeChatPromptDismissals } from './mobile-native-chat-prompt-dismissals'
import { useMobileNativeChatPromptCards } from './use-mobile-native-chat-prompt-cards'

let renderer: ReactTestRenderer | undefined
beforeEach(() => mobileNativeChatPromptDismissals.clearForTests())
afterEach(() => act(() => renderer?.unmount()))

it.each([true, false])(
  'keeps the question and failure in sync with acceptance: %s',
  async (accepted) => {
    const answerQuestion = vi.fn(async () => accepted)
    let visibleFailure: string | null = null
    let cards: ReturnType<typeof useMobileNativeChatPromptCards> | undefined
    function Harness(): null {
      const [failure, setFailure] = useState<string | null>('Previous send failed')
      visibleFailure = failure
      cards = useMobileNativeChatPromptCards({
        terminal: {
          permission: null,
          question: {
            question: 'Continue?',
            options: ['Yes'],
            allowOther: false,
            multiSelect: false,
            optionTokens: ['yes']
          },
          waitStartedAt: 1,
          scopeKey: 'host\0workspace\0tab',
          sessionKey: 'session',
          observing: true,
          respondPermission: async () => false,
          answerQuestion,
          handleNativeChatAnswerAsk: async () => false,
          handleNativeChatCancelAsk: async () => false
        },
        structured: null,
        onSendResolved: () => setFailure(null)
      })
      return null
    }
    act(() => {
      renderer = create(createElement(Harness))
    })
    expect(cards?.nativeChatQuestion?.question).toBe('Continue?')
    expect(visibleFailure).toBe('Previous send failed')
    await act(async () => {
      expect(await cards?.handleNativeChatQuestionAnswer('Yes')).toBe(accepted)
    })
    expect(answerQuestion).toHaveBeenCalledExactlyOnceWith('Yes')
    expect(cards?.nativeChatQuestion?.question ?? null).toBe(accepted ? null : 'Continue?')
    expect(visibleFailure).toBe(accepted ? null : 'Previous send failed')
  }
)
