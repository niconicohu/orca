const MAX_ENTRIES = 4
const MAX_INACTIVE_BYTES = 8 * 1024 * 1024
const sizes = new WeakMap<object, number>()
/** The active rendered window is not an archive; inactive restore surfaces share one byte budget. */
export function boundMobileChatEntries<T extends object>(
  entries: Map<string, T>,
  activeKey: string
): Map<string, T> {
  let bytes = 0
  for (const [key, value] of [...entries].toReversed()) {
    if (key === activeKey) {
      continue
    }
    let size = sizes.get(value)
    if (size === undefined) {
      size = JSON.stringify(value).length * 2
      sizes.set(value, size)
    }
    if (bytes + size > MAX_INACTIVE_BYTES) {
      entries.delete(key)
    } else {
      bytes += size
    }
  }
  while (entries.size > MAX_ENTRIES) {
    const oldest = [...entries.keys()].find((key) => key !== activeKey)
    if (oldest === undefined) {
      break
    }
    entries.delete(oldest)
  }
  return entries
}
