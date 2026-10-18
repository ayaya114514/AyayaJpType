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
    const particle = PARTICLE[toHiragana(unit.kana)]
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

export type KeyResult = 'ok' | 'miss' | 'done' | 'ignored'

interface State {
  /** 当前 unit */
  index: number
  /** 当前 unit 已打的部分 */
  buffer: string
  /** 已完成 unit 各自打的内容 */
  typed: string[]
}

/**
 * 逐键判定。同一串按键可能有多种切分（onna = ん:n + な:na，也可以是 ん:nn 之后再打 na），
 * 所以同时跟踪所有可能的状态，任意一个能接受这个键就算对。打错的键不会被记录。
 */
export class Typer {
  readonly word: Word
  keys = ''
  private states: State[] = [{ index: 0, buffer: '', typed: [] }]

  constructor(word: Word) {
    this.word = word
  }

  get done() {
    return this.states.some((s) => s.index >= this.word.units.length)
  }

  key(k: string): KeyResult {
    if (this.done) return 'ignored'
    const { units } = this.word
    const next: State[] = []
    const seen = new Set<string>()
    const add = (s: State) => {
      const id = `${s.index}:${s.buffer}`
      if (seen.has(id)) return
      seen.add(id)
      next.push(s)
    }
    for (const s of this.states) {
      if (s.index >= units.length) continue
      const buffer = s.buffer + k
      const alts = units[s.index].alts
      if (!alts.some((a) => a.startsWith(buffer))) continue
      if (alts.some((a) => a !== buffer && a.startsWith(buffer))) add({ ...s, buffer })
      if (alts.includes(buffer)) add({ index: s.index + 1, buffer: '', typed: [...s.typed, buffer] })
    }
    if (next.length === 0) return 'miss'
    this.states = next
    this.keys += k
    return this.done ? 'done' : 'ok'
  }

  /** 剩余部分最短的那条切分，用来画提示 */
  private best(): { state: State; current: string } {
    const { units } = this.word
    let best: { state: State; current: string; left: number } | null = null
    for (const state of this.states) {
      if (state.index >= units.length) return { state, current: '' }
      const unit = units[state.index]
      const current = unit.alts.find((a) => a.startsWith(state.buffer)) ?? unit.alts[0]
      const left =
        current.length - state.buffer.length +
        units.slice(state.index + 1).reduce((sum, u) => sum + u.alts[0].length, 0)
      if (!best || left < best.left) best = { state, current, left }
    }
    return best!
  }

  /** 已完成的 unit 数（读音着色用） */
  get index() {
    return this.best().state.index
  }

  /** 提示用：每个 unit 的 [已打, 未打] */
  progress(): [string, string][] {
    const { state, current } = this.best()
    return this.word.units.map((unit, i): [string, string] => {
      if (i < state.index) return [state.typed[i], '']
      if (i === state.index) return [state.buffer, current.slice(state.buffer.length)]
      return ['', unit.alts[0]]
    })
  }

  /** 这个词是不是以只打了一个 n 的 ん 结束 */
  endsWithSingleN() {
    const end = this.states.find((s) => s.index >= this.word.units.length)
    return end?.typed.at(-1) === 'n'
  }
}
