import { MobileSettingsFrame } from './mobile-settings-menu'
import { MobileChatFontWeightSetting } from './mobile-chat-font-weight-setting'
import { MobileAppearanceSettings } from './mobile-appearance-settings'

export default function AppearanceSettingsScreen() {
  return (
    <MobileSettingsFrame title="Appearance">
      <MobileAppearanceSettings />
      <MobileChatFontWeightSetting />
    </MobileSettingsFrame>
  )
}
