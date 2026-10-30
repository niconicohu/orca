import { useState } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { getDefaultSettings } from '../../../../shared/constants'
import { ChatBehaviorSetting } from './ChatBehaviorSetting'

function ChatBehaviorPreview(): React.JSX.Element {
  const [settings, setSettings] = useState(() => ({
    ...getDefaultSettings('/workspace'),
    nativeChatSideChatPane: true
  }))
  return (
    <div className="bg-background p-4 text-foreground">
      <ChatBehaviorSetting
        settings={settings}
        updateSettings={(updates) => setSettings((current) => ({ ...current, ...updates }))}
        forceVisible
      />
    </div>
  )
}

export const sideChatPane = defineFixture({ width: 640, render: () => <ChatBehaviorPreview /> })
