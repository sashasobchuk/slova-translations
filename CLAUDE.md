# CLAUDE.md — slova-translations

Переклади інтерфейсу застосунку **Slova** (мобільний, Expo/React Native). Репо публічне: застосунок качає звідси файли мов під час роботи, а не тримає їх у бандлі.

## Як це влаштовано

- Репо підключене сабмодулем у `dto` за шляхом `dto/src/translation` (а `dto` — сабмодуль у `native`, веб-клієнті та розширенні).
- У git тут лише whitelist з `.gitignore`: `uk.ts`, `languages/*.ts`, `index.ts`, `types.d.ts`, `manifest.json`, `tools/`, `.github/`. Інші файли теки (скрипти `update-translation.js`, `batch-update-translation.js`, `merge-trans-folder.js`, `translations.ts`, `trans/`, промпти) живуть **тільки локально** і в git не потрапляють.
- `uk.ts` — еталон ключів для TS-типів (`TranslationSchema`), `languages/<code>.ts` — решта мов. Код мови = ім'я файлу (`languages/zh-Hans.ts` → `zh-Hans`), має збігатися з `SUPPORTED_LOCALES` у `shared/src/store/slices/mainSlice.ts`.
- **У застосунку в бандлі лише `languages/en.ts`** — це мова за замовчуванням і еталон для домальовування відсутніх ключів. Решта мов (включно з `uk`) завантажуються з мережі при виборі мови й зберігаються на телефоні.

## Як застосунок читає файли (важливо для формату)

Файл **не виконується** (ні `eval`, ні `new Function` — інакше це завантаження виконуваного коду, що заборонено правилами App Store / Google Play і небезпечно). Його розбирає безпечний парсер `tools/parseTranslationFile.js` — той самий файл використовує і застосунок (імпорт із сабмодуля), і перевірка в Action.

Дозволений синтаксис:

```ts
import type { TranslationSchema } from '..'          // пропускається
export const de: TranslationSchema = {               // корінь
  section: {
    plain: 'Рядок',                                  // '...', "...", `...` без ${}
    withArg: (lang) => `Текст ${lang}`,              // стрілка → шаблон
    typed: (lang?: string) => `Текст ${lang}`,       // типи параметрів ігноруються
    destructured: ({ lang }: { lang: string }) => `Переклад ${lang}`,
    cond: (running) => `Модель${running ? ' — генерується…' : ''}`,   // тернарник лише за істинністю параметра
    concat: (a, b) => `Рушій (${a})` + (b ? `: ${b}` : ''),           // + між рядками/шаблонами/параметрами
  },
}
```

**Не можна** (файл буде відхилено, і юзери цієї мови отримають англійську): виклики функцій і методів (`n.toFixed()`), доступ через `.`, порівняння (`n > 1 ? …`), арифметика, змінні не з параметрів, масиви, числа/булеві як значення, spread. Потрібна нова конструкція — спершу додати її в `tools/parseTranslationFile.js`, випустити версію застосунку з оновленим парсером, і лише потім використовувати в перекладах.

Ліміти парсера: файл ≤ 1 000 000 символів, вкладеність ≤ 10, рядок ≤ 5 000 символів; ключі `__proto__`, `constructor`, `prototype` заборонені, дублікати ключів — помилка.

## Порядок оновлення перекладів

1. Змінити файли (`uk.ts`, `languages/*.ts`).
2. Локально перевірити: `node tools/validate.mjs` (потрібен Node 18+). Помилки (`✗`) — виправити; попередження (`!`) про відсутні/зайві ключі допустимі — застосунок домальовує відсутнє з `en`.
3. Commit і push у `main`.
4. GitHub Action `.github/workflows/publish.yml` сам:
   - проганяє `tools/validate.mjs` (при помилці зупиняється — `manifest.json` не оновлюється, юзери лишаються на попередній версії; GitHub надсилає лист про впалий workflow);
   - генерує `manifest.json` (`tools/manifest.mjs`: код мови → `path`, `md5`, `size`) і, якщо він змінився, комітить його від `github-actions[bot]` з `[skip ci]`;
   - скидає кеш jsDelivr для всіх файлів і `manifest.json`.
5. **Після push зробити `git pull`** — Action додав коміт з `manifest.json`, інакше наступний push відхилиться.

`manifest.json` вручну не редагувати. Якщо треба локально — `node tools/manifest.mjs`.

## Звідки качає застосунок

- `manifest.json`: спершу `https://raw.githubusercontent.com/sashasobchuk/slova-translations/main/manifest.json` (свіжий за ~5 хв), потім `https://cdn.jsdelivr.net/gh/sashasobchuk/slova-translations@main/manifest.json`.
- Файл мови: спершу jsDelivr (`.../slova-translations@main/<path>`), потім raw GitHub. md5 завантаженого файлу звіряється з `manifest.json`; не збігся (застарілий кеш CDN) — пробується наступне джерело.
- Застосунок перевіряє оновлення раз на старт: якщо md5 мови на диску ≠ md5 у manifest — перекачує її у фоні.
- Якщо жодне джерело не відповіло, а мови ще немає на диску — показується англійська і банер із контактами розробника; повтори йдуть у фоні.

Перейменування/переміщення файлів або зміна структури `manifest.json` ламає вже встановлені версії застосунку — робити лише разом з оновленням коду завантажувача в `native/src/utils/remoteTranslations/` і з урахуванням старих версій.

## Додати нову мову

1. Створити `languages/<code>.ts` (скопіювати `en.ts`, перекласти, `export const <codeCamel>: TranslationSchema = {`).
2. Додати реекспорт у `languages/index.ts` (його імпортують веб/розширення через `dto`).
3. У застосунку: код мови в `SUPPORTED_LOCALES` (`shared`) і в `INTERFACE_LANGUAGES` (`shared/src/utils/profile-interface-utils.ts`), рядки банера в `native/src/components/TranslationFallbackBanner/strings.ts`. Без релізу застосунку нова мова не з'явиться у виборі.
4. Push — далі як в оновленні.

## Інструменти

- `tools/parseTranslationFile.js` — безпечний парсер (ESM; `tools/package.json` з `"type": "module"` для Node). Типи — `parseTranslationFile.d.ts`.
- `tools/validate.mjs` — перевірка всіх файлів + звірка ключів з `en`.
- `tools/manifest.mjs` — генерація `manifest.json`.
- `tools/locales.mjs` — перелік файлів мов (код → шлях).
