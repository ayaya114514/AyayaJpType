import { describe, expect, it } from 'vitest'
import { answersFor, STAGES } from './game'
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
