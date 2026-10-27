import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'

export function SideChatTabBadge(): React.JSX.Element {
  return (
    <Badge variant="outline" className="mr-1">
      {translate('components.native-chat.sideChat.badge', 'btw')}
    </Badge>
  )
}
