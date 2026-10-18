import words from './words.json'

export type Level = 'N5' | 'N4' | 'N3'
export const LEVELS: Level[] = ['N5', 'N4', 'N3']

export interface Entry {
  id: string
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
