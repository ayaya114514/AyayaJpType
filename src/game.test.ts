import { describe, expect, it } from 'vitest'
import { answersFor, markMistake, mistakeEntries, parseMistakes, STAGES, type Mistakes } from './game'
import { buildWord, Session, wordOf } from './kana'

const find = (headword: string) => STAGES.N3.flat().find((e) => e.headword === headword)!

describe('answersFor', () => {
  it('释义完全一样的词互相算对，题目本身排第一', () => {
    const answers = answersFor(find('幸福'))
    expect(answers.map((a) => a.reading)).toEqual(['こうふく', 'しあわせ'])
  })

  it('Session 记下实际打的是哪个答案', () => {
    const answers = answersFor(find('幸福'))
    const session = new Session([answers.map((a) => (a.romaji ? buildWord(a.reading, a.romaji) : wordOf(a.reading)))])
    for (const k of 'shiawase') session.key(k)
    expect(session.finished).toBe(true)
    expect(session.misses).toBe(0)
    expect(answers[session.answered[0]].entry.headword).toBe('幸せ')
  })
})

describe('错题集', () => {
  const [a, b] = STAGES.N5[0]

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
    markMistake(book, a.id, false, 1)
    markMistake(book, b.id, false, 2)
    markMistake(book, STAGES.N3[0][0].id, false, 3)
    expect(mistakeEntries(book).map((e) => e.id)).toEqual([STAGES.N3[0][0].id, b.id, a.id])
    expect(mistakeEntries(book, 'N5').map((e) => e.id)).toEqual([b.id, a.id])
  })

  it('读取时丢掉坏数据和已不存在的词条', () => {
    const raw = JSON.stringify({ [a.id]: { wrong: 1, streak: 0, at: 5 }, 'n9-001': { wrong: 1, streak: 0, at: 1 }, [b.id]: 'x' })
    expect(parseMistakes(raw)).toEqual({ [a.id]: { wrong: 1, streak: 0, at: 5 } })
    expect(parseMistakes('{oops')).toEqual({})
  })
})
