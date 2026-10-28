import { CornerDownRight } from 'lucide-react-native'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import type { MobileSessionController } from './use-mobile-session-controller'

export function getMobileSideChatActions(args: {
  controller: Pick<MobileSessionController, 'agentSessionHostSupport' | 'handleOpenSideChat'>
  tab: Parameters<MobileSessionController['handleOpenSideChat']>[0] | null
  onDismiss: () => void
}): ActionSheetAction[] {
  const { tab, controller } = args
  if (!tab?.sideChatSupported || !controller.agentSessionHostSupport?.sideChat) {
    return []
  }
  return [
    {
      label: 'New side chat',
      icon: CornerDownRight,
      onPress: () => {
        args.onDismiss()
        void controller.handleOpenSideChat(tab)
      }
    }
  ]
}
