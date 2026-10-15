import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { MobileChatText, MobileChatTextInput } from '../components/MobileChatText'
import { publishMobileChatFontWeight } from './mobile-chat-font-weight-value'

vi.mock('react-native', () => ({ Text: 'Text', TextInput: 'TextInput' }))
let tree: ReactTestRenderer | undefined
afterEach(() => {
  act(() => tree?.unmount())
  act(() => publishMobileChatFontWeight({ weight: 400, ready: true }))
})

it('updates prose, code, quotes, tools, status and native placeholders in place', () => {
  const roles = ['Prose', 'Inline code', 'Code block', 'Quote', 'Tool', 'Working…']
  act(() => {
    tree = create(
      createElement(
        'Chat',
        {},
        ...roles.map((role) =>
          createElement(
            MobileChatText,
            {
              key: role,
              style: role.includes('code') ? { fontFamily: 'monospace' } : {}
            },
            role
          )
        ),
        createElement(MobileChatText, { style: { fontWeight: '700' } }, 'Bold'),
        createElement(MobileChatTextInput, { placeholder: 'Message Codex…' })
      )
    )
  })
  for (const weight of [300, 500] as const) {
    act(() => publishMobileChatFontWeight({ weight, ready: true }))
    const text = tree!.root.findAll((node) => String(node.type) === 'Text')
    expect(text.slice(0, roles.length).map((node) => node.props.style.at(-1).fontWeight)).toEqual(
      roles.map(() => weight)
    )
    expect(text.at(-1)?.props.style).toEqual({ fontWeight: '700' })
    expect(tree!.root.find((node) => String(node.type) === 'TextInput').props.style.at(-1).fontWeight).toBe(
      weight
    )
  }
  act(() => publishMobileChatFontWeight({ weight: 400, ready: true }))
  expect(tree!.root.find((node) => String(node.type) === 'TextInput').props.style).toBeUndefined()
})
