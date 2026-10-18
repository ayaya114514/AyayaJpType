import './style.css'
import { buildWord, Session, wordOf } from './kana'
import {
  isPassed,
  isUnlocked,
  LEVELS,
  MAX_UNKNOWN,
  parseProgress,
  passedCount,
  record,
  shuffle,
  STAGES,
  starsFor,
  type Entry,
  type Level,
} from './game'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const home = $<HTMLElement>('home')
const play = $<HTMLElement>('play')
const result = $<HTMLElement>('result')
const levelsEl = $<HTMLDivElement>('levels')
const stagesEl = $<HTMLOListElement>('stages')
const whereEl = $<HTMLSpanElement>('where')
const liveEl = $<HTMLSpanElement>('live')
const fillEl = $<HTMLDivElement>('fill')
const card = $<HTMLDivElement>('card')
const headwordEl = $<HTMLDivElement>('headword')
const readingEl = $<HTMLDivElement>('reading')
const meaningEl = $<HTMLDivElement>('meaning')
const romajiEl = $<HTMLDivElement>('romaji')
const keysInput = $<HTMLInputElement>('keys')
const warnEl = $<HTMLParagraphElement>('warn')
const previousEl = $<HTMLParagraphElement>('previous')
const revealButton = $<HTMLButtonElement>('reveal')

// v2：改成盲打后星级按“会的词数”算，和之前看提示打的成绩不可比
const PROGRESS_KEY = 'ayaya-jp-type:progress:v2'
const LEVEL_KEY = 'ayaya-jp-type:level'

// localStorage 在隐私模式等情况下可能抛错，读写都兜住
const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // 存不下就算了，只影响下次打开
    }
  },
}

const progress = parseProgress(storage.get(PROGRESS_KEY))
let level: Level = LEVELS.find((l) => l === storage.get(LEVEL_KEY)) ?? 'N5'

type Screen = 'home' | 'play' | 'result'
let screen: Screen = 'home'

function show(next: Screen) {
  screen = next
  home.hidden = next !== 'home'
  play.hidden = next !== 'play'
  result.hidden = next !== 'result'
  window.scrollTo(0, 0)
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

const starText = (stars: number) => '★'.repeat(stars) + '☆'.repeat(3 - stars)

// ---- 选关 ----

/** 第一个还没过的关（全过了就是最后一关） */
const currentStage = (lv: Level) => {
  const i = STAGES[lv].findIndex((_, s) => !isPassed(progress, lv, s))
  return i === -1 ? STAGES[lv].length - 1 : i
}

function renderHome() {
  levelsEl.replaceChildren(
    ...LEVELS.map((lv) => {
      const tab = el('button', 'level')
      tab.type = 'button'
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(lv === level))
      tab.append(el('span', 'name', lv), el('span', 'count', `${passedCount(progress, lv)} / ${STAGES[lv].length}`))
      tab.addEventListener('click', () => {
        level = lv
        storage.set(LEVEL_KEY, lv)
        renderHome()
      })
      return tab
    }),
  )

  const current = currentStage(level)
  stagesEl.replaceChildren(
    ...STAGES[level].map((words, i) => {
      const li = el('li')
      const button = el('button', 'stage')
      button.type = 'button'
      const score = progress[level][i]
      const unlocked = isUnlocked(progress, level, i)
      button.disabled = !unlocked
      if (i === current && unlocked) button.classList.add('current')
      button.append(el('span', 'num', String(i + 1)), el('span', 'stars', starText(score?.stars ?? 0)))
      button.setAttribute(
        'aria-label',
        `第 ${i + 1} 关，${words.length} 词，` + (unlocked ? (score ? `${score.stars} 星` : '未通过') : '未解锁'),
      )
      button.addEventListener('click', () => startStage(level, i))
      li.append(button)
      return li
    }),
  )
}

function showHome() {
  show('home')
  renderHome()
  stagesEl.querySelector<HTMLButtonElement>('.current')?.focus({ preventScroll: true })
}

// ---- 打字 ----

interface Run {
  level: Level
  stage: number
  words: Entry[]
  session: Session
  /** 看过答案的词 */
  revealed: boolean[]
  startedAt: number
  endedAt: number
}

let run: Run | null = null
let ticker = 0

function startStage(lv: Level, stage: number) {
  const words = shuffle(STAGES[lv][stage])
  run = {
    level: lv,
    stage,
    words,
    session: new Session(words.map((e) => [buildWord(e.reading, e.romaji), ...e.variants.map(wordOf)])),
    revealed: words.map(() => false),
    startedAt: 0,
    endedAt: 0,
  }
  whereEl.textContent = `${lv} · 第 ${stage + 1} 关`
  warnEl.hidden = true
  previousEl.replaceChildren()
  show('play')
  renderWord()
  renderLive()
  clearInterval(ticker)
  ticker = window.setInterval(renderLive, 500)
  focusKeys()
}

function focusKeys() {
  keysInput.value = ''
  lastValue = ''
  keysInput.focus({ preventScroll: true })
}

const elapsedMinutes = (r: Run) => ((r.endedAt || performance.now()) - r.startedAt) / 60000
const accuracyOf = ({ session }: Run) =>
  session.correct + session.misses ? session.correct / (session.correct + session.misses) : 1
const isKnown = (r: Run, i: number) => !r.revealed[i] && r.session.wordMisses[i] === 0

function renderLive() {
  if (!run) return
  const { session, words } = run
  const counter = `${Math.min(session.index + 1, words.length)} / ${words.length}`
  const unknown = words.slice(0, session.index + 1).filter((_, i) => !isKnown(run!, i)).length
  liveEl.textContent = run.startedAt ? `${counter} · 不会 ${unknown}` : counter
}

function renderWord() {
  if (!run) return
  const { session, words } = run
  const entry = words[session.index]
  const kanaOnly = entry.headword === entry.reading
  headwordEl.textContent = kanaOnly ? '' : entry.headword
  headwordEl.hidden = kanaOnly
  readingEl.classList.toggle('solo', kanaOnly)
  meaningEl.textContent = entry.meaning
  revealButton.hidden = false
  fillEl.style.width = `${(session.index / words.length) * 100}%`
  renderTyping()
}

function renderTyping() {
  if (!run) return
  const { session } = run
  const { typer } = session
  const revealed = run.revealed[session.index]
  const kanaOnly = run.words[session.index].headword === run.words[session.index].reading
  // 盲打：读音只显示打对的部分；假名词的词形本身就是读音，看答案后也整个显示
  const { units, gaps } = typer.word
  const doneUnits = typer.index
  readingEl.replaceChildren(
    ...units.flatMap((unit, i) => {
      if (i < doneUnits) return [el('span', 'done', unit.kana)]
      return revealed || kanaOnly ? [el('span', '', unit.kana)] : []
    }),
  )

  const parts: HTMLElement[] = []
  let caretPlaced = false
  typer.progress().forEach(([typed, rest], i) => {
    if (gaps.has(i) && (revealed || typed)) parts.push(el('span', 'gap', ' '))
    if (typed) parts.push(el('span', 'typed', typed))
    if (!rest || caretPlaced) {
      if (rest && revealed) parts.push(el('span', '', rest))
      return
    }
    caretPlaced = true
    if (revealed) {
      parts.push(el('span', 'cursor', rest[0]))
      if (rest.length > 1) parts.push(el('span', '', rest.slice(1)))
    } else {
      parts.push(el('span', 'caret'))
    }
  })
  romajiEl.replaceChildren(...parts)
  romajiEl.classList.toggle('revealed', revealed)
}

/** 卡片下方显示刚打完的词的答案 */
function renderPrevious(entry: Entry, known: boolean) {
  const word = el('span', 'word')
  word.lang = 'ja'
  word.append(el('b', '', entry.headword))
  if (entry.headword !== entry.reading) word.append(el('span', 'kana', entry.reading))
  previousEl.replaceChildren(
    el('span', known ? 'mark ok' : 'mark no', known ? '✓' : '✗'),
    word,
    el('span', 'roma', entry.romaji),
  )
}

let missTimer = 0
function flashMiss() {
  card.classList.remove('miss')
  void card.offsetWidth
  card.classList.add('miss')
  clearTimeout(missTimer)
  missTimer = window.setTimeout(() => card.classList.remove('miss'), 220)
}

function reveal() {
  if (!run || screen !== 'play') return
  run.revealed[run.session.index] = true
  if (!run.startedAt) run.startedAt = performance.now()
  revealButton.hidden = true
  renderTyping()
  renderLive()
  focusKeys()
}

function handleChar(ch: string) {
  if (!run || screen !== 'play') return
  const k = ch.toLowerCase()
  if (!/^[a-z'-]$/.test(k)) return
  if (!run.startedAt) run.startedAt = performance.now()
  warnEl.hidden = true

  const { session } = run
  const before = session.index
  const events = session.key(k)
  if (events.includes('miss')) flashMiss()
  if (session.index === before) {
    if (events.length) renderTyping()
    return
  }
  const last = session.index - 1
  renderPrevious(run.words[last], isKnown(run, last))
  if (session.finished) finish()
  else {
    renderWord()
    renderLive()
  }
}

// 桌面端走 keydown；手机软键盘的 keydown 常常是 Unidentified，改从 input 事件取字符
let lastValue = ''
keysInput.addEventListener('input', () => {
  const value = keysInput.value
  if (/[^\x00-\x7f]/.test(value)) {
    warnEl.hidden = false
    focusKeys()
    return
  }
  const added = value.startsWith(lastValue) ? value.slice(lastValue.length) : ''
  lastValue = value
  for (const ch of added) handleChar(ch)
  if (value.length > 40) focusKeys()
})
keysInput.addEventListener('compositionstart', () => {
  warnEl.hidden = false
})
card.addEventListener('click', () => focusKeys())
revealButton.addEventListener('click', reveal)
$('quit').addEventListener('click', () => leavePlay())

function leavePlay() {
  clearInterval(ticker)
  run = null
  keysInput.blur()
  showHome()
}

// ---- 结算 ----

const resultStars = $<HTMLDivElement>('result-stars')
const resultTitle = $<HTMLHeadingElement>('result-title')
const numbersEl = $<HTMLDListElement>('numbers')
const rulesEl = $<HTMLParagraphElement>('rules')
const missedEl = $<HTMLUListElement>('missed')
const nextButton = $<HTMLButtonElement>('next')

let last: { level: Level; stage: number; passed: boolean } | null = null

/** 下一关；一个级别打完接下一个级别的第 1 关 */
function following(lv: Level, stage: number): [Level, number] | null {
  if (stage + 1 < STAGES[lv].length) return [lv, stage + 1]
  const nextLevel = LEVELS[LEVELS.indexOf(lv) + 1]
  return nextLevel ? [nextLevel, 0] : null
}

function finish() {
  if (!run) return
  const r = run
  clearInterval(ticker)
  r.endedAt = performance.now()
  fillEl.style.width = '100%'
  keysInput.blur()

  const total = r.words.length
  const known = r.words.filter((_, i) => isKnown(r, i)).length
  const stars = starsFor(known, total)
  if (stars > 0) {
    record(progress, r.level, r.stage, { stars, known, total })
    storage.set(PROGRESS_KEY, JSON.stringify(progress))
  }
  last = { level: r.level, stage: r.stage, passed: stars > 0 }

  resultStars.textContent = starText(stars)
  resultStars.classList.toggle('none', stars === 0)
  resultTitle.textContent = `${r.level} 第 ${r.stage + 1} 关 ${stars > 0 ? '通过' : '未通过'}`

  const seconds = Math.round(elapsedMinutes(r) * 60)
  numbersEl.replaceChildren(
    ...[
      ['会', `${known} / ${total}`],
      ['看答案', String(r.revealed.filter(Boolean).length)],
      ['准确率', `${(accuracyOf(r) * 100).toFixed(1)}%`],
      ['用时', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`],
    ].map(([label, value]) => {
      const box = el('div')
      box.append(el('dt', '', label), el('dd', '', value))
      return box
    }),
  )
  rulesEl.textContent =
    `★★★ 全会 · ★★ 不会 1 个 · ★ 不会 ${MAX_UNKNOWN} 个 · 打错过或看过答案的词算不会`

  const target = following(r.level, r.stage)
  nextButton.hidden = !(stars > 0 && target)
  if (target) nextButton.firstChild!.textContent = target[0] === r.level ? '下一关 ' : `${target[0]} 第 1 关 `

  const missed = r.words
    .map((entry, i) => ({ entry, count: r.session.wordMisses[i], revealed: r.revealed[i] }))
    .filter((m) => m.revealed || m.count > 0)
    .sort((a, b) => Number(b.revealed) - Number(a.revealed) || b.count - a.count)
  missedEl.replaceChildren(
    ...missed.map(({ entry, count, revealed }) => {
      const li = el('li')
      const word = el('span', 'word')
      word.lang = 'ja'
      word.append(el('b', '', entry.headword))
      if (entry.headword !== entry.reading) word.append(el('span', 'kana', entry.reading))
      li.append(
        word,
        el('span', 'roma', entry.romaji),
        el('span', 'zh', entry.meaning),
        el('span', 'misses', revealed ? '看答案' : `错 ${count}`),
      )
      return li
    }),
  )
  missedEl.hidden = missed.length === 0

  run = null
  show('result')
  ;(nextButton.hidden ? $<HTMLButtonElement>('retry') : nextButton).focus({ preventScroll: true })
}

function goNext() {
  if (!last?.passed) return
  const target = following(last.level, last.stage)
  if (!target) return
  if (target[0] !== level) {
    level = target[0]
    storage.set(LEVEL_KEY, level)
  }
  startStage(...target)
}
const retry = () => last && startStage(last.level, last.stage)

$('retry').addEventListener('click', retry)
nextButton.addEventListener('click', goNext)
$('back').addEventListener('click', showHome)

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (screen === 'play') {
    if (e.key === 'Escape') {
      e.preventDefault()
      leavePlay()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      reveal()
      return
    }
    if (e.isComposing || e.key === 'Process') {
      warnEl.hidden = false
      return
    }
    if (e.key.length === 1) {
      e.preventDefault()
      handleChar(e.key)
    }
    return
  }
  if (screen === 'result') {
    // Enter 交给获得焦点的按钮，避免一次回车触发两次
    if (e.key === 'Escape') showHome()
    else if (e.key === 'r' || e.key === 'R') retry()
  }
})

showHome()
