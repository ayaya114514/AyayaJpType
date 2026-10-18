import './style.css'
import { buildWord, Session, wordOf } from './kana'
import {
  answersFor,
  CLEAR_STREAK,
  isPassed,
  isUnlocked,
  LEVELS,
  loadSentences,
  markMistake,
  MAX_UNKNOWN,
  mistakeEntries,
  parseMistakes,
  parseProgress,
  passedCount,
  record,
  shuffle,
  starsFor,
  WORDS,
  type Answer,
  type Deck,
  type Entry,
  type Kind,
  type Level,
  type Mistakes,
  type Progress,
} from './game'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const home = $<HTMLElement>('home')
const bookSection = $<HTMLElement>('book')
const play = $<HTMLElement>('play')
const result = $<HTMLElement>('result')
const kindsEl = $<HTMLDivElement>('kinds')
const levelsEl = $<HTMLDivElement>('levels')
const stagesEl = $<HTMLOListElement>('stages')
const loadingEl = $<HTMLParagraphElement>('loading')
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

const KIND_KEY = 'ayaya-jp-type:kind'
// 单词沿用原来的 key；progress:v2 是改成盲打后星级按“会的词数”算的版本
const KEYS: Record<Kind, { progress: string; mistakes: string; level: string }> = {
  word: {
    progress: 'ayaya-jp-type:progress:v2',
    mistakes: 'ayaya-jp-type:mistakes',
    level: 'ayaya-jp-type:level',
  },
  sentence: {
    progress: 'ayaya-jp-type:sentence-progress',
    mistakes: 'ayaya-jp-type:sentence-mistakes',
    level: 'ayaya-jp-type:sentence-level',
  },
}
const KIND_NAMES: Record<Kind, string> = { word: '单词', sentence: '句子' }
const UNIT: Record<Kind, string> = { word: '个', sentence: '句' }

/** 一种模式的题库和存档 */
interface Book {
  kind: Kind
  deck: Deck
  progress: Progress
  mistakes: Mistakes
  level: Level
}

function openBook(kind: Kind, deck: Deck): Book {
  const keys = KEYS[kind]
  return {
    kind,
    deck,
    progress: parseProgress(storage.get(keys.progress)),
    mistakes: parseMistakes(deck, storage.get(keys.mistakes)),
    level: LEVELS.find((l) => l === storage.get(keys.level)) ?? 'N5',
  }
}

const books: Partial<Record<Kind, Book>> = { word: openBook('word', WORDS) }
let kind: Kind = storage.get(KIND_KEY) === 'sentence' ? 'sentence' : 'word'

const saveProgress = (b: Book) => storage.set(KEYS[b.kind].progress, JSON.stringify(b.progress))
const saveMistakes = (b: Book) => storage.set(KEYS[b.kind].mistakes, JSON.stringify(b.mistakes))
const saveLevel = (b: Book) => storage.set(KEYS[b.kind].level, b.level)

/** 当前模式的 Book；句子还没加载完时为 null */
const current = () => books[kind] ?? null

type Screen = 'home' | 'book' | 'play' | 'result'
let screen: Screen = 'home'

function show(next: Screen) {
  screen = next
  home.hidden = next !== 'home'
  bookSection.hidden = next !== 'book'
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
const currentStage = (b: Book) => {
  const i = b.deck.stages[b.level].findIndex((_, s) => !isPassed(b.progress, b.level, s))
  return i === -1 ? b.deck.stages[b.level].length - 1 : i
}

function renderKinds() {
  kindsEl.replaceChildren(
    ...(['word', 'sentence'] as Kind[]).map((k) => {
      const tab = el('button', 'kind', KIND_NAMES[k])
      tab.type = 'button'
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(k === kind))
      tab.addEventListener('click', () => switchKind(k))
      return tab
    }),
  )
}

async function switchKind(k: Kind) {
  kind = k
  storage.set(KIND_KEY, k)
  renderHome()
  if (books[k]) return
  try {
    books[k] = openBook(k, await loadSentences())
  } catch {
    loadingEl.textContent = '句子加载失败，请刷新重试'
    return
  }
  if (kind === k && screen === 'home') showHome()
}

function renderHome() {
  renderKinds()
  const b = current()
  loadingEl.hidden = Boolean(b)
  levelsEl.hidden = !b
  stagesEl.hidden = !b
  if (!b) {
    loadingEl.textContent = '句子加载中'
    return
  }

  levelsEl.replaceChildren(
    ...LEVELS.map((lv) => {
      const tab = el('button', 'level')
      tab.type = 'button'
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(lv === b.level))
      tab.append(
        el('span', 'name', lv),
        el('span', 'count', `${passedCount(b.deck, b.progress, lv)} / ${b.deck.stages[lv].length}`),
      )
      tab.addEventListener('click', () => {
        b.level = lv
        saveLevel(b)
        renderHome()
      })
      return tab
    }),
  )
  const bookTab = el('button', 'level book-tab')
  bookTab.type = 'button'
  bookTab.append(el('span', 'name', '错题'), el('span', 'count', String(mistakeEntries(b.deck, b.mistakes).length)))
  bookTab.addEventListener('click', () => showBook())
  levelsEl.append(bookTab)

  const now = currentStage(b)
  stagesEl.replaceChildren(
    ...b.deck.stages[b.level].map((entries, i) => {
      const li = el('li')
      const button = el('button', 'stage')
      button.type = 'button'
      const score = b.progress[b.level][i]
      const unlocked = isUnlocked(b.progress, b.level, i)
      button.disabled = !unlocked
      if (i === now && unlocked) button.classList.add('current')
      button.append(el('span', 'num', String(i + 1)), el('span', 'stars', starText(score?.stars ?? 0)))
      button.setAttribute(
        'aria-label',
        `第 ${i + 1} 关，${entries.length} ${UNIT[b.kind]}，` +
          (unlocked ? (score ? `${score.stars} 星` : '未通过') : '未解锁'),
      )
      button.addEventListener('click', () => startStage(b, b.level, i))
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

// ---- 错题集 ----

type BookFilter = Level | 'all'
let bookFilter: BookFilter = 'all'

const bookTitle = $<HTMLSpanElement>('book-title')
const bookFiltersEl = $<HTMLDivElement>('book-filters')
const bookStart = $<HTMLButtonElement>('book-start')
const bookEmpty = $<HTMLParagraphElement>('book-empty')
const bookList = $<HTMLUListElement>('book-list')

const filtered = (b: Book, filter: BookFilter) =>
  mistakeEntries(b.deck, b.mistakes, filter === 'all' ? undefined : filter)

/** 词形 + 假名；句子只放原句（读音太长，看 romaji 就够） */
function entryCell(b: Book, entry: Entry, reading = entry.reading) {
  const cell = el('span', 'word')
  cell.lang = 'ja'
  cell.append(el('b', '', entry.headword))
  if (b.kind === 'word' && entry.headword !== reading) cell.append(el('span', 'kana', reading))
  return cell
}

function entryRow(b: Book, entry: Entry, status: string) {
  const li = el('li', b.kind === 'sentence' ? 'sentence' : '')
  li.append(
    entryCell(b, entry),
    el('span', 'roma', entry.romaji),
    el('span', 'zh', entry.meaning),
    el('span', 'misses', status),
  )
  return li
}

function renderBook() {
  const b = current()
  if (!b) return
  bookTitle.textContent = `${KIND_NAMES[b.kind]}错题集`
  bookFiltersEl.replaceChildren(
    ...(['all', ...LEVELS] as BookFilter[]).map((f) => {
      const tab = el('button', 'filter')
      tab.type = 'button'
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(f === bookFilter))
      tab.append(el('span', 'name', f === 'all' ? '全部' : f), el('span', 'count', String(filtered(b, f).length)))
      tab.addEventListener('click', () => {
        bookFilter = f
        renderBook()
      })
      return tab
    }),
  )
  const entries = filtered(b, bookFilter)
  bookStart.textContent = `开始练习 ${Math.min(entries.length, b.deck.stageSize)} ${UNIT[b.kind]}`
  bookStart.hidden = entries.length === 0
  bookEmpty.hidden = entries.length > 0
  bookList.replaceChildren(
    ...entries.map((entry) => {
      const m = b.mistakes[entry.id]
      const status =
        `${bookFilter === 'all' ? `${entry.level} · ` : ''}错 ${m.wrong}` +
        (m.streak ? ` · 对 ${m.streak}/${CLEAR_STREAK}` : '')
      return entryRow(b, entry, status)
    }),
  )
}

function showBook() {
  if (!current()) return
  show('book')
  renderBook()
  if (!bookStart.hidden) bookStart.focus({ preventScroll: true })
}

/** 最近不会的一关的量，打乱顺序练 */
function startReview(b: Book, filter: BookFilter) {
  const entries = filtered(b, filter).slice(0, b.deck.stageSize)
  if (entries.length) startRun(b, shuffle(entries), { review: filter })
}

bookStart.addEventListener('click', () => {
  const b = current()
  if (b) startReview(b, bookFilter)
})
$('book-back').addEventListener('click', showHome)

// ---- 打字 ----

/** 闯关，或者错题练习（不计星、不影响解锁） */
type Mode = { level: Level; stage: number } | { review: BookFilter }

interface Run {
  book: Book
  mode: Mode
  entries: Entry[]
  /** 每条所有算对的答案，和 session 里的读法一一对应 */
  answers: Answer[][]
  session: Session
  /** 看过答案的 */
  revealed: boolean[]
  startedAt: number
  endedAt: number
}

let run: Run | null = null
let ticker = 0

function startStage(b: Book, lv: Level, stage: number) {
  startRun(b, shuffle(b.deck.stages[lv][stage]), { level: lv, stage })
}

function startRun(b: Book, entries: Entry[], mode: Mode) {
  const answers = entries.map((e) => answersFor(b.deck, e))
  run = {
    book: b,
    mode,
    entries,
    answers,
    session: new Session(
      answers.map((list) => list.map((a) => (a.romaji ? buildWord(a.reading, a.romaji) : wordOf(a.reading)))),
    ),
    revealed: entries.map(() => false),
    startedAt: 0,
    endedAt: 0,
  }
  const prefix = b.kind === 'sentence' ? '句子 · ' : ''
  whereEl.textContent = 'review' in mode ? `${prefix}错题练习` : `${prefix}${mode.level} · 第 ${mode.stage + 1} 关`
  card.classList.toggle('sentence', b.kind === 'sentence')
  warnEl.hidden = true
  previousEl.replaceChildren()
  show('play')
  renderEntry()
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
// 打出来就算会（中途打错的键只影响准确率），只有看过答案才算不会
const isKnown = (r: Run, i: number) => !r.revealed[i]

function renderLive() {
  if (!run) return
  const { session, entries } = run
  const counter = `${Math.min(session.index + 1, entries.length)} / ${entries.length}`
  const unknown = entries.slice(0, session.index + 1).filter((_, i) => !isKnown(run!, i)).length
  liveEl.textContent = run.startedAt ? `${counter} · 不会 ${unknown}` : counter
}

function renderEntry() {
  if (!run) return
  const { session, entries } = run
  const entry = entries[session.index]
  // 题目只有中文；词形 / 原句在看答案后才出现
  headwordEl.textContent = entry.headword
  headwordEl.hidden = true
  meaningEl.textContent = entry.meaning
  revealButton.hidden = false
  fillEl.style.width = `${(session.index / entries.length) * 100}%`
  renderTyping()
}

function renderTyping() {
  if (!run) return
  const { session } = run
  const { typer } = session
  const revealed = run.revealed[session.index]
  const entry = run.entries[session.index]
  headwordEl.hidden = !revealed || entry.headword === entry.reading
  // 盲打：读音只显示打对的部分，看答案后整个显示
  const { units, gaps } = typer.word
  const doneUnits = typer.index
  readingEl.replaceChildren(
    ...units.flatMap((unit, i) => {
      if (i < doneUnits) return [el('span', 'done', unit.kana)]
      return revealed ? [el('span', '', unit.kana)] : []
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

/** 卡片下方显示刚打完的那条：按你实际打的那个答案显示（其他读法没有审核过的 romaji，就不显示 romaji） */
function renderPrevious(b: Book, answer: Answer, known: boolean) {
  previousEl.replaceChildren(
    el('span', known ? 'mark ok' : 'mark no', known ? '✓' : '✗'),
    entryCell(b, answer.entry, answer.reading),
  )
  if (answer.romaji) previousEl.append(el('span', 'roma', answer.romaji))
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

  const { session, book } = run
  const before = session.index
  const events = session.key(k)
  if (events.includes('miss')) flashMiss()
  if (session.index === before) {
    if (events.length) renderTyping()
    return
  }
  const last = session.index - 1
  const known = isKnown(run, last)
  markMistake(book.mistakes, run.entries[last].id, known)
  saveMistakes(book)
  renderPrevious(book, run.answers[last][session.answered[last]] ?? run.answers[last][0], known)
  if (session.finished) finish()
  else {
    renderEntry()
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
  const review = run && 'review' in run.mode
  clearInterval(ticker)
  run = null
  keysInput.blur()
  if (review) showBook()
  else showHome()
}

// ---- 结算 ----

const resultStars = $<HTMLDivElement>('result-stars')
const resultTitle = $<HTMLHeadingElement>('result-title')
const numbersEl = $<HTMLDListElement>('numbers')
const rulesEl = $<HTMLParagraphElement>('rules')
const missedEl = $<HTMLUListElement>('missed')
const nextButton = $<HTMLButtonElement>('next')
const nextLabel = $<HTMLSpanElement>('next-label')
const backLabel = $<HTMLSpanElement>('back-label')

let last: { book: Book; mode: Mode; entries: Entry[]; passed: boolean } | null = null

/** 下一关；一个级别打完接下一个级别的第 1 关 */
function following(b: Book, lv: Level, stage: number): [Level, number] | null {
  if (stage + 1 < b.deck.stages[lv].length) return [lv, stage + 1]
  const nextLevel = LEVELS[LEVELS.indexOf(lv) + 1]
  return nextLevel ? [nextLevel, 0] : null
}

function finish() {
  if (!run) return
  const r = run
  const b = r.book
  clearInterval(ticker)
  r.endedAt = performance.now()
  fillEl.style.width = '100%'
  keysInput.blur()

  const { mode } = r
  const total = r.entries.length
  const known = r.entries.filter((_, i) => isKnown(r, i)).length
  const stars = starsFor(known, total)
  const review = 'review' in mode
  if (!review && stars > 0) {
    record(b.progress, mode.level, mode.stage, { stars, known, total })
    saveProgress(b)
  }
  last = { book: b, mode, entries: r.entries, passed: stars > 0 }

  resultStars.textContent = starText(stars)
  resultStars.classList.toggle('none', stars === 0)
  resultStars.hidden = review
  const prefix = b.kind === 'sentence' ? '句子 ' : ''
  resultTitle.textContent = review
    ? `${prefix}错题练习完成`
    : `${prefix}${mode.level} 第 ${mode.stage + 1} 关 ${stars > 0 ? '通过' : '未通过'}`

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
  const unit = UNIT[b.kind]
  const left = review ? filtered(b, mode.review).length : 0
  rulesEl.textContent = review
    ? `连续答对 ${CLEAR_STREAK} 次的会移出错题集 · 还剩 ${left} ${unit}`
    : `★★★ 全会 · ★★ 不会 1 ${unit} · ★ 不会 ${MAX_UNKNOWN} ${unit} · 看答案的算不会，已收进错题集`

  if (review) {
    nextButton.hidden = left === 0
    nextLabel.textContent = '再练一组'
  } else {
    const target = following(b, mode.level, mode.stage)
    nextButton.hidden = !(stars > 0 && target)
    if (target) nextLabel.textContent = target[0] === mode.level ? '下一关' : `${target[0]} 第 1 关`
  }
  backLabel.textContent = review ? '错题集' : '选关'

  const missed = r.entries.filter((_, i) => r.revealed[i])
  missedEl.replaceChildren(...missed.map((entry) => entryRow(b, entry, '看答案')))
  missedEl.hidden = missed.length === 0

  run = null
  show('result')
  ;(nextButton.hidden ? $<HTMLButtonElement>('retry') : nextButton).focus({ preventScroll: true })
}

function goNext() {
  if (!last) return
  const { book: b, mode } = last
  if ('review' in mode) {
    startReview(b, mode.review)
    return
  }
  if (!last.passed) return
  const target = following(b, mode.level, mode.stage)
  if (!target) return
  if (target[0] !== b.level) {
    b.level = target[0]
    saveLevel(b)
  }
  startStage(b, ...target)
}

function retry() {
  if (!last) return
  const { book: b, mode } = last
  if ('review' in mode) startRun(b, shuffle(last.entries), mode)
  else startStage(b, mode.level, mode.stage)
}

function backFromResult() {
  if (last && 'review' in last.mode) showBook()
  else showHome()
}

$('retry').addEventListener('click', retry)
nextButton.addEventListener('click', goNext)
$('back').addEventListener('click', backFromResult)

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
    if (e.key === 'Escape') backFromResult()
    else if (e.key === 'r' || e.key === 'R') retry()
  }
  if (screen === 'book' && e.key === 'Escape') showHome()
})

showHome()
// 上次停在句子模式：先显示“加载中”，数据到了再画关卡
if (!current()) void switchKind(kind)
