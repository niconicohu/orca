import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { NativeChatImageRefBlock } from '../../../src/shared/native-chat-types'
import { MobileNativeChatImage } from './MobileNativeChatImage'
import { MobileNativeChatImageViewer } from './MobileNativeChatImageViewer'
import { styles } from './mobile-native-chat-message-styles'

export function MobileNativeChatImageGallery({
  images
}: {
  images: readonly NativeChatImageRefBlock[]
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const occurrences = new Map<string, number>()
  const thumbnails = images.slice(0, 3).map((image) => {
    const identity = image.path ?? image.url ?? image.alt ?? 'image'
    const occurrence = occurrences.get(identity) ?? 0
    occurrences.set(identity, occurrence + 1)
    return { image, key: `${identity}:${occurrence}` }
  })
  return (
    <View style={styles.imageGallery}>
      {thumbnails.map(({ image, key }, index) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`Open image ${index + 1} of ${images.length}`}
          style={images.length === 1 ? styles.imageGallerySingle : styles.imageGalleryTile}
          onPress={() => setSelected(index)}
        >
          <MobileNativeChatImage
            uri={image.url ?? image.path}
            alt={image.alt}
            fontScale={1}
            imageStyle={styles.imageGalleryFill}
            resizeMode="cover"
          />
        </Pressable>
      ))}
      {images.length > 3 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View all ${images.length} images`}
          style={[styles.imageGalleryTile, styles.imageGalleryMore]}
          onPress={() => setSelected(3)}
        >
          <Text style={styles.imageGalleryCount}>+{images.length - 3}</Text>
        </Pressable>
      ) : null}
      {selected !== null ? (
        <MobileNativeChatImageViewer
          images={images}
          initialIndex={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </View>
  )
}
