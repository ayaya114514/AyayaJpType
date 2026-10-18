import './style.css'
import { buildWord, Typer } from './kana'
import {
  isPassed,
  isUnlocked,
  LEVELS,
  parseProgress,
  passedCount,
  record,
  shuffle,
  STAGES,
  STAR_RULES,
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
const upnextEl = $<HTMLParagraphElement>('upnext')

const PROGRESS_KEY = 'ayaya-jp-type:progress'
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
  index: number
  typer: Typer
  startedAt: number
  endedAt: number
  correct: number
  misses: number
  wordMisses: number[]
  /** 上一个词以只打了一个 n 的 ん 结束：紧接着的 n 可能是习惯性的 nn */
  strayN: boolean
  heldN: boolean
}

let run: Run | null = null
let ticker = 0

function startStage(lv: Level, stage: number) {
  const words = shuffle(STAGES[lv][stage])
  run = {
    level: lv,
    stage,
    words,
    index: 0,
    typer: new Typer(buildWord(words[0].reading, words[0].romaji)),
    startedAt: 0,
    endedAt: 0,
    correct: 0,
    misses: 0,
    wordMisses: words.map(() => 0),
    strayN: false,
    heldN: false,
  }
  whereEl.textContent = `${lv} · 第 ${stage + 1} 关`
  warnEl.hidden = true
  show('play')
  renderWord()
  renderLive()
  clearInterval(ticker)
  ticker = window.setInterval(renderLive, 250)
  focusKeys()
}

function focusKeys() {
  keysInput.value = ''
  lastValue = ''
  keysInput.focus({ preventScroll: true })
}

const elapsedMinutes = (r: Run) => ((r.endedAt || performance.now()) - r.startedAt) / 60000
const accuracyOf = (r: Run) => (r.correct + r.misses ? r.correct / (r.correct + r.misses) : 1)
const kpmOf = (r: Run) => (r.startedAt ? r.correct / Math.max(elapsedMinutes(r), 1 / 600) : 0)

function renderLive() {
  if (!run) return
  const counter = `${Math.min(run.index + 1, run.words.length)} / ${run.words.length}`
  liveEl.textContent = run.startedAt
    ? `${counter} · ${Math.round(accuracyOf(run) * 100)}% · ${Math.round(kpmOf(run))} 键/分`
    : counter
}

function renderWord() {
  if (!run) return
  const entry = run.words[run.index]
  const kanaOnly = entry.headword === entry.reading
  headwordEl.textContent = kanaOnly ? '' : entry.headword
  headwordEl.hidden = kanaOnly
  readingEl.classList.toggle('solo', kanaOnly)
  meaningEl.textContent = entry.meaning
  const upcoming = run.words[run.index + 1]
  upnextEl.textContent = upcoming ? `下一个 ${upcoming.headword}` : ''
  fillEl.style.width = `${(run.index / run.words.length) * 100}%`
  renderTyping()
}

function renderTyping() {
  if (!run) return
  const { typer } = run
  const { units, gaps } = typer.word
  const doneUnits = typer.index

  readingEl.replaceChildren(
    ...units.map((unit, i) => el('span', i < doneUnits ? 'done' : '', unit.kana)),
  )

  const parts: HTMLElement[] = []
  let cursorPlaced = false
  typer.progress().forEach(([typed, rest], i) => {
    if (gaps.has(i)) parts.push(el('span', 'gap', ' '))
    if (typed) parts.push(el('span', 'typed', typed))
    if (!rest) return
    if (!cursorPlaced) {
      parts.push(el('span', 'cursor', rest[0]))
      if (rest.length > 1) parts.push(el('span', '', rest.slice(1)))
      cursorPlaced = true
    } else {
      parts.push(el('span', '', rest))
    }
  })
  romajiEl.replaceChildren(...parts)
}

let missTimer = 0
function flashMiss() {
  card.classList.remove('miss')
  void card.offsetWidth
  card.classList.add('miss')
  clearTimeout(missTimer)
  missTimer = window.setTimeout(() => card.classList.remove('miss'), 220)
}

function handleChar(ch: string) {
  if (!run || screen !== 'play') return
  const k = ch.toLowerCase()
  if (!/^[a-z'-]$/.test(k)) return
  if (!run.startedAt) run.startedAt = performance.now()
  warnEl.hidden = true

  // 上个词词尾的 ん 只打了一个 n：先扣住紧接着的 n，看下一键再决定它是不是多余的
  if (run.strayN) {
    run.strayN = false
    if (k === 'n') {
      run.heldN = true
      return
    }
  }
  if (run.heldN) {
    run.heldN = false
    if (k !== 'n' && run.typer.key('n') !== 'miss') run.correct += 1
  }

  const outcome = run.typer.key(k)
  if (outcome === 'ignored') return
  if (outcome === 'miss') {
    run.misses += 1
    run.wordMisses[run.index] += 1
    flashMiss()
    return
  }
  run.correct += 1
  if (outcome === 'done') nextWord()
  else renderTyping()
}

function nextWord() {
  if (!run) return
  run.strayN = run.typer.endsWithSingleN()
  run.index += 1
  if (run.index >= run.words.length) {
    finish()
    return
  }
  const entry = run.words[run.index]
  run.typer = new Typer(buildWord(entry.reading, entry.romaji))
  renderWord()
  renderLive()
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
  clearInterval(ticker)
  run.endedAt = performance.now()
  fillEl.style.width = '100%'
  keysInput.blur()

  const accuracy = accuracyOf(run)
  const kpm = Math.round(kpmOf(run))
  const stars = starsFor(accuracy, kpm)
  if (stars > 0) {
    record(progress, run.level, run.stage, { stars, accuracy, kpm })
    storage.set(PROGRESS_KEY, JSON.stringify(progress))
  }
  last = { level: run.level, stage: run.stage, passed: stars > 0 }

  resultStars.textContent = starText(stars)
  resultStars.classList.toggle('none', stars === 0)
  resultTitle.textContent = `${run.level} 第 ${run.stage + 1} 关 ${stars > 0 ? '通过' : '未通过'}`

  const seconds = Math.round(elapsedMinutes(run) * 60)
  numbersEl.replaceChildren(
    ...[
      ['准确率', `${(accuracy * 100).toFixed(1)}%`],
      ['速度', `${kpm} 键/分`],
      ['用时', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`],
      ['错键', String(run.misses)],
    ].map(([label, value]) => {
      const box = el('div')
      box.append(el('dt', '', label), el('dd', '', value))
      return box
    }),
  )
  rulesEl.textContent = STAR_RULES.map(
    (r) => `${'★'.repeat(r.stars)} 准确率 ${r.accuracy * 100}%` + (r.kpm ? ` 且 ${r.kpm} 键/分` : ''),
  ).join(' · ')

  const target = following(run.level, run.stage)
  nextButton.hidden = !(stars > 0 && target)
  if (target) nextButton.firstChild!.textContent = target[0] === run.level ? '下一关 ' : `${target[0]} 第 1 关 `

  const missed = run.words
    .map((entry, i) => ({ entry, count: run!.wordMisses[i] }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count)
  missedEl.replaceChildren(
    ...missed.map(({ entry, count }) => {
      const li = el('li')
      const word = el('span', 'word')
      word.lang = 'ja'
      word.append(el('b', '', entry.headword))
      if (entry.headword !== entry.reading) word.append(el('span', 'kana', entry.reading))
      li.append(word, el('span', 'roma', entry.romaji), el('span', 'zh', entry.meaning), el('span', 'misses', `错 ${count}`))
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
