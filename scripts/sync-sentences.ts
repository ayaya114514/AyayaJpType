// 从 AyayaJp 生成 src/sentences.json：单词例句 + 语法例句，读音和罗马音取 AyayaJp 页面上实际显示的
// （card-data.js 用审核过的注音和分词算出来的），不在这里另外推断。
// 用法：npm run sync:sentences [-- <AyayaJp 目录>]，默认 ../AyayaJp
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildWord } from '../src/kana.ts'

interface Example {
  ja: string
  zh: string
  romaji: string
  romajiSpacing: string
  ruby: [string, string | null][]
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, process.argv[2] ?? '../AyayaJp')
const require = createRequire(import.meta.url)
const { buildRuntime } = require(join(source, 'scripts/validation-lib.js'))
const runtime = buildRuntime()

// 打字时不用打的标点和空白
const PUNCT = /[、。，,！!？?「」『』（）()・…〜~：:；;\s　]/g

const LEVELS = ['N5', 'N4', 'N3'] as const
// [原句, 去掉标点的读音, romaji（只留字母、' 和词间空格）, 中文]
const out: Record<string, [string, string, string, string][]> = {}
const seen = new Set<string>()
const skipped: string[] = []

for (const level of LEVELS) {
  out[level] = []
  // 同一句先出现在哪个级别就归哪个级别；单词例句在前，语法例句在后
  const cards = [...runtime.vocabCardsByLevel[level], ...runtime.grammarCardsByLevel[level]]
  for (const ex of cards.flatMap((card: { examples?: Example[] }) => card.examples ?? []) as Example[]) {
    if (seen.has(ex.ja)) continue
    seen.add(ex.ja)
    const kana = ex.ruby.map(([surface, reading]) => reading ?? surface).join('').replace(PUNCT, '')
    const romaji = ex.romaji.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/ +/g, ' ').trim()
    // 罗马音没审核过分词、含数字或拉丁字母（CD、ATM）、还有没注音的汉字：读音拿不准，不收
    if (ex.romajiSpacing !== 'reviewed' || /[0-9０-９]/.test(ex.romaji) || !/^[ぁ-ゖァ-ヺー]+$/.test(kana)) {
      skipped.push(ex.ja)
      continue
    }
    try {
      buildWord(kana, romaji)
    } catch {
      skipped.push(ex.ja)
      continue
    }
    out[level].push([ex.ja, kana, romaji, ex.zh])
  }
}

writeFileSync(join(root, 'src/sentences.json'), JSON.stringify(out) + '\n')
console.log(
  LEVELS.map((level) => `${level} ${out[level].length}`).join(' · '),
  `（跳过 ${skipped.length} 句：${skipped.join('、')}）`,
)
