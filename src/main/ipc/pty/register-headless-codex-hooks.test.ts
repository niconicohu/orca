import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as NodeOs from 'node:os'
import type { GetSelectedCodexHomePath } from './host-env/types'

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  home: vi.fn(),
  userData: vi.fn(),
  grant: vi.fn()
}))
vi.mock('./register-handlers', () => ({ registerPtyHandlers: mocks.register }))
vi.mock('../../memory/hydrate-local-pty-registry', () => ({
  hydrateLocalPtyRegistryAtBoot: vi.fn(async () => {})
}))
vi.mock('node:os', async () => ({
  ...(await vi.importActual<typeof NodeOs>('node:os')),
  homedir: mocks.home
}))
vi.mock('../../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: mocks.userData })
}))
vi.mock('../../codex/codex-hook-trust-grant', () => ({
  CODEX_TRUST_GRANT_TRANSIENT_RETRY_INTERVAL_MS: 300_000,
  grantManagedCodexHookTrust: mocks.grant
}))

import { registerHeadlessPtyRuntime } from './register-headless-runtime'
import { _internals } from '../../codex/codex-real-home-hook-install'

let root: string
let previousUserData: string | undefined
beforeEach(() => {
  vi.clearAllMocks()
  root = mkdtempSync(join(tmpdir(), 'orca-headless-codex-hooks-'))
  mocks.home.mockReturnValue(root)
  mocks.userData.mockReturnValue(join(root, 'orca'))
  mkdirSync(join(root, '.codex'))
  previousUserData = process.env.ORCA_USER_DATA_PATH
  process.env.ORCA_USER_DATA_PATH = join(root, 'orca')
  _internals.setLaneForTesting('pending')
  mocks.grant.mockImplementation((plan) => ({ lane: 'rpc', entries: plan.managedEntries }))
})
afterEach(() => {
  if (previousUserData === undefined) {
    delete process.env.ORCA_USER_DATA_PATH
  } else {
    process.env.ORCA_USER_DATA_PATH = previousUserData
  }
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

async function registeredPreparation(settings = {}) {
  await registerHeadlessPtyRuntime({} as never, undefined, () => settings as never)
  const prepare: GetSelectedCodexHomePath | undefined = mocks.register.mock.calls.at(-1)?.[2]
  expect(prepare).toBeTypeOf('function')
  return prepare!
}

describe('headless Codex launch hook preparation', () => {
  it('installs session identity hooks before a system-default terminal Codex starts', async () => {
    const prepare = await registeredPreparation()
    expect(await prepare({ runtime: 'host' }, {}, { launchAgent: 'codex' })).toBeNull()
    const hooks = JSON.parse(readFileSync(join(root, '.codex', 'hooks.json'), 'utf8')).hooks
    expect(hooks.SessionStart[0].hooks[0].command).toContain('codex-hook')
    expect(hooks.UserPromptSubmit).toHaveLength(1)
    expect(hooks.Stop).toHaveLength(1)
    expect(mocks.grant).toHaveBeenCalledOnce()
  })

  it.each([
    [{ agentStatusHooksEnabled: false }, {}, 'codex', 'host'],
    [{ disabledTuiAgents: ['codex'] }, {}, 'codex', 'host'],
    [{}, { CODEX_HOME: '/user/custom-codex-home' }, 'codex', 'host'],
    [{}, {}, 'claude', 'host'],
    [{}, {}, 'codex', 'wsl']
  ])(
    'keeps opted-out and unrelated launches untouched (%j)',
    async (settings, env, agent, runtime) => {
      const prepare = await registeredPreparation(settings)
      await prepare({ runtime } as never, env, { launchAgent: agent as never })
      expect(mocks.grant).not.toHaveBeenCalled()
      expect(existsSync(join(root, '.codex', 'hooks.json'))).toBe(false)
    }
  )

  it('preserves an explicitly supplied desktop account preparation', async () => {
    const prepare = vi.fn(() => '/accounts/selected')
    await registerHeadlessPtyRuntime({} as never, prepare, () => ({}) as never)
    expect(mocks.register.mock.calls.at(-1)?.[2]).toBe(prepare)
  })

  it('rolls back untrusted hooks and keeps the account when the Codex grant is unavailable', async () => {
    mocks.grant.mockReturnValue({ lane: 'fallback', reason: 'unsupported' })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prepare = await registeredPreparation()
    expect(await prepare({ runtime: 'host' }, {}, { launchAgent: 'codex' })).toBeNull()
    expect(existsSync(join(root, '.codex', 'hooks.json'))).toBe(false)
    expect(warning).toHaveBeenCalledWith(
      '[headless-codex-hooks] Codex will start without transcript identity hooks'
    )
  })
})
