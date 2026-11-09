import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslate } from '@/i18n/use-translate'

export function SideChatTabBadge({ className }: { className?: string }): React.JSX.Element {
  const t = useTranslate()
  return (
    <Badge variant="contextLabel" className={cn('mr-1 shrink-0', className)}>
      {t('components.native-chat.sideChat.badge', 'btw')}
    </Badge>
  )
}
