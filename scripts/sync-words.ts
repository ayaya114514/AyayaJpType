// 从 AyayaJp 的规范词表生成 src/words.json。
// 用法：npm run sync:words [-- <AyayaJp 目录>]，默认 ../AyayaJp
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildWord, wordOf } from '../src/kana.ts'

interface Entry {
  id: string
  headword: string
  reading: string
  romaji: string
  meaning_zh: string
  reading_variants: string[]
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, process.argv[2] ?? '../AyayaJp')
const files = {
  N5: 'n5-codex-vocab.json',
  N4: 'ayaya-n4-codex-vocab.json',
  N3: 'ayaya-n3-codex-vocab.json',
}

// [id, 词形, 主读音, romaji, 中文, 其他读音]
const out: Record<string, [string, string, string, string, string, string[]][]> = {}
const failures: string[] = []
const skipped: string[] = []

for (const [level, file] of Object.entries(files)) {
  const entries = JSON.parse(readFileSync(join(source, file), 'utf8')).entries as Entry[]
  out[level] = []
  for (const e of entries) {
    // 〜円、お〜 这类词缀没法单独完整打出来
    if (/[～〜~]/.test(e.reading + e.romaji)) {
      skipped.push(`${e.id} ${e.headword}`)
      continue
    }
    // 盲打时其他读法也算对（日本 にほん / にっぽん）；「べんきょう (する)」这类带注释的不是另一种读法
    const variants = [...new Set(e.reading_variants)].filter((r) => r !== e.reading && /^[ぁ-ゖァ-ヺー]+$/.test(r))
    try {
      buildWord(e.reading, e.romaji)
      variants.forEach(wordOf)
    } catch (err) {
      failures.push(`${e.id} ${e.headword}：${(err as Error).message}`)
      continue
    }
    out[level].push([e.id, e.headword, e.reading, e.romaji, e.meaning_zh, variants])
  }
}

if (failures.length) {
  console.error(`${failures.length} 个词条的 romaji 无法匹配读音：\n${failures.join('\n')}`)
  process.exit(1)
}

writeFileSync(join(root, 'src/words.json'), JSON.stringify(out) + '\n')
console.log(
  Object.entries(out)
    .map(([level, words]) => `${level} ${words.length}`)
    .join(' · '),
  `（跳过词缀 ${skipped.length} 个，多读音 ${Object.values(out).flat().filter((w) => w[5].length).length} 个）`,
)
