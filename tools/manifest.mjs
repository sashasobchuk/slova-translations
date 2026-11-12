// Генерує manifest.json: код мови → шлях, md5 і розмір файлу.
// Застосунок порівнює md5 з локальною копією, щоб знати, чи качати оновлення,
// і перевіряє md5 завантаженого файлу (захист від обрізаного/застарілого кешу CDN).
import {readFileSync, writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {listLocaleFiles} from './locales.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = {}
for (const [locale, rel] of Object.entries(listLocaleFiles(root))) {
  // md5 рахується без UTF-8 BOM: застосунок отримує текст через fetch().text(), який BOM відкидає,
  // і пише на диск уже без нього — інакше md5 файлів з BOM ніколи не збігся б
  let buf = readFileSync(join(root, rel))
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3)
  files[locale] = {path: rel, md5: createHash('md5').update(buf).digest('hex'), size: buf.length}
}

const manifest = {version: 1, files}
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`manifest.json: ${Object.keys(files).length} files`)
