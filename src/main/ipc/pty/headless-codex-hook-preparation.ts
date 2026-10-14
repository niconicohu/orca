import type { GlobalSettings } from '../../../shared/global-settings-types'
import { getAppEnvironment } from '../../../shared/app-environment'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'
import { hasCustomCodexHomeOverrideForLaunch } from '../../codex/codex-real-home-path'
import { ensureRealHomeCodexHookState } from '../../codex/codex-real-home-hook-install'
import type { GetSelectedCodexHomePath } from './host-env/types'

/** Headless launches keep their system account but still need transcript identity hooks. */
export function createHeadlessCodexHookPreparation(
  getSettings: () => GlobalSettings
): GetSelectedCodexHomePath {
  return async (target, launchEnv, context) => {
    const settings = getSettings()
    if (
      context?.launchAgent !== 'codex' ||
      target?.runtime === 'wsl' ||
      settings.agentStatusHooksEnabled === false ||
      !isTuiAgentEnabled('codex', settings.disabledTuiAgents) ||
      hasCustomCodexHomeOverrideForLaunch(launchEnv)
    ) {
      return null
    }
    const lane = await ensureRealHomeCodexHookState({
      hooksEnabled: true,
      userDataPath: getAppEnvironment().getPath('userData')
    })
    if (lane !== 'installed') {
      console.warn('[headless-codex-hooks] Codex will start without transcript identity hooks')
    }
    return null
  }
}
