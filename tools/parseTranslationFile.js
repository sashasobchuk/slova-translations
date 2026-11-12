// Безпечний парсер файлу перекладів (*.ts) — читає файл як ДАНІ, нічого не виконує.
// Жодного eval / new Function: функції-переклади збираються з дозволених шаблонів.
//
// Дозволений синтаксис (whitelist):
//   import type ... ;                      — пропускається
//   export const <id>(: Type)? = { ... }   — корінь; хвіст після об'єкта (as const, export type ...) ігнорується
//   значення: 'рядок' | "рядок" | `шаблон` | { вкладений об'єкт } | стрілка
//   стрілка:  (a, b?: string) => вираз    або    ({ a, b }: { a: string }) => вираз
//   вираз:    param ? сума : сума | сума
//   сума:     доданок (+ доданок)*
//   доданок:  'рядок' | `шаблон` | param | ( вираз )
//   у шаблоні ${...} — той самий вираз
// Будь-що інше (виклики, ., порівняння, змінні не з параметрів) — помилка, файл відхиляється.
//
// Використовується і в застосунку (native), і в tools/validate.mjs — правити тут, в одному місці.

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export const PARSE_LIMITS = {
  maxFileChars: 1_000_000,
  maxDepth: 10,
  maxStringChars: 5_000,
}

export function parseTranslationFile(src) {
  if (typeof src !== 'string') throw new Error('source must be a string')
  if (src.length > PARSE_LIMITS.maxFileChars) throw new Error(`file too large: ${src.length} chars`)

  let i = 0
  let depth = 0

  const lineOf = (pos) => src.slice(0, pos).split('\n').length
  const fail = (msg) => {
    throw new Error(`${msg} (line ${lineOf(i)}): ${JSON.stringify(src.slice(i, i + 40))}`)
  }

  const skipWs = () => {
    for (;;) {
      const c = src[i]
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '﻿') i++
      else if (src.startsWith('//', i)) {
        const e = src.indexOf('\n', i)
        i = e < 0 ? src.length : e
      } else if (src.startsWith('/*', i)) {
        const e = src.indexOf('*/', i)
        if (e < 0) fail('unterminated comment')
        i = e + 2
      } else break
    }
  }
  const eat = (s) => {
    skipWs()
    if (!src.startsWith(s, i)) fail(`expected "${s}"`)
    i += s.length
  }
  const peek = (s) => {
    skipWs()
    return src.startsWith(s, i)
  }
  const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/
  const ident = () => {
    skipWs()
    const m = IDENT_RE.exec(src.slice(i, i + 200))
    if (!m) fail('expected identifier')
    i += m[0].length
    return m[0]
  }
  const checkLen = (s) => {
    if (s.length > PARSE_LIMITS.maxStringChars) fail('string too long')
    return s
  }

  const ESCAPES = {n: '\n', t: '\t', r: '\r', '0': '\0', b: '\b', f: '\f', v: '\v'}
  const readEscape = () => {
    // i вказує на символ після '\'
    const c = src[i]
    if (c === 'u') {
      const m = /^u\{([0-9a-fA-F]{1,6})\}|^u([0-9a-fA-F]{4})/.exec(src.slice(i, i + 10))
      if (!m) fail('bad unicode escape')
      i += m[0].length
      return String.fromCodePoint(parseInt(m[1] ?? m[2], 16))
    }
    if (c === '\r' && src[i + 1] === '\n') { i += 2; return '' }
    if (c === '\n') { i++; return '' }
    i++
    return ESCAPES[c] ?? c
  }

  const readQuoted = () => {
    const q = src[i++]
    let out = ''
    while (src[i] !== q) {
      if (i >= src.length || src[i] === '\n') fail('unterminated string')
      if (src[i] === '\\') {
        i++
        out += readEscape()
      } else out += src[i++]
    }
    i++
    return checkLen(out)
  }

  // шаблон → масив частин: рядок | {p: name} | {g: parts} | {c: name, t: parts, f: parts}
  const readTemplate = (params) => {
    i++ // `
    const parts = []
    let buf = ''
    let total = 0
    for (;;) {
      if (i >= src.length) fail('unterminated template')
      const c = src[i]
      if (c === '`') { i++; break }
      if (c === '\\') {
        i++
        buf += readEscape()
        continue
      }
      if (src.startsWith('${', i)) {
        if (buf) { parts.push(buf); total += buf.length; buf = '' }
        i += 2
        parts.push({g: readExpr(params)})
        eat('}')
        continue
      }
      buf += c
      i++
    }
    if (buf) { parts.push(buf); total += buf.length }
    if (total > PARSE_LIMITS.maxStringChars) fail('template too long')
    return parts
  }

  const useParam = (name, params) => {
    if (!params.includes(name)) fail(`unknown identifier "${name}"`)
    return {p: name}
  }
  const readTerm = (params) => {
    skipWs()
    const c = src[i]
    if (c === "'" || c === '"') return [readQuoted()]
    if (c === '`') return readTemplate(params)
    if (c === '(') {
      eat('(')
      const e = readExpr(params)
      eat(')')
      return e
    }
    return [useParam(ident(), params)]
  }
  const readSum = (params) => {
    const parts = [...readTerm(params)]
    while (peek('+')) {
      eat('+')
      parts.push(...readTerm(params))
    }
    return parts
  }
  const readExpr = (params) => {
    if (++depth > PARSE_LIMITS.maxDepth * 2) fail('expression too deep')
    const start = i
    skipWs()
    const m = IDENT_RE.exec(src.slice(i, i + 200))
    let result
    if (m) {
      i += m[0].length
      if (peek('?')) {
        useParam(m[0], params)
        eat('?')
        const t = readSum(params)
        eat(':')
        const f = readSum(params)
        result = [{c: m[0], t, f}]
      } else i = start
    }
    if (!result) result = readSum(params)
    depth--
    return result
  }

  // тип параметра: лише слова, |, [] (string, number, any, string | number ...)
  const skipType = () => {
    skipWs()
    while (/[A-Za-z_|\[\] ]/.test(src[i])) i++
  }
  // тип { a: string, b?: number }
  const skipObjType = () => {
    eat('{')
    while (!peek('}')) {
      if (!/[A-Za-z_|\[\]?:, ]/.test(src[i])) fail('bad parameter type')
      i++
    }
    eat('}')
  }

  const readArrow = () => {
    eat('(')
    const params = []
    let destructured = false
    if (peek('{')) {
      // ({ a, b }: {...}) — один аргумент-об'єкт
      destructured = true
      eat('{')
      while (!peek('}')) {
        params.push(ident())
        if (peek(',')) eat(',')
      }
      eat('}')
      if (peek(':')) { eat(':'); skipObjType() }
    } else {
      while (!peek(')')) {
        params.push(ident())
        if (peek('?')) eat('?')
        if (peek(':')) { eat(':'); skipType() }
        if (peek(',')) eat(',')
        else if (!peek(')')) fail('expected "," or ")"')
      }
    }
    for (const p of params) if (FORBIDDEN_KEYS.has(p)) fail(`forbidden parameter "${p}"`)
    eat(')')
    eat('=>')
    return makeFn(params, readExpr(params), destructured)
  }

  const readValue = () => {
    skipWs()
    const c = src[i]
    if (c === '{') return readObject()
    if (c === "'" || c === '"') return readQuoted()
    if (c === '`') return renderParts(readTemplate([]), {})
    if (c === '(') return readArrow()
    fail('unexpected value')
  }

  const readObject = () => {
    if (++depth > PARSE_LIMITS.maxDepth) fail('object too deep')
    eat('{')
    const obj = {}
    while (!peek('}')) {
      skipWs()
      const key = src[i] === "'" || src[i] === '"' ? readQuoted() : ident()
      if (FORBIDDEN_KEYS.has(key)) fail(`forbidden key "${key}"`)
      if (Object.prototype.hasOwnProperty.call(obj, key)) fail(`duplicate key "${key}"`)
      eat(':')
      obj[key] = readValue()
      if (peek(',')) eat(',')
      else if (!peek('}')) fail('expected "," or "}"')
    }
    eat('}')
    depth--
    return obj
  }

  // корінь: `export const <id>(: Type)? = {`
  const m = /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[A-Za-z_$][\w$]*\s*)?=\s*(?=\{)/.exec(src)
  if (!m) throw new Error('root "export const <name> = {" not found')
  // до кореня дозволені лише коментарі, import type і export type (типи в uk.ts)
  const head = src.slice(0, m.index)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/^\s*import\s+type\s[^;\n]*;?\s*$/gm, '')
  if (/\S/.test(head.replace(/export\s+type\s+\w+(<[^>]*>)?\s*=\s*\{[\s\S]*?\n\}/g, ''))) {
    throw new Error('unexpected code before root object')
  }
  i = m.index + m[0].length
  const value = readObject()
  return {name: m[1], value}
}

const renderParts = (parts, env) => {
  let out = ''
  for (const p of parts) {
    if (typeof p === 'string') out += p
    else if ('g' in p) out += renderParts(p.g, env)
    else if ('c' in p) out += renderParts(env[p.c] ? p.t : p.f, env)
    else out += `${env[p.p]}`
  }
  return out
}

// функцію створює сам застосунок: лише підставляє аргументи в розібраний шаблон
const makeFn = (params, body, destructured) => (...args) => {
  const env = {}
  if (destructured) {
    const arg = args[0]
    for (const n of params) env[n] = arg == null ? undefined : arg[n]
  } else {
    params.forEach((n, k) => { env[n] = args[k] })
  }
  return renderParts(body, env)
}
