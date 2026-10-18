import { describe, expect, it } from 'vitest'
import { buildWord, Session, Typer, wordOf, type KeyResult } from './kana'
import words from './words.json'

function type(reading: string, romaji: string, keys: string): KeyResult[] {
  const typer = new Typer([buildWord(reading, romaji)])
  return [...keys].map((k) => typer.key(k))
}

const accepts = (reading: string, romaji: string, keys: string) => {
  const results = type(reading, romaji, keys)
  return results.at(-1) === 'done' && !results.includes('miss')
}

describe('Typer', () => {
  it('接受 Hepburn 和訓令式', () => {
    for (const keys of ['shinbun', 'sinbun', 'shimbun'.replace('m', 'n')]) {
      expect(accepts('しんぶん', 'shinbun', keys)).toBe(true)
    }
    expect(accepts('つくえ', 'tsukue', 'tukue')).toBe(true)
    expect(accepts('ちず', 'chizu', 'tizu')).toBe(true)
    expect(accepts('ふね', 'fune', 'hune')).toBe(true)
    expect(accepts('じしょ', 'jisho', 'zisyo')).toBe(true)
    expect(accepts('じしょ', 'jisho', 'jisixyo')).toBe(true)
  })

  it('打错的键不前进', () => {
    expect(type('いぬ', 'inu', 'ixnu')).toEqual(['ok', 'miss', 'ok', 'done'])
  })

  it('ん 接 な 行时 nn 和 n 都可以', () => {
    expect(accepts('おんな', 'onna', 'onna')).toBe(true)
    expect(accepts('おんな', 'onna', 'onnna')).toBe(true)
    expect(type('おんな', 'onna', 'ona')).toEqual(['ok', 'ok', 'miss'])
  })

  it('ん 接元音时不能只打一个 n', () => {
    expect(accepts('げんいん', "gen'in", "gen'in")).toBe(true)
    expect(accepts('げんいん', "gen'in", 'gennin')).toBe(true)
    expect(type('げんいん', "gen'in", 'geni')).toContain('miss')
  })

  it('词尾 ん 打一个 n 就完成', () => {
    expect(type('ほん', 'hon', 'hon')).toEqual(['ok', 'ok', 'done'])
  })

  it('促音：双写辅音、tch、xtu', () => {
    expect(accepts('きって', 'kitte', 'kitte')).toBe(true)
    expect(accepts('きって', 'kitte', 'kixtute')).toBe(true)
    expect(accepts('まっちゃ', 'maccha', 'maccha')).toBe(true)
    expect(accepts('まっちゃ', 'maccha', 'matcha')).toBe(true)
    expect(accepts('まっちゃ', 'maccha', 'mattya')).toBe(true)
  })

  it('长音符号可以打元音或 -', () => {
    expect(accepts('コーヒー', 'koohii', 'koohii')).toBe(true)
    expect(accepts('コーヒー', 'koohii', 'ko-hi-')).toBe(true)
  })

  it('助词 は 只在 romaji 写 wa 的位置接受 wa', () => {
    expect(accepts('じつは', 'jitsu wa', 'jitsuwa')).toBe(true)
    expect(accepts('じつは', 'jitsu wa', 'jitsuha')).toBe(true)
    expect(type('はな', 'hana', 'w')).toEqual(['miss'])
  })

  it('提示按 romaji 的空格分词，按已打内容更新', () => {
    const word = buildWord('きをつける', 'ki o tsukeru')
    expect([...word.gaps]).toEqual([1, 2])
    const typer = new Typer([word])
    for (const k of 'kiot') typer.key(k)
    expect(typer.progress().map(([a, b]) => a + b).join('')).toBe('kiotsukeru')
    typer.key('u')
    expect(typer.progress().map(([a, b]) => a + b).join('')).toBe('kiotukeru')
    expect(typer.index).toBe(3)
  })

  it('多读音：任一读法都算对，显示优先主读音', () => {
    const typer = new Typer([buildWord('つゆ', 'tsuyu'), wordOf('ばいう')])
    expect(typer.progress().map(([, b]) => b).join('')).toBe('tsuyu')
    expect([...'baiu'].map((k) => typer.key(k)).at(-1)).toBe('done')
    expect(new Typer([buildWord('つゆ', 'tsuyu'), wordOf('ばいう')]).key('x')).toBe('miss')
  })

  it('读音和 romaji 对不上时报错', () => {
    expect(() => buildWord('はな', 'hama')).toThrow()
  })
})

function play(queue: [string, string][][], keys: string) {
  const session = new Session(queue.map((readings) => readings.map(([r, roma]) => buildWord(r, roma))))
  for (const k of keys) session.key(k)
  return session
}

describe('Session', () => {
  const hon: [string, string][] = [['ほん', 'hon']]
  const nani: [string, string][] = [['なに', 'nani']]
  const ame: [string, string][] = [['あめ', 'ame']]
  const inu: [string, string][] = [['いぬ', 'inu']]

  it('词尾 ん 多打一个 n 不算错', () => {
    expect(play([hon, ame], 'honname')).toMatchObject({ misses: 0, finished: true })
    expect(play([hon, ame], 'honame')).toMatchObject({ misses: 0, finished: true })
  })

  it('下一个词以 な 行开头时 n / nn 都行', () => {
    expect(play([hon, nani], 'honnnani')).toMatchObject({ misses: 0, finished: true })
    expect(play([hon, nani], 'honnani')).toMatchObject({ misses: 0, finished: true })
  })

  it('何 打 nan 已完成，想打 nani 时多出的 i 不算错', () => {
    const nan: [string, string][] = [['なん', 'nan'], ['なに', 'nani']]
    expect(play([nan, ame], 'naniame')).toMatchObject({ misses: 0, finished: true })
    expect(play([nan, inu], 'naniinu')).toMatchObject({ misses: 0, finished: true })
    expect(play([nan, inu], 'naninu')).toMatchObject({ misses: 0, finished: true })
  })

  it('真打错照样记到对应的词上', () => {
    const session = play([hon, ame], 'hoqnaqme')
    expect(session.finished).toBe(true)
    expect(session.wordMisses).toEqual([1, 1])
  })
})

describe('words.json', () => {
  const all = Object.values(words).flat() as [string, string, string, string, string, string[]][]

  it('三个级别都有词', () => {
    expect(Object.keys(words)).toEqual(['N5', 'N4', 'N3'])
    for (const list of Object.values(words)) expect(list.length).toBeGreaterThan(600)
  })

  it('每个词按词表 romaji 打都能一键不错地打完，提示和 romaji 一致', () => {
    for (const [id, , reading, romaji, , variants] of all) {
      const word = buildWord(reading, romaji)
      const typer = new Typer([word, ...variants.map(wordOf)])
      const plain = romaji.replace(/ /g, '')
      expect(typer.progress().map(([, rest]) => rest).join(''), id).toBe(plain)
      const results = [...plain].map((k) => typer.key(k))
      expect(results.includes('miss'), id).toBe(false)
      expect(results.at(-1), id).toBe('done')
    }
  })
})
