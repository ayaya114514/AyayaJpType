import words from './words.json'

export type Level = 'N5' | 'N4' | 'N3'
export const LEVELS: Level[] = ['N5', 'N4', 'N3']

export interface Entry {
  id: string
  level: Level
  headword: string
  reading: string
  romaji: string
  meaning: string
  /** 其他读法（只有假名），盲打时也算对 */
  variants: string[]
}

export interface Score {
  stars: number
  /** 不看答案、一键没错打完的词数 */
  known: number
  total: number
}

export const STAGE_SIZE = 20

// 打错过或看过答案的词不算会：全会 ★★★，不会 1 个 ★★，不会 2 个 ★，再多就没过关
export const MAX_UNKNOWN = 2

export function starsFor(known: number, total: number): number {
  return Math.max(0, 3 - (total - known))
}

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

/** 每个级别切成若干关，每关 STAGE_SIZE 个左右（余数均摊，不留一个很小的尾关） */
export const STAGES: Record<Level, Entry[][]> = Object.fromEntries(
  LEVELS.map((level) => {
    const entries = words[level].map(
      ([id, headword, reading, romaji, meaning, variants]): Entry => ({
        id: id as string,
        level,
        headword: headword as string,
        reading: reading as string,
        romaji: romaji as string,
        meaning: meaning as string,
        variants: variants as string[],
      }),
    )
    const shuffled = seededShuffle(entries, `ayaya-jp-type:${level}`)
    const count = Math.ceil(shuffled.length / STAGE_SIZE)
    const stages: Entry[][] = []
    for (let i = 0; i < count; i++) {
      stages.push(
        shuffled.slice(Math.round((i * shuffled.length) / count), Math.round(((i + 1) * shuffled.length) / count)),
      )
    }
    return [level, stages]
  }),
) as Record<Level, Entry[][]>

/** 一种算对的答案：主读音（romaji 审核过）、其他读法（只有假名），或中文释义完全相同的另一个词 */
export interface Answer {
  entry: Entry
  reading: string
  romaji: string | null
}

const BY_MEANING = new Map<string, Entry[]>()
const BY_ID = new Map<string, Entry>()
for (const level of LEVELS) {
  for (const entry of STAGES[level].flat()) {
    BY_MEANING.set(entry.meaning, [...(BY_MEANING.get(entry.meaning) ?? []), entry])
    BY_ID.set(entry.id, entry)
  }
}

const answersOf = (entry: Entry): Answer[] => [
  { entry, reading: entry.reading, romaji: entry.romaji },
  ...entry.variants.map((reading) => ({ entry, reading, romaji: null })),
]

/** 题目只显示中文，所以释义完全一样的词（幸福：幸福 / 幸せ）都算对；第一个是题目本身的主读音 */
export function answersFor(entry: Entry): Answer[] {
  const others = (BY_MEANING.get(entry.meaning) ?? []).filter((e) => e !== entry)
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
        const s = score as Score
        if (typeof s?.stars === 'number') progress[level][Number(key)] = s
      }
    }
  } catch {
    // 数据坏了就从头开始
  }
  return progress
}

/** 只保留更好的成绩 */
export function record(progress: Progress, level: Level, stage: number, score: Score) {
  const old = progress[level][stage]
  if (!old || score.stars > old.stars) {
    progress[level][stage] = score
  }
}

export const isPassed = (progress: Progress, level: Level, stage: number) =>
  (progress[level][stage]?.stars ?? 0) > 0

export const isUnlocked = (progress: Progress, level: Level, stage: number) =>
  stage === 0 || isPassed(progress, level, stage - 1)

export const passedCount = (progress: Progress, level: Level) =>
  STAGES[level].filter((_, i) => isPassed(progress, level, i)).length

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

export function parseMistakes(raw: string | null): Mistakes {
  const book: Mistakes = {}
  try {
    const data = JSON.parse(raw ?? 'null') ?? {}
    for (const [id, m] of Object.entries(data)) {
      const { wrong, streak, at } = (m ?? {}) as Mistake
      // 词表更新后已经不存在的词条丢掉
      if (BY_ID.has(id) && [wrong, streak, at].every(Number.isFinite)) book[id] = { wrong, streak, at }
    }
  } catch {
    // 数据坏了就当没有
  }
  return book
}

/** 一个词打完后更新错题集：不会就收进来（连续答对清零），会了就给已在集里的词记一次 */
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
export function mistakeEntries(book: Mistakes, level?: Level): Entry[] {
  return Object.entries(book)
    .sort(([, a], [, b]) => b.at - a.at)
    .map(([id]) => BY_ID.get(id)!)
    .filter((entry) => !level || entry.level === level)
}
