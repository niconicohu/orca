import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import {
  getChatAppearanceEntriesByKey,
  getChatAppearanceSearchEntries
} from './chat-appearance-search'
import { matchesSettingsSearch } from './settings-search'

describe('chat text weight search', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it.each([
    ['en', ['Light', 'Regular', 'Medium']],
    ['zh', ['轻', '标准', '中等']],
    ['ja', ['細字', '標準', '中太']],
    ['ko', ['가늘게', '보통', '중간']],
    ['es', ['Ligero', 'Normal', 'Medio']],
    ['fr', ['Léger', 'Normal', 'Moyen']]
  ] as const)('finds the weight row by each localized option in %s', async (locale, labels) => {
    await i18n.changeLanguage('en')
    getChatAppearanceEntriesByKey()
    await i18n.changeLanguage(locale)
    const entry = getChatAppearanceEntriesByKey().textWeight
    for (const label of labels) {
      expect(entry.keywords).toContain(label)
      expect(matchesSettingsSearch(label, entry), label).toBe(true)
      expect(matchesSettingsSearch(label, getChatAppearanceSearchEntries()), label).toBe(true)
    }
  })
})
