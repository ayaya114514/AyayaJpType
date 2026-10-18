import { describe, expect, it } from 'vitest'
import {
  answersFor,
  makeSentenceDeck,
  markMistake,
  mistakeEntries,
  parseMistakes,
  WORDS,
  type Answer,
  type Mistakes,
  type SentenceData,
} from './game'
import { buildWord, Session, Typer, wordOf } from './kana'
import sentenceData from './sentences.json'

const SENTENCES = makeSentenceDeck(sentenceData as SentenceData)
const find = (headword: string) => WORDS.stages.N3.flat().find((e) => e.headword === headword)!
const toWords = (answers: Answer[]) =>
  answers.map((a) => (a.romaji ? buildWord(a.reading, a.romaji) : wordOf(a.reading)))

describe('answersFor', () => {
  it('释义完全一样的词互相算对，题目本身排第一', () => {
    const answers = answersFor(WORDS, find('幸福'))
    expect(answers.map((a) => a.reading)).toEqual(['こうふく', 'しあわせ'])
  })

  it('Session 记下实际打的是哪个答案', () => {
    const answers = answersFor(WORDS, find('幸福'))
    const session = new Session([toWords(answers)])
    for (const k of 'shiawase') session.key(k)
    expect(session.finished).toBe(true)
    expect(session.misses).toBe(0)
    expect(answers[session.answered[0]].entry.headword).toBe('幸せ')
  })
})

describe('错题集', () => {
  const [a, b] = WORDS.stages.N5[0]

  it('不会就收进来，连续答对 2 次才移出，中间再错重新计数', () => {
    const book: Mistakes = {}
    markMistake(book, a.id, true)
    expect(book).toEqual({})
    markMistake(book, a.id, false, 1)
    markMistake(book, a.id, true)
    markMistake(book, a.id, false, 2)
    expect(book[a.id]).toEqual({ wrong: 2, streak: 0, at: 2 })
    markMistake(book, a.id, true)
    expect(book[a.id].streak).toBe(1)
    markMistake(book, a.id, true)
    expect(book[a.id]).toBeUndefined()
  })

  it('最近不会的在前，可按级别筛选', () => {
    const book: Mistakes = {}
    const n3 = WORDS.stages.N3[0][0]
    markMistake(book, a.id, false, 1)
    markMistake(book, b.id, false, 2)
    markMistake(book, n3.id, false, 3)
    expect(mistakeEntries(WORDS, book).map((e) => e.id)).toEqual([n3.id, b.id, a.id])
    expect(mistakeEntries(WORDS, book, 'N5').map((e) => e.id)).toEqual([b.id, a.id])
  })

  it('读取时丢掉坏数据和已不存在的条目', () => {
    const raw = JSON.stringify({
      [a.id]: { wrong: 1, streak: 0, at: 5 },
      'n9-001': { wrong: 1, streak: 0, at: 1 },
      [b.id]: 'x',
    })
    expect(parseMistakes(WORDS, raw)).toEqual({ [a.id]: { wrong: 1, streak: 0, at: 5 } })
    expect(parseMistakes(WORDS, '{oops')).toEqual({})
    // 单词和句子的错题集分开，互不认对方的 id
    expect(parseMistakes(SENTENCES, raw)).toEqual({})
  })
})

describe('句子', () => {
  const all = [...SENTENCES.byId.values()]

  it('三个级别都有句子，每关 10 句左右', () => {
    expect(all.length).toBeGreaterThan(9000)
    for (const stages of Object.values(SENTENCES.stages)) {
      for (const stage of stages) expect(stage.length).toBeGreaterThanOrEqual(9)
    }
  })

  it('每句按 AyayaJp 的 romaji 打都能一键不错地打完，标点不用打，提示和 romaji 一致', () => {
    for (const entry of all) {
      const word = buildWord(entry.reading, entry.romaji)
      const typer = new Typer([word])
      const plain = entry.romaji.replace(/ /g, '')
      expect(typer.progress().map(([, rest]) => rest).join(''), entry.id).toBe(plain)
      const results = [...plain].map((k) => typer.key(k))
      expect(results.includes('miss'), entry.id).toBe(false)
      expect(results.at(-1), entry.id).toBe('done')
    }
  })

  it('助词 は / を 两种打法都行，词界处 ん 打一个 n 也行', () => {
    const typer = () => new Typer([buildWord('あねにほんをかりました', 'ane ni hon o karimashita')])
    for (const keys of ['anenihonokarimashita', 'anenihonnwokarimashita']) {
      const t = typer()
      expect([...keys].map((k) => t.key(k)).at(-1), keys).toBe('done')
    }
    const t = new Typer([buildWord('わたしはがくせいです', 'watashi wa gakusei desu')])
    expect([...'watashihagakuseidesu'].map((k) => t.key(k)).at(-1)).toBe('done')
  })

  it('中文完全一样的句子互相算对', () => {
    const [entry] = SENTENCES.byMeaning.get('那位是老师')!
    expect(answersFor(SENTENCES, entry).length).toBeGreaterThan(1)
  })
})
