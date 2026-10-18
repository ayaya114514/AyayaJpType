import { describe, expect, it } from 'vitest'
import { buildWord, Typer, type KeyResult } from './kana'
import words from './words.json'

function type(reading: string, romaji: string, keys: string): KeyResult[] {
  const typer = new Typer(buildWord(reading, romaji))
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
    const typer = new Typer(buildWord('ほん', 'hon'))
    for (const k of 'hon') typer.key(k)
    expect(typer.endsWithSingleN()).toBe(true)
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
    const typer = new Typer(word)
    for (const k of 'kiot') typer.key(k)
    expect(typer.progress().map(([a, b]) => a + b).join('')).toBe('kiotsukeru')
    typer.key('u')
    expect(typer.progress().map(([a, b]) => a + b).join('')).toBe('kiotukeru')
    expect(typer.index).toBe(3)
  })

  it('读音和 romaji 对不上时报错', () => {
    expect(() => buildWord('はな', 'hama')).toThrow()
  })
})

describe('words.json', () => {
  const all = Object.values(words).flat()

  it('三个级别都有词', () => {
    expect(Object.keys(words)).toEqual(['N5', 'N4', 'N3'])
    for (const list of Object.values(words)) expect(list.length).toBeGreaterThan(600)
  })

  it('每个词按词表 romaji 打都能一键不错地打完，提示和 romaji 一致', () => {
    for (const [id, , reading, romaji] of all) {
      const word = buildWord(reading, romaji)
      const typer = new Typer(word)
      const plain = romaji.replace(/ /g, '')
      expect(typer.progress().map(([, rest]) => rest).join(''), id).toBe(plain)
      const results = [...plain].map((k) => typer.key(k))
      expect(results.includes('miss'), id).toBe(false)
      expect(results.at(-1), id).toBe('done')
    }
  })
})
