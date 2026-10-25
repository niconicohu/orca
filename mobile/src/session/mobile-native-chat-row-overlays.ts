import { createContext } from 'react'
import type {
  NativeChatImageRefBlock,
  NativeChatMessage
} from '../../../src/shared/native-chat-types'

export type MobileNativeChatViewedImage = {
  uri: string
  label: string
  gallery?: { images: readonly NativeChatImageRefBlock[]; initialIndex: number }
}

// Keep overlays above replaceable rows so echo/transcript swaps cannot close a selected image or actions sheet.
export type MobileNativeChatRowOverlays = {
  openImage: (image: MobileNativeChatViewedImage) => void
  openActions: (message: NativeChatMessage) => void
}

export const MobileNativeChatRowOverlaysContext = createContext<MobileNativeChatRowOverlays>({
  openImage: () => {},
  openActions: () => {}
})
