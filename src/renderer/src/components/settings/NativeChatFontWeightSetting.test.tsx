// @vitest-environment happy-dom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { NativeChatFontWeightSetting } from './NativeChatFontWeightSetting'

afterEach(cleanup)

it('snaps keyboard changes to five bounded stops and resets without losing other settings', () => {
  const persist = vi.fn()
  function Harness(): React.JSX.Element {
    const [settings, setSettings] = useState(getDefaultSettings('/tmp'))
    return (
      <NativeChatFontWeightSetting
        settings={settings}
        updateSettings={(patch) => {
          persist(patch)
          setSettings((previous) => ({ ...previous, ...patch }))
        }}
      />
    )
  }
  render(<Harness />)
  const slider = screen.getByRole('slider', { name: 'Font weight' })
  expect(slider.getAttribute('aria-valuenow')).toBe('400')
  expect(screen.getByRole('button', { name: 'Reset font weight' }).hasAttribute('disabled')).toBe(
    true
  )
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(persist).toHaveBeenLastCalledWith({ nativeChatFontWeight: 425 })
  fireEvent.keyDown(slider, { key: 'End' })
  expect(slider.getAttribute('aria-valuenow')).toBe('500')
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(slider.getAttribute('aria-valuenow')).toBe('500')
  expect(screen.getByText('Bold emphasis').tagName).toBe('STRONG')
  fireEvent.click(screen.getByRole('button', { name: 'Reset font weight' }))
  expect(persist).toHaveBeenLastCalledWith({ nativeChatFontWeight: 400 })
  expect(slider.getAttribute('aria-valuenow')).toBe('400')
})
