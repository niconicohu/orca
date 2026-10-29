import { agentChatPermissionModes } from '../../../src/shared/agent-chat-permission-mode'
import { useState } from 'react'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { CornerDownRight, Eye, GitFork } from 'lucide-react-native'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import type { MobileSessionController } from './use-mobile-session-controller'

export function getMobileSideChatActions(args: {
  controller: Pick<MobileSessionController, 'agentSessionHostSupport' | 'handleOpenSideChat'>
  tab: Parameters<MobileSessionController['handleOpenSideChat']>[0] | null
  onChoosePermission: (
    tab: NonNullable<Parameters<MobileSessionController['handleOpenSideChat']>[0]>
  ) => void
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
      closeBeforePress: true,
      onPress: () => args.onChoosePermission(tab)
    }
  ]
}

export function MobileSideChatPermissionSheet({
  controller,
  source,
  onClose
}: {
  controller: Pick<MobileSessionController, 'agentSessionHostSupport' | 'handleOpenSideChat'>
  source: Parameters<MobileSessionController['handleOpenSideChat']>[0] | null
  onClose: () => void
}) {
  const choose = (permission: 'inherit' | 'read-only') => {
    if (source) {
      void controller.handleOpenSideChat(source, '', [], permission)
    }
  }
  return (
    <ActionSheetModal
      visible={source != null}
      title="New side chat"
      onClose={onClose}
      actions={[
        {
          label: 'Read only',
          icon: Eye,
          hint: 'Uses a read-only sandbox without permission escalation',
          disabled:
            !controller.agentSessionHostSupport?.readOnlySideChat ||
            !agentChatPermissionModes(source?.agent ?? '')?.modes.includes('read-only'),
          onPress: () => choose('read-only')
        },
        {
          label: 'Use main chat permissions',
          icon: GitFork,
          hint: 'Starts with the main chat’s permissions; later changes are independent',
          onPress: () => choose('inherit')
        }
      ]}
    />
  )
}

export function MobileNativeChatTabActionSheet({
  controller,
  source,
  onClose,
  actions
}: {
  controller: Pick<MobileSessionController, 'agentSessionHostSupport' | 'handleOpenSideChat'>
  source: Parameters<MobileSessionController['handleOpenSideChat']>[0] | null
  onClose: () => void
  actions: ActionSheetAction[]
}) {
  const [permissionSource, setPermissionSource] = useState<typeof source>(null)
  return (
    <>
      <ActionSheetModal
        visible={source != null}
        title={source?.title || 'Chat'}
        onClose={onClose}
        actions={[
          ...getMobileSideChatActions({
            controller,
            tab: source,
            onChoosePermission: setPermissionSource,
            onDismiss: onClose
          }),
          ...actions
        ]}
      />
      <MobileSideChatPermissionSheet
        controller={controller}
        source={permissionSource}
        onClose={() => setPermissionSource(null)}
      />
    </>
  )
}
