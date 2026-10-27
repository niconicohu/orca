import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import type { NativeChatTabSession } from './tab-session-history-switch'
import { useNativeChatNameGeneration } from './use-native-chat-name-generation'

export function NativeChatRegenerateNameMenuItem({
  tab,
  nativeChat,
  onComplete
}: {
  tab: { id: string; worktreeId: string }
  nativeChat: NativeChatTabSession
  onComplete?: () => void
}) {
  const owner = useAppStore((state) => {
    const source = state.unifiedTabsByWorktree[tab.worktreeId]?.find((entry) => entry.id === tab.id)
    return source ? structuredAgentSessionOwnerForTab(state, source) : null
  })
  const target = useMemo(() => structuredAgentSessionTargetForHost(owner), [owner])
  const naming = useNativeChatNameGeneration(target, nativeChat.sessionId)
  if (!naming.canRegenerate) {
    return null
  }
  return (
    <DropdownMenuItem
      disabled={naming.regenerating}
      onSelect={() => {
        onComplete?.()
        void naming.regenerate().then((accepted) => {
          if (!accepted) {
            toast.error(translate('tabHoverCard.namingFailure.title', "Couldn't name this chat"))
          }
        })
      }}
    >
      <RefreshCw />
      {naming.regenerating
        ? translate('tabHoverCard.namingFailure.regenerating', 'Regenerating…')
        : translate('tabHoverCard.namingFailure.regenerate', 'Regenerate name')}
    </DropdownMenuItem>
  )
}
