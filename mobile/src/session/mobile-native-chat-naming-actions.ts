import { RefreshCw } from 'lucide-react-native'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import type { MobileSessionTab } from './mobile-session-route-types'
import type { MobileSessionController } from './use-mobile-session-controller'
import { callAgentSession } from './mobile-structured-agent-session-rpc'

export function getMobileChatNamingActions(args: {
  controller: Pick<
    MobileSessionController,
    'client' | 'clientRef' | 'sessionTabsRef' | 'agentSessionHostSupport' | 'showToast'
  >
  tab: Extract<MobileSessionTab, { type: 'agent-session' }> | null
  onDismiss: () => void
}): ActionSheetAction[] {
  const { controller, tab } = args
  const { client } = controller
  if (!client || !tab || !controller.agentSessionHostSupport?.regenerateName) {
    return []
  }
  const generation = client.getGeneration?.()
  const isCurrent = () =>
    controller.clientRef.current === client &&
    client.getGeneration?.() === generation &&
    controller.sessionTabsRef.current.some(
      (entry) =>
        entry.type === 'agent-session' &&
        entry.id === tab.id &&
        entry.sessionId === tab.sessionId &&
        entry.agent === tab.agent
    )
  return [
    {
      label: 'Regenerate name',
      icon: RefreshCw,
      onPress: async () => {
        args.onDismiss()
        if (!isCurrent()) {
          return
        }
        try {
          const result = await callAgentSession<{ accepted: boolean }>(
            client,
            'agentSession.regenerateName',
            { sessionId: tab.sessionId }
          )
          if (isCurrent()) {
            controller.showToast(
              result.accepted
                ? 'Chat name generation requested.'
                : 'Could not request a new chat name.'
            )
          }
        } catch {
          if (isCurrent()) {
            controller.showToast('Chat name request failed. Check the connection before retrying.')
          }
        }
      }
    }
  ]
}
