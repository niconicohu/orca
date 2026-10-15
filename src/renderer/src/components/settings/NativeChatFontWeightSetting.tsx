import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  DEFAULT_NATIVE_CHAT_FONT_WEIGHT,
  MIN_NATIVE_CHAT_FONT_WEIGHT,
  MAX_NATIVE_CHAT_FONT_WEIGHT,
  NATIVE_CHAT_FONT_WEIGHT_STEP,
  normalizeNativeChatFontWeight
} from '../../../../shared/native-chat-font-weight'
import { translate } from '@/i18n/i18n'
import CommentMarkdown from '../sidebar/CommentMarkdown'
import { Button } from '../ui/button'
import { Slider } from '../ui/slider'
import { SettingsRow } from './SettingsFormControls'

function weightLabel(value: number): string {
  if (value === 400) {
    return translate('components.settings.chatFontWeight.regular', 'Regular')
  }
  if (value === 500) {
    return translate('components.settings.chatFontWeight.medium', 'Medium')
  }
  return String(value)
}

export function NativeChatFontWeightSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const value = normalizeNativeChatFontWeight(settings.nativeChatFontWeight)
  const [draft, setDraft] = useState(value)
  const [previousValue, setPreviousValue] = useState(value)
  if (value !== previousValue) {
    setPreviousValue(value)
    setDraft(value)
  }
  const title = translate('components.settings.chatFontWeight.title', 'Font weight')
  const resetLabel = translate('components.settings.chatFontWeight.reset', 'Reset font weight')
  const valueLabel = `${weightLabel(draft)} · ${draft}`
  return (
    <div className="space-y-3 pb-4">
      <SettingsRow
        label={title}
        description={translate(
          'components.settings.chatFontWeight.description',
          'Adjust message text in five steps. Headings and bold text keep their emphasis.'
        )}
        control={
          <div className="flex items-center gap-2">
            <output className="w-28 text-right text-xs tabular-nums text-muted-foreground">
              {valueLabel}
            </output>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label={resetLabel}
              disabled={draft === DEFAULT_NATIVE_CHAT_FONT_WEIGHT}
              onClick={() => {
                setDraft(DEFAULT_NATIVE_CHAT_FONT_WEIGHT)
                updateSettings({ nativeChatFontWeight: DEFAULT_NATIVE_CHAT_FONT_WEIGHT })
              }}
            >
              <RotateCcw className="size-3.5" />
              {translate('components.settings.chatFontWeight.resetAction', 'Reset')}
            </Button>
          </div>
        }
      />
      <Slider
        value={[draft]}
        min={MIN_NATIVE_CHAT_FONT_WEIGHT}
        max={MAX_NATIVE_CHAT_FONT_WEIGHT}
        step={NATIVE_CHAT_FONT_WEIGHT_STEP}
        thumbLabels={[title]}
        thumbValueLabels={[valueLabel]}
        onValueChange={([next]) => setDraft(normalizeNativeChatFontWeight(next))}
        onValueCommit={([next]) =>
          updateSettings({ nativeChatFontWeight: normalizeNativeChatFontWeight(next) })
        }
      />
      <div aria-hidden className="flex justify-between text-xs tabular-nums text-muted-foreground">
        {[400, 425, 450, 475, 500].map((stop) => (
          <span
            key={stop}
            className="flex flex-col items-center gap-1 first:items-start last:items-end"
          >
            <span className="h-1 w-px bg-border" />
            {stop}
          </span>
        ))}
      </div>
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <CommentMarkdown
          variant="document"
          className="native-chat-message-body text-sm"
          style={{ fontWeight: draft }}
          content={translate(
            'components.settings.chatFontWeight.preview',
            'Chat text stays readable. **Bold emphasis** remains distinct, and `inline code` keeps its weight.'
          )}
        />
      </div>
    </div>
  )
}
