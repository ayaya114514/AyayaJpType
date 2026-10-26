import words from './words.json'

export type Level = 'N5' | 'N4' | 'N3'
export const LEVELS: Level[] = ['N5', 'N4', 'N3']

/** 单词，或者句子 */
export type Kind = 'word' | 'sentence'

export interface Entry {
  id: string
  level: Level
  /** 单词的词形；句子的日文原句 */
  headword: string
  /** 读音假名（句子去掉了标点） */
  reading: string
  romaji: string
  /** 中文释义或翻译，也就是题目 */
  meaning: string
  /** 其他读法（只有假名），盲打时也算对 */
  variants: string[]
}

export interface Score {
  /** 不看答案打完的个数 */
  known: number
  total: number
}

// 看过答案的算错（中途打错的键只影响准确率）；一关对这么多个就解锁下一关
export const PASS_KNOWN = 5

export const errorsOf = (score: Score) => score.total - score.known

export const passes = (score: Score) => score.known >= Math.min(PASS_KNOWN, score.total)

// 固定种子的洗牌：词表是按五十音排的，打乱后每关混着来，但每次打开分关都一样
function seededShuffle<T>(list: T[], seed: string): T[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const rand = () => {
    h = (h + 0x6d2b79f5) | 0
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function shuffle<T>(list: T[]): T[] {
  return seededShuffle(list, String(Math.random()))
}

/** 一套题：按级别分好关，带按 id / 中文查找的索引 */
export interface Deck {
  kind: Kind
  stageSize: number
  stages: Record<Level, Entry[][]>
  byId: Map<string, Entry>
  byMeaning: Map<string, Entry[]>
}

/** 每个级别切成若干关，每关 stageSize 个左右（余数均摊，不留一个很小的尾关） */
function makeDeck(kind: Kind, entries: Record<Level, Entry[]>, stageSize: number): Deck {
  const deck: Deck = {
    kind,
    stageSize,
    stages: { N5: [], N4: [], N3: [] },
    byId: new Map(),
    byMeaning: new Map(),
  }
  for (const level of LEVELS) {
    const shuffled = seededShuffle(entries[level], `ayaya-jp-type:${kind === 'word' ? '' : `${kind}:`}${level}`)
    const count = Math.ceil(shuffled.length / stageSize)
    for (let i = 0; i < count; i++) {
      deck.stages[level].push(
        shuffled.slice(Math.round((i * shuffled.length) / count), Math.round(((i + 1) * shuffled.length) / count)),
      )
    }
    for (const entry of entries[level]) {
      deck.byId.set(entry.id, entry)
      deck.byMeaning.set(entry.meaning, [...(deck.byMeaning.get(entry.meaning) ?? []), entry])
    }
  }
  return deck
}

export const WORDS = makeDeck(
  'word',
  Object.fromEntries(
    LEVELS.map((level) => [
      level,
      words[level].map(
        ([id, headword, reading, romaji, meaning, variants]): Entry => ({
          id: id as string,
          level,
          headword: headword as string,
          reading: reading as string,
          romaji: romaji as string,
          meaning: meaning as string,
          variants: variants as string[],
        }),
      ),
    ]),
  ) as Record<Level, Entry[]>,
  20,
)

export type SentenceData = Record<Level, [string, string, string, string][]>

/** 句子以原句为 id（同一句只收一次） */
export function makeSentenceDeck(data: SentenceData): Deck {
  return makeDeck(
    'sentence',
    Object.fromEntries(
      LEVELS.map((level) => [
        level,
        data[level].map(([ja, reading, romaji, zh]): Entry => ({
          id: ja,
          level,
          headword: ja,
          reading,
          romaji,
          meaning: zh,
          variants: [],
        })),
      ]),
    ) as Record<Level, Entry[]>,
    10,
  )
}

let sentences: Promise<Deck> | null = null

/** 句子数据比较大，切到句子模式时才加载 */
export function loadSentences(): Promise<Deck> {
  sentences ??= import('./sentences.json').then((mod) => makeSentenceDeck(mod.default as SentenceData))
  return sentences
}

/** 一种算对的答案：主读音（romaji 审核过）、其他读法（只有假名），或中文完全相同的另一条 */
export interface Answer {
  entry: Entry
  reading: string
  romaji: string | null
}

const answersOf = (entry: Entry): Answer[] => [
  { entry, reading: entry.reading, romaji: entry.romaji },
  ...entry.variants.map((reading) => ({ entry, reading, romaji: null })),
]

/** 题目只显示中文，所以中文完全一样的（价格；价钱：値段 / 値）都算对；第一个是题目本身的主读音 */
export function answersFor(deck: Deck, entry: Entry): Answer[] {
  const others = (deck.byMeaning.get(entry.meaning) ?? []).filter((e) => e !== entry)
  return [...answersOf(entry), ...others.flatMap(answersOf)]
}

export type Progress = Record<Level, Record<number, Score>>

export const emptyProgress = (): Progress => ({ N5: {}, N4: {}, N3: {} })

export function parseProgress(raw: string | null): Progress {
  const progress = emptyProgress()
  try {
    const data = JSON.parse(raw ?? 'null')
    for (const level of LEVELS) {
      for (const [key, score] of Object.entries(data?.[level] ?? {})) {
        // 旧存档多一个 stars 字段，只取 known / total
        const { known, total } = (score ?? {}) as Score
        if (Number.isInteger(known) && Number.isInteger(total) && known >= 0 && known <= total) {
          progress[level][Number(key)] = { known, total }
        }
      }
    }
  } catch {
    // 数据坏了就从头开始
  }
  return progress
}

/** 只保留错得最少的那次（没过关的也记，路线图上显示错几个） */
export function record(progress: Progress, level: Level, stage: number, score: Score) {
  const old = progress[level][stage]
  if (!old || errorsOf(score) < errorsOf(old)) {
    progress[level][stage] = score
  }
}

export const isPassed = (progress: Progress, level: Level, stage: number) => {
  const score = progress[level][stage]
  return Boolean(score && passes(score))
}

export const isUnlocked = (progress: Progress, level: Level, stage: number) =>
  stage === 0 || isPassed(progress, level, stage - 1)

export const passedCount = (deck: Deck, progress: Progress, level: Level) =>
  deck.stages[level].filter((_, i) => isPassed(progress, level, i)).length

// ---- 错题集 ----

export interface Mistake {
  /** 累计不会的次数 */
  wrong: number
  /** 之后连续答对的次数 */
  streak: number
  /** 最近一次不会的时间 */
  at: number
}

export type Mistakes = Record<string, Mistake>

/** 连续答对这么多次才移出错题集，避免蒙对一次就清掉 */
export const CLEAR_STREAK = 2

export function parseMistakes(deck: Deck, raw: string | null): Mistakes {
  const book: Mistakes = {}
  try {
    const data = JSON.parse(raw ?? 'null') ?? {}
    for (const [id, m] of Object.entries(data)) {
      const { wrong, streak, at } = (m ?? {}) as Mistake
      // 词表更新后已经不存在的条目丢掉
      if (deck.byId.has(id) && [wrong, streak, at].every(Number.isFinite)) book[id] = { wrong, streak, at }
    }
  } catch {
    // 数据坏了就当没有
  }
  return book
}

/** 打完一条后更新错题集：看过答案就收进来（连续答对清零），会了就给已在集里的记一次 */
export function markMistake(book: Mistakes, id: string, known: boolean, now = Date.now()) {
  const old = book[id]
  if (!known) {
    book[id] = { wrong: (old?.wrong ?? 0) + 1, streak: 0, at: now }
    return
  }
  if (!old) return
  old.streak += 1
  if (old.streak >= CLEAR_STREAK) delete book[id]
}

/** 错题，最近不会的在前 */
export function mistakeEntries(deck: Deck, book: Mistakes, level?: Level): Entry[] {
  return Object.entries(book)
    .sort(([, a], [, b]) => b.at - a.at)
    .flatMap(([id]) => deck.byId.get(id) ?? [])
    .filter((entry) => !level || entry.level === level)
}
