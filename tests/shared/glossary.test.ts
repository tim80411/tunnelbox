import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join, resolve, relative, dirname } from 'path'
import { fileURLToPath } from 'url'
import { BANNED_TERMS } from '../../src/shared/copy/glossary'

/**
 * 文案禁用詞回歸 guard（沿用 admission-radar copy-verify 的 guard-first 精神）。
 *
 * 掃 src/**\/*.{ts,tsx}，剝註解後比對 glossary 的 BANNED_TERMS。
 * BANNED_TERMS 只收「任何程式碼語境都不會合法出現」的 token（中文詞 / 帶連字號的文案專用字），
 * 故直接子字串比對即可，毋須 AST。英文技術詞（Provider/Port/Tunnel…）不在此守備範圍。
 */

const HERE = dirname(fileURLToPath(import.meta.url)) // tests/shared
const REPO_ROOT = resolve(HERE, '../..')
const SRC_ROOT = join(REPO_ROOT, 'src')

// 允許清單：定本檔本身會合法列出所有禁用字，必須跳過（本測試檔在 tests/ 下、不在 src/ 掃描範圍）
const ALLOWLIST = new Set<string>([join(SRC_ROOT, 'shared', 'copy', 'glossary.ts')])

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      collectSourceFiles(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !ALLOWLIST.has(full)) {
      acc.push(full)
    }
  }
  return acc
}

// 剝除註解以降低「僅出現在註解」的誤報；lookbehind 排除 :// 以保留 URL
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '') // 區塊註解 / JSDoc
    .replace(/(?<!:)\/\/[^\n]*/g, '') // 行內註解（不吃 https://）
}

describe('文案禁用詞回歸 guard（glossary SSOT）', () => {
  it('src 內不得出現任何 BANNED_TERMS（中國用語 / paywall 框架 / 已決議翻譯的英文行話）', () => {
    const files = collectSourceFiles(SRC_ROOT)
    const violations: string[] = []
    for (const file of files) {
      const stripped = stripComments(readFileSync(file, 'utf8'))
      for (const { term, suggest } of BANNED_TERMS) {
        if (stripped.includes(term)) {
          violations.push(`${relative(REPO_ROOT, file)}: 「${term}」→ 改用「${suggest}」`)
        }
      }
    }
    expect(violations, `\n發現禁用詞：\n${violations.join('\n')}\n`).toEqual([])
  })
})
