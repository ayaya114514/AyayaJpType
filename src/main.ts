import './style.css'
import { buildWord, Session, wordOf } from './kana'
import {
  answersFor,
  CLEAR_STREAK,
  errorsOf,
  isPassed,
  isUnlocked,
  LEVELS,
  loadSentences,
  markMistake,
  mistakeEntries,
  parseMistakes,
  parseProgress,
  passedCount,
  PASS_KNOWN,
  passes,
  record,
  shuffle,
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
const boardEl = $<HTMLDivElement>('board')
const boardType = $<HTMLSpanElement>('board-type')
const boardDest = $<HTMLSpanElement>('board-dest')
const boardMeta = $<HTMLSpanElement>('board-meta')
const boardGo = $<HTMLButtonElement>('board-go')
const whereEl = $<HTMLSpanElement>('where')
const liveEl = $<HTMLSpanElement>('live')
const routeDots = $<HTMLDivElement>('route-dots')
const trainEl = $<HTMLSpanElement>('train')
const card = $<HTMLDivElement>('card')
const plateEl = $<HTMLSpanElement>('plate')
const signBody = $<HTMLDivElement>('sign-body')
const nextStopEl = $<HTMLSpanElement>('next-stop')
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
// 单词沿用原来的 key；progress:v2 是改成盲打后按“会的词数”记成绩的版本（去掉星星后结构兼容）
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
// 单词站站停，句子长一些算特急
const TRAIN: Record<Kind, { short: string; long: string }> = {
  word: { short: '各停', long: '各駅停車' },
  sentence: { short: '特急', long: '特急' },
}

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

const typeBadge = (k: Kind) => {
  const badge = el('span', `type ${k}`, TRAIN[k].short)
  badge.lang = 'ja'
  return badge
}

/** 站点编号：级别是线路，关卡是第几站（N5-07） */
const stationNo = (lv: Level, stage: number) => `${lv}-${String(stage + 1).padStart(2, '0')}`

// ---- 路线图 ----

/** 第一个还没过的关（全过了就是最后一关） */
const currentStage = (b: Book) => {
  const i = b.deck.stages[b.level].findIndex((_, s) => !isPassed(b.progress, b.level, s))
  return i === -1 ? b.deck.stages[b.level].length - 1 : i
}

function renderKinds() {
  kindsEl.replaceChildren(
    ...(['word', 'sentence'] as Kind[]).map((k) => {
      const tab = el('button', 'kind')
      tab.append(typeBadge(k), el('span', '', KIND_NAMES[k]))
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
  for (const node of [boardEl, levelsEl, stagesEl]) node.hidden = !b
  if (!b) {
    loadingEl.textContent = '句子加载中'
    return
  }
  home.dataset.line = b.level
  renderBoard(b)
  renderLines(b)
  renderMap(b)
}

const TICKER = [
  '看中文，凭记忆打出罗马音',
  '卡住按 Tab 看答案，看过的算错',
  `一站对 ${PASS_KNOWN} 个就能开往下一站`,
  '看过答案的会送到忘れ物センター',
].join('　・　')
$('ticker').textContent = `${TICKER}　・　${TICKER}　・　`

/** 发车标：下一班就是第一个还没过的站 */
function renderBoard(b: Book) {
  const stage = currentStage(b)
  const stages = b.deck.stages[b.level]
  const score = b.progress[b.level][stage]
  boardType.replaceChildren(typeBadge(b.kind))
  boardDest.textContent = stationNo(b.level, stage)
  boardMeta.textContent =
    passedCount(b.deck, b.progress, b.level) === stages.length
      ? `${b.level} 全线通过`
      : `${stages[stage].length} ${UNIT[b.kind]}` + (score ? ` · 上次错 ${errorsOf(score)}` : '')
}

boardGo.addEventListener('click', () => {
  const b = current()
  if (b) startStage(b, b.level, currentStage(b))
})

function renderLines(b: Book) {
  levelsEl.replaceChildren(
    ...LEVELS.map((lv) => {
      const tab = el('button', 'line-tab')
      tab.type = 'button'
      tab.dataset.line = lv
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(lv === b.level))
      const passed = passedCount(b.deck, b.progress, lv)
      const total = b.deck.stages[lv].length
      const bar = el('span', 'bar')
      const fill = el('i')
      fill.style.width = `${(passed / total) * 100}%`
      bar.append(fill)
      const info = el('span', 'info')
      info.append(el('span', 'count', `${passed} / ${total}`), bar)
      tab.append(el('span', 'symbol', lv), info)
      tab.setAttribute('aria-label', `${lv} 线，${total} 站过了 ${passed} 站`)
      tab.addEventListener('click', () => {
        b.level = lv
        saveLevel(b)
        renderHome()
      })
      return tab
    }),
  )
  const bookTab = el('button', 'line-tab book-tab')
  bookTab.type = 'button'
  const info = el('span', 'info')
  const name = el('span', 'name', '忘れ物')
  name.lang = 'ja'
  info.append(name, el('span', 'count', String(mistakeEntries(b.deck, b.mistakes).length)))
  bookTab.append(el('span', 'symbol', '忘'), info)
  bookTab.addEventListener('click', () => showBook())
  levelsEl.append(bookTab)
}

/** 刚过关（或刷新了最好成绩）的站，回到路线图时盖章动画 */
let stamped: { kind: Kind; level: Level; stage: number } | null = null
let mapCols = 0

// 路线蛇形排列：每行几站跟着屏幕宽度走
const columnsFor = () => Math.max(3, Math.min(7, Math.floor((Math.min(window.innerWidth, 760) - 32) / 92)))

function renderMap(b: Book) {
  const stages = b.deck.stages[b.level]
  const now = currentStage(b)
  mapCols = columnsFor()
  stagesEl.style.setProperty('--cols', String(mapCols))
  const rows: HTMLElement[] = []
  for (let start = 0; start < stages.length; start += mapCols) {
    // 单数行从右往左走，行尾用一段弯道接到下一行
    const row = el('div', (start / mapCols) % 2 ? 'row rtl' : 'row')
    const end = Math.min(start + mapCols, stages.length)
    for (let i = start; i < end; i++) row.append(stationCell(b, i, i === now, i === start, i === end - 1))
    if (end < stages.length) row.append(el('span', isPassed(b.progress, b.level, end - 1) ? 'turn lit' : 'turn'))
    rows.push(row)
  }
  stagesEl.replaceChildren(...rows)
}

function stationCell(b: Book, i: number, now: boolean, rowStart: boolean, rowEnd: boolean) {
  const { progress, level } = b
  const score = progress[level][i]
  const unlocked = isUnlocked(progress, level, i)
  const passed = isPassed(progress, level, i)
  const cell = el('div', 'stop')
  cell.setAttribute('role', 'listitem')
  cell.classList.toggle('row-start', rowStart)
  cell.classList.toggle('row-end', rowEnd)
  // 过了的站和下一站之间的轨道亮起来
  cell.classList.toggle('lit-in', i > 0 && isPassed(progress, level, i - 1))
  cell.classList.toggle('lit-out', passed)

  const button = el('button', 'station')
  button.type = 'button'
  button.disabled = !unlocked
  const node = el('span', 'node')
  if (score && passed) {
    const errors = errorsOf(score)
    button.classList.add('stamped')
    button.style.setProperty('--tilt', `${((i * 37) % 19) - 9}deg`)
    if (errors === 0) {
      button.classList.add('perfect')
      node.lang = 'ja'
      node.append(el('b', '', '満点'))
    } else {
      node.append(el('small', '', '错'), el('b', '', String(errors)))
    }
    if (stamped && stamped.kind === b.kind && stamped.level === level && stamped.stage === i) {
      button.classList.add('thunk')
    }
  } else if (unlocked) {
    button.classList.add('open')
    if (now) button.classList.add('current')
  }
  button.append(node)
  button.setAttribute(
    'aria-label',
    `${stationNo(level, i)}，${b.deck.stages[level][i].length} ${UNIT[b.kind]}，` +
      (!unlocked ? '未解锁' : score ? `错 ${errorsOf(score)}${passed ? '' : '，还没过'}` : '还没打过'),
  )
  button.addEventListener('click', () => startStage(b, level, i))

  const label = el('span', 'label', String(i + 1).padStart(2, '0'))
  if (score && !passed) label.append(el('span', 'err', `错${errorsOf(score)}`))
  cell.append(button, label)
  return cell
}

window.addEventListener('resize', () => {
  const b = current()
  if (screen === 'home' && b && columnsFor() !== mapCols) renderMap(b)
})

function showHome() {
  show('home')
  renderHome()
  stamped = null
  const target = stagesEl.querySelector('.thunk, .current')
  if (target && target.getBoundingClientRect().bottom > window.innerHeight - 40) {
    target.scrollIntoView({ block: 'center' })
  }
  if (!boardEl.hidden) boardGo.focus({ preventScroll: true })
}

// ---- 错题集 ----

type BookFilter = Level | 'all'
let bookFilter: BookFilter = 'all'

const bookKind = $<HTMLSpanElement>('book-kind')
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
  bookKind.textContent = `· ${KIND_NAMES[b.kind]}`
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
  whereEl.replaceChildren(
    typeBadge(b.kind),
    el('span', '', 'review' in mode ? '忘れ物练习' : stationNo(mode.level, mode.stage)),
  )
  card.classList.toggle('sentence', b.kind === 'sentence')
  warnEl.hidden = true
  previousEl.replaceChildren(el('span', 'origin', '◀ 始発'))
  routeDots.replaceChildren(
    ...entries.map((_, i) => {
      const dot = el('i')
      dot.style.left = routeLeft(i, entries.length)
      return dot
    }),
  )
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
  liveEl.textContent = `${counter} · 错 ${unknown}`
}

const routeLeft = (i: number, total: number) => `${total > 1 ? (i / (total - 1)) * 100 : 50}%`

/** 顶部线路：打完的站按会 / 不会上色，小电车停在当前这站 */
function renderRoute() {
  if (!run) return
  const { session, entries } = run
  ;[...routeDots.children].forEach((dot, i) => {
    dot.className =
      i < session.index ? (isKnown(run!, i) ? 'ok' : 'no') : i === session.index ? (isKnown(run!, i) ? 'now' : 'now no') : ''
  })
  trainEl.style.left = routeLeft(Math.min(session.index, entries.length - 1), entries.length)
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
  play.dataset.line = entry.level
  plateEl.replaceChildren(el('small', '', entry.level), el('b', '', String(session.index + 1).padStart(2, '0')))
  nextStopEl.textContent = session.index === entries.length - 1 ? '終点' : 'つぎ ？？？ ▶'
  // 进站：站牌内容从右边滑进来
  if (session.index > 0) {
    signBody.classList.remove('arrive')
    void signBody.offsetWidth
    signBody.classList.add('arrive')
  }
  renderRoute()
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
    el('span', 'arrow', '◀'),
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
  renderRoute()
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

const ticketEl = $<HTMLDivElement>('ticket')
const ticketTitle = $<HTMLSpanElement>('ticket-title')
const ticketKind = $<HTMLSpanElement>('ticket-kind')
const ticketFrom = $<HTMLElement>('ticket-from')
const ticketArrow = $<HTMLSpanElement>('ticket-arrow')
const ticketTo = $<HTMLElement>('ticket-to')
const ticketDate = $<HTMLSpanElement>('ticket-date')
const sealEl = $<HTMLSpanElement>('seal')
const resultTitle = $<HTMLHeadingElement>('result-title')
const numbersEl = $<HTMLDListElement>('numbers')
const rulesEl = $<HTMLParagraphElement>('rules')
const missedTitle = $<HTMLHeadingElement>('missed-title')
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
  keysInput.blur()

  const { mode } = r
  const total = r.entries.length
  const known = r.entries.filter((_, i) => isKnown(r, i)).length
  const errors = total - known
  const score = { known, total }
  const passed = passes(score)
  const review = 'review' in mode
  if (!review) {
    const old = b.progress[mode.level][mode.stage]
    if (passed && (!old || !passes(old) || errorsOf(old) > errors)) {
      stamped = { kind: b.kind, level: mode.level, stage: mode.stage }
    }
    record(b.progress, mode.level, mode.stage, score)
    saveProgress(b)
  }
  last = { book: b, mode, entries: r.entries, passed }
  const unit = UNIT[b.kind]
  const target = review ? null : following(b, mode.level, mode.stage)

  // 结算是一张车票：区间、错几个、检票口打孔和印章
  ticketEl.dataset.line = review ? r.entries[0].level : mode.level
  ticketEl.classList.toggle('passed', passed && !review)
  ticketTitle.textContent = review ? '忘れ物 引換券' : '乗車券'
  ticketKind.textContent = TRAIN[b.kind].long
  ticketArrow.hidden = review
  ticketTo.hidden = review
  ticketTo.classList.toggle('blocked', !passed)
  if (review) {
    ticketFrom.textContent = '忘れ物センター'
    ticketFrom.lang = 'ja'
  } else {
    ticketFrom.textContent = stationNo(mode.level, mode.stage)
    ticketFrom.removeAttribute('lang')
    ticketTo.textContent = target ? stationNo(...target) : '終点'
  }
  sealEl.textContent = review ? '受取' : passed ? '通過' : '回送'
  sealEl.className = `seal ${review ? 'review' : passed ? 'ok' : 'no'}`

  const left = review ? filtered(b, mode.review).length : 0
  if (review) {
    const cleared = r.entries.filter((e) => !b.mistakes[e.id]).length
    resultTitle.textContent = `领回 ${cleared} ${unit} · 还剩 ${left} ${unit}`
  } else if (passed) {
    resultTitle.textContent =
      `${errors ? `错 ${errors} ${unit}` : '一个没错'} · ` + (target ? `开往 ${stationNo(...target)}` : '已到终点')
  } else {
    resultTitle.textContent = `对 ${known} ${unit}，还差 ${Math.min(PASS_KNOWN, total) - known} ${unit}才能发车`
  }

  const seconds = Math.round(elapsedMinutes(r) * 60)
  numbersEl.replaceChildren(
    ...[
      ['对', `${known} / ${total}`],
      ['错', String(errors)],
      ['准确率', `${(accuracyOf(r) * 100).toFixed(1)}%`],
      ['用时', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`],
    ].map(([label, value]) => {
      const box = el('div')
      box.append(el('dt', '', label), el('dd', '', value))
      return box
    }),
  )
  const today = new Date()
  ticketDate.textContent = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('.')

  rulesEl.textContent = review
    ? `连续 ${CLEAR_STREAK} 次不看答案打出来就能领回`
    : `一站对 ${PASS_KNOWN} ${unit}就能开往下一站 · 看过答案的算错，已送到忘れ物センター`

  if (review) {
    nextButton.hidden = left === 0
    nextLabel.textContent = '再练一组'
  } else {
    nextButton.hidden = !(passed && target)
    if (target) nextLabel.textContent = target[0] === mode.level ? `开往 ${stationNo(...target)}` : `换乘 ${target[0]}`
  }
  backLabel.textContent = review ? '忘れ物' : '路线图'

  const missed = r.entries.filter((_, i) => r.revealed[i])
  missedEl.replaceChildren(...missed.map((entry) => entryRow(b, entry, '看答案')))
  missedEl.hidden = missed.length === 0
  missedTitle.hidden = missed.length === 0
  missedTitle.textContent = review ? `还没领回的 · ${missed.length}` : `这一站的忘れ物 · ${missed.length}`

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
