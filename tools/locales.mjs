// Перелік файлів перекладів: код мови → шлях від кореня репо.
// Код мови = ім'я файлу (languages/zh-Hans.ts → 'zh-Hans'), uk лежить у корені.
import {readdirSync} from 'node:fs'
import {join} from 'node:path'

export const listLocaleFiles = (root) => {
  const files = {uk: 'uk.ts'}
  for (const f of readdirSync(join(root, 'languages')).sort()) {
    if (!f.endsWith('.ts') || f === 'index.ts') continue
    files[f.slice(0, -3)] = `languages/${f}`
  }
  return files
}
