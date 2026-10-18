// 假名读音 → 可接受的罗马音打法。
// 每个 Unit 是一段假名（单个假名、拗音、促音+后一个音节）和它所有可接受的打法，
// 第一个打法是提示里显示的那个（和词表里审核过的 romaji 一致）。

export interface Unit {
  kana: string
  alts: string[]
}

export interface Word {
  units: Unit[]
  /** 在这些 unit 前面显示一个空格（来自词表 romaji 里的词间空格） */
  gaps: Set<number>
}

const SINGLE: Record<string, string[]> = {
  あ: ['a'], い: ['i', 'yi'], う: ['u', 'wu', 'whu'], え: ['e'], お: ['o'],
  か: ['ka', 'ca'], き: ['ki'], く: ['ku', 'cu', 'qu'], け: ['ke'], こ: ['ko', 'co'],
  さ: ['sa'], し: ['shi', 'si', 'ci'], す: ['su'], せ: ['se', 'ce'], そ: ['so'],
  た: ['ta'], ち: ['chi', 'ti'], つ: ['tsu', 'tu'], て: ['te'], と: ['to'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['fu', 'hu'], へ: ['he'], ほ: ['ho'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], を: ['o', 'wo'],
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  ざ: ['za'], じ: ['ji', 'zi'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  だ: ['da'], ぢ: ['ji', 'di'], づ: ['zu', 'du'], で: ['de'], ど: ['do'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  ゔ: ['vu'],
  ぁ: ['xa', 'la'], ぃ: ['xi', 'li'], ぅ: ['xu', 'lu'], ぇ: ['xe', 'le'], ぉ: ['xo', 'lo'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'], ゎ: ['xwa', 'lwa'],
}

const SOKUON = ['xtu', 'ltu', 'xtsu', 'ltsu']
const N_ALTS = ['nn', "n'", 'xn']

// 拗音和外来语用的两字组合。拆开打（kixya）另外自动生成。
const COMBO: Record<string, string[]> = {
  しゃ: ['sha', 'sya'], しゅ: ['shu', 'syu'], しょ: ['sho', 'syo'], しぇ: ['she', 'sye'],
  じゃ: ['ja', 'jya', 'zya'], じゅ: ['ju', 'jyu', 'zyu'], じょ: ['jo', 'jyo', 'zyo'], じぇ: ['je', 'jye', 'zye'],
  ちゃ: ['cha', 'tya', 'cya'], ちゅ: ['chu', 'tyu', 'cyu'], ちょ: ['cho', 'tyo', 'cyo'], ちぇ: ['che', 'tye', 'cye'],
  ぢゃ: ['dya'], ぢゅ: ['dyu'], ぢょ: ['dyo'],
  ふぁ: ['fa'], ふぃ: ['fi'], ふぇ: ['fe'], ふぉ: ['fo'], ふゅ: ['fyu'],
  てぃ: ['ti', 'thi'], てゅ: ['thu'], でぃ: ['di', 'dhi'], でゅ: ['dyu', 'dhu'],
  とぅ: ['tu', 'twu'], どぅ: ['du', 'dwu'],
  うぃ: ['wi', 'whi'], うぇ: ['we', 'whe'], うぉ: ['wo', 'who'],
  ゔぁ: ['va'], ゔぃ: ['vi'], ゔぇ: ['ve'], ゔぉ: ['vo'],
  つぁ: ['tsa'], つぃ: ['tsi'], つぇ: ['tse'], つぉ: ['tso'],
  いぇ: ['ye'], くぁ: ['kwa', 'qa'], ぐぁ: ['gwa'],
}
for (const [head, c] of Object.entries({ き: 'k', ぎ: 'g', に: 'n', ひ: 'h', び: 'b', ぴ: 'p', み: 'm', り: 'r' })) {
  for (const [small, v] of [['ゃ', 'a'], ['ゅ', 'u'], ['ょ', 'o'], ['ぇ', 'e']]) COMBO[head + small] = [`${c}y${v}`]
}

const VOWEL_OF = (romaji: string) => romaji.at(-1) ?? ''
const isConsonant = (ch: string) => /[bcdfghjklmpqrstvwxyz]/.test(ch)

export function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
}

const uniq = (list: string[]) => [...new Set(list)]

/** 把假名读音切成 unit。不认识的字符抛错（调用方据此排除词条）。 */
export function buildUnits(reading: string): Unit[] {
  const kana = toHiragana(reading)
  const raw: Unit[] = []
  for (let i = 0; i < kana.length; ) {
    const pair = kana.slice(i, i + 2)
    const ch = kana[i]
    if (COMBO[pair]) {
      const split = SINGLE[pair[0]].flatMap((a) => SINGLE[pair[1]].map((b) => a + b))
      raw.push({ kana: reading.slice(i, i + 2), alts: uniq([...COMBO[pair], ...split]) })
      i += 2
    } else if (ch === 'ー') {
      const prev = raw.at(-1)
      if (!prev || ['っ', 'ん'].includes(toHiragana(prev.kana))) throw new Error(`长音前没有元音：${reading}`)
      raw.push({ kana: reading[i], alts: [VOWEL_OF(prev.alts[0]), '-'] })
      i += 1
    } else if (ch === 'っ' || ch === 'ん' || SINGLE[ch]) {
      raw.push({ kana: reading[i], alts: SINGLE[ch] ?? [] })
      i += 1
    } else {
      throw new Error(`无法识别的字符「${reading[i]}」：${reading}`)
    }
  }

  // ん：后面接元音 / y 开头的音时不能只打一个 n（kani ≠ かんい）
  raw.forEach((unit, i) => {
    if (toHiragana(unit.kana) !== 'ん') return
    const next = raw[i + 1]
    const single = !next || next.alts.every((a) => !/^[aiueoy']/.test(a))
    unit.alts = single ? ['n', ...N_ALTS] : [...N_ALTS]
  })

  // っ：和后一个 unit 合并，双写其辅音，或者 xtu / ltu 单独打
  const units: Unit[] = []
  for (let i = 0; i < raw.length; i++) {
    const unit = raw[i]
    if (toHiragana(unit.kana) !== 'っ') {
      units.push(unit)
      continue
    }
    const next = raw[i + 1]
    if (!next || toHiragana(next.kana) === 'っ') {
      units.push({ kana: unit.kana, alts: SOKUON })
      continue
    }
    const doubled = next.alts.flatMap((a) => {
      if (!isConsonant(a[0]) || a[0] === 'n') return []
      return a.startsWith('ch') ? [a[0] + a, 't' + a] : [a[0] + a]
    })
    const separate = SOKUON.flatMap((s) => next.alts.map((a) => s + a))
    units.push({ kana: unit.kana + next.kana, alts: uniq([...doubled, ...separate]) })
    i += 1
  }
  return units
}

// 助词 は / へ 读 wa / e，只在词表 romaji 这么写的位置才接受（はな 不能打成 wana）
const PARTICLE: Record<string, string> = { は: 'wa', へ: 'e' }

/**
 * 按词表里审核过的 romaji 给每个 unit 排好首选打法。
 * romaji 无法用这些 unit 拼出来时抛错。
 */
export function buildWord(reading: string, romaji: string): Word {
  const units = buildUnits(reading)
  const target = romaji.toLowerCase()
  const plain = target.replace(/ /g, '')
  const chosen: string[] = []

  const options = (unit: Unit) => {
    const kana = toHiragana(unit.kana)
    // 句子里 ん 后面隔着词界接元音时 romaji 写成 hon o，这时只打一个 n 也对
    if (kana === 'ん') return [...unit.alts, 'n']
    const particle = PARTICLE[kana]
    return particle ? [...unit.alts, particle] : unit.alts
  }
  const search = (i: number, pos: number): boolean => {
    if (i === units.length) return pos === plain.length
    for (const alt of options(units[i])) {
      if (plain.startsWith(alt, pos) && search(i + 1, pos + alt.length)) {
        chosen[i] = alt
        return true
      }
    }
    return false
  }
  if (!search(0, 0)) throw new Error(`romaji「${romaji}」和读音「${reading}」对不上`)

  const gaps = new Set<number>()
  let pos = 0
  let spaces = 0
  units.forEach((unit, i) => {
    if (target[pos + spaces] === ' ') {
      gaps.add(i)
      spaces += 1
    }
    pos += chosen[i].length
    unit.alts = uniq([chosen[i], ...unit.alts])
  })
  return { units, gaps }
}

/** 只有假名、没有审核过 romaji 的读音（多读音词的其他读法）：只用于判定，不用于显示 */
export function wordOf(reading: string): Word {
  return { units: buildUnits(reading), gaps: new Set() }
}

export type KeyResult = 'ok' | 'miss' | 'done'

interface State {
  /** 第几种读法 */
  word: number
  /** 当前 unit */
  index: number
  /** 当前 unit 已打的部分 */
  buffer: string
  /** 已完成 unit 各自打的内容 */
  typed: string[]
}

/**
 * 逐键判定。同一串按键可能有多种切分（onna = ん:n + な:na，也可以是 ん:nn 之后再打 na），
 * 一个词也可能有多种读法（日本 にほん / にっぽん），所以同时跟踪所有可能的状态，
 * 任意一个能接受这个键就算对。打错的键不会被记录。
 */
export class Typer {
  readonly words: Word[]
  private states: State[]

  /** words[0] 是主读音，显示和看答案都用它 */
  constructor(words: Word[], states?: State[]) {
    this.words = words
    this.states = states ?? words.map((_, word) => ({ word, index: 0, buffer: '', typed: [] }))
  }

  clone() {
    return new Typer(this.words, this.states)
  }

  private isEnd = (s: State) => s.index >= this.words[s.word].units.length

  get done() {
    return this.states.some(this.isEnd)
  }

  /** 还有没打完的读法（じゃ 打完了，じゃあ 还能继续） */
  get live() {
    return this.states.some((s) => !this.isEnd(s))
  }

  private step(k: string): State[] {
    const next: State[] = []
    const seen = new Set<string>()
    const add = (s: State) => {
      const id = `${s.word}:${s.index}:${s.buffer}`
      if (seen.has(id)) return
      seen.add(id)
      next.push(s)
    }
    for (const s of this.states) {
      if (this.isEnd(s)) continue
      const buffer = s.buffer + k
      const alts = this.words[s.word].units[s.index].alts
      if (!alts.some((a) => a.startsWith(buffer))) continue
      if (alts.some((a) => a !== buffer && a.startsWith(buffer))) add({ ...s, buffer })
      if (alts.includes(buffer)) add({ ...s, index: s.index + 1, buffer: '', typed: [...s.typed, buffer] })
    }
    return next
  }

  accepts(k: string) {
    return this.step(k).length > 0
  }

  /** 在还没打完的读法上继续打；词已经完成后也能用（Session 判断多打的键） */
  key(k: string): KeyResult {
    const next = this.step(k)
    if (next.length === 0) return 'miss'
    this.states = next
    return this.done ? 'done' : 'ok'
  }

  /** 优先主读音；同一读法里取剩余最短的那条切分 */
  private best(): { state: State; current: string } {
    const finished = this.states.find(this.isEnd)
    if (finished) return { state: finished, current: '' }
    const word = Math.min(...this.states.map((s) => s.word))
    let best: { state: State; current: string; left: number } | null = null
    for (const state of this.states) {
      if (state.word !== word) continue
      const { units } = this.words[word]
      const unit = units[state.index]
      const current = unit.alts.find((a) => a.startsWith(state.buffer)) ?? unit.alts[0]
      const left =
        current.length - state.buffer.length +
        units.slice(state.index + 1).reduce((sum, u) => sum + u.alts[0].length, 0)
      if (!best || left < best.left) best = { state, current, left }
    }
    return best!
  }

  /** 当前最可能在打的那个读法 */
  get word(): Word {
    return this.words[this.best().state.word]
  }

  /** 已完成的 unit 数（读音着色用） */
  get index() {
    return this.best().state.index
  }

  /** 每个 unit 的 [已打, 未打] */
  progress(): [string, string][] {
    const { state, current } = this.best()
    return this.words[state.word].units.map((unit, i): [string, string] => {
      if (i < state.index) return [state.typed[i], '']
      if (i === state.index) return [state.buffer, current.slice(state.buffer.length)]
      return ['', unit.alts[0]]
    })
  }
}

/**
 * 一关的连续输入。词一完成就切到下一个词，但上一个词可能还能继续打：
 * 词尾 ん 打了一个 n 之后习惯性再打 n，或者 何 打到 nan 已经算 なん 完成、其实想打 nani。
 * 这种多出来的键：下一个词接不住就吞掉；两边都接得住就先扣住，看再下一个键归谁。
 */
export class Session {
  readonly queue: Word[][]
  index = 0
  typer: Typer
  correct = 0
  misses = 0
  wordMisses: number[]
  /** 每个词最后是按第几种答案打完的 */
  answered: number[] = []
  private prev: Typer | null = null
  private held: string | null = null

  constructor(queue: Word[][]) {
    this.queue = queue
    this.typer = new Typer(queue[0])
    this.wordMisses = queue.map(() => 0)
  }

  get finished() {
    return this.index >= this.queue.length
  }

  /** 返回这个键实际生效的结果（被吞掉或扣住时为空） */
  key(k: string): KeyResult[] {
    if (this.finished) return []
    const events: KeyResult[] = []

    if (this.held !== null) {
      const held = this.held
      this.held = null
      const trial = this.typer.clone()
      if (trial.key(held) !== 'miss' && (trial.done || trial.accepts(k))) {
        this.apply(held, events)
      } else if (!this.typer.accepts(k)) {
        this.apply(held, events)
      }
      // 否则扣住的键是上一个词多打的，丢掉
      if (!this.finished) this.apply(k, events)
      return events
    }

    if (this.prev) {
      const prev = this.prev
      this.prev = null
      if (prev.accepts(k)) {
        if (!this.typer.accepts(k)) {
          prev.key(k)
          this.prev = prev.live ? prev : null
        } else {
          this.held = k
        }
        return events
      }
    }

    this.apply(k, events)
    return events
  }

  private apply(k: string, events: KeyResult[]) {
    const result = this.typer.key(k)
    events.push(result)
    if (result === 'miss') {
      this.misses += 1
      this.wordMisses[this.index] += 1
      return
    }
    this.correct += 1
    if (result !== 'done') return
    this.answered[this.index] = this.typer.words.indexOf(this.typer.word)
    this.prev = this.typer.live ? this.typer : null
    this.index += 1
    if (!this.finished) this.typer = new Typer(this.queue[this.index])
  }
}
