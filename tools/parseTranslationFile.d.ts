// Типи для parseTranslationFile.js (використовується в застосунку з TS)
export declare const PARSE_LIMITS: {
  maxFileChars: number
  maxDepth: number
  maxStringChars: number
}

export declare function parseTranslationFile(src: string): {
  /** ім'я з `export const <name>` */
  name: string
  /** розібраний об'єкт перекладів (рядки + згенеровані функції-шаблони) */
  value: Record<string, unknown>
}
