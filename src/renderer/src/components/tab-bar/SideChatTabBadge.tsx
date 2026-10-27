import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'

export function SideChatTabBadge(): React.JSX.Element {
  return (
    <Badge variant="contextLabel" className="mr-1">
      {translate('components.native-chat.sideChat.badge', 'btw')}
    </Badge>
  )
}
