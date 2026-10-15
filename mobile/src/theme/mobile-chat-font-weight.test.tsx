import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
const storage = vi.hoisted(() => ({ read: vi.fn(async () => '500'), write: vi.fn(async () => {}) }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: storage.read, setItem: storage.write }
}))
import {
  normalizeMobileChatFontWeight,
  setMobileChatFontWeight,
  useMobileChatFontWeight
} from './use-mobile-chat-font-weight'
let state!: ReturnType<typeof useMobileChatFontWeight>
let tree: ReactTestRenderer | undefined
function Harness() {
  state = useMobileChatFontWeight()
  return null
}
afterEach(() => {
  act(() => tree?.unmount())
  tree = undefined
})
it('uses supported Light, Regular and Medium stops with a legible lower bound and below-bold upper bound', () => {
  expect([-100, 300, 349, 350, 400, 449, 450, 500, 900].map(normalizeMobileChatFontWeight)).toEqual(
    [300, 300, 300, 400, 400, 400, 500, 500, 500]
  )
  expect([undefined, null, '500', Number.NaN, Infinity].map(normalizeMobileChatFontWeight)).toEqual(
    [400, 400, 400, 400, 400]
  )
})
it('hydrates before presentation, updates mounted readers and serializes persistence', async () => {
  await act(async () => {
    tree = create(createElement(Harness))
  })
  expect(state).toMatchObject({ weight: 500, ready: true })
  await act(async () => {
    await Promise.all([
      setMobileChatFontWeight(300),
      setMobileChatFontWeight(400),
      setMobileChatFontWeight(500)
    ])
  })
  expect(storage.write.mock.calls.map((call) => call.slice(0, 2))).toEqual([
    ['orca:chatFontWeight', '300'],
    ['orca:chatFontWeight', '400'],
    ['orca:chatFontWeight', '500']
  ])
  expect(state.weight).toBe(500)
})
