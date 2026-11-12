// Перевірка всіх файлів перекладів тим самим парсером, що й у застосунку.
// Помилка парсингу/лімітів → exit 1 (Action не публікує manifest).
// Розбіжність ключів з en → лише попередження (застосунок домальовує відсутнє з en).
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseTranslationFile} from './parseTranslationFile.js'
import {listLocaleFiles} from './locales.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = listLocaleFiles(root)

const collectKeys = (obj, prefix = '', out = new Map()) => {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') collectKeys(v, path, out)
    else out.set(path, typeof v)
  }
  return out
}

let errors = 0
const parsed = {}
for (const [locale, rel] of Object.entries(files)) {
  try {
    parsed[locale] = parseTranslationFile(readFileSync(join(root, rel), 'utf8')).value
  } catch (e) {
    errors++
    console.error(`✗ ${rel}: ${e.message}`)
  }
}

if (parsed.en) {
  const ref = collectKeys(parsed.en)
  for (const [locale, value] of Object.entries(parsed)) {
    if (locale === 'en') continue
    const keys = collectKeys(value)
    const missing = [...ref.keys()].filter(k => !keys.has(k))
    const extra = [...keys.keys()].filter(k => !ref.has(k))
    const wrongType = [...ref.entries()].filter(([k, t]) => keys.has(k) && keys.get(k) !== t).map(([k]) => k)
    if (missing.length) console.warn(`! ${files[locale]}: ${missing.length} missing keys (e.g. ${missing.slice(0, 3).join(', ')})`)
    if (extra.length) console.warn(`! ${files[locale]}: ${extra.length} extra keys (e.g. ${extra.slice(0, 3).join(', ')})`)
    if (wrongType.length) console.warn(`! ${files[locale]}: ${wrongType.length} keys with other type than en (e.g. ${wrongType.slice(0, 3).join(', ')})`)
  }
} else {
  errors++
  console.error('✗ languages/en.ts is required')
}

console.log(`${Object.keys(parsed).length}/${Object.keys(files).length} files parsed, ${errors} errors`)
process.exit(errors ? 1 : 0)
