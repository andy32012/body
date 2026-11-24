export type Energy = 'low' | 'normal' | 'high'
export type Period = 'semester' | 'exam' | 'internship' | 'vacation'
export type Feedback = 'right' | 'much' | 'more'
export interface PeriodRange {
  type: Period
  start: string
  end: string
}

// Compare the local wall clock, including on a daylight-saving transition.
export function dayKey(now = new Date()): string {
  const d = new Date(now)
  if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

const DAY = 86400000
const midnight = (d: string) => Date.parse(d + 'T00:00:00Z')
export const addDays = (day: string, n: number) =>
  new Date(midnight(day) + n * DAY).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) =>
  (midnight(b) - midnight(a)) / DAY
export function weekKey(day = dayKey()) {
  return addDays(day, -((new Date(midnight(day)).getUTCDay() + 6) % 7))
}
export function activePeriod(
  day: string,
  ranges: readonly PeriodRange[],
): Period {
  const current = ranges.filter(
    (r) => r.start <= day && (!r.end || r.end >= day),
  )
  const priority: Period[] = ['exam', 'internship', 'vacation']
  return (
    priority.find((type) => current.some((r) => r.type === type)) ?? 'semester'
  )
}

export interface ReviewCard {
  id: string
  /** A bucket for the review shelves (which interval the card is on now: 1, 2, 4 … 365 days). */
  box: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  lastDay: string
  due: string
  mastered: boolean
  /** FSRS memory state: stability (days until recall drops to 90%) and difficulty (1–10). Missing on a card that has
   *  not been reviewed since FSRS came in; its current interval stands in for the stability then. */
  s?: number
  d?: number
}
export interface ReviewEvent {
  id: string
  day: string
  gap: number
  remembered: boolean
  shownAnswer: boolean
}
export function newCard(id: string, day: string): ReviewCard {
  return { id, box: 1, lastDay: day, due: addDays(day, 1), mastered: false }
}
/** The shelves: a card sits on the longest interval it has reached. Cards are reviewed by FSRS (below), not by shelf. */
export const intervals = [1, 2, 4, 8, 16, 30, 60, 120, 240, 365]
export const TOP_BOX = intervals.length
const boxFor = (interval: number) => Math.max(1, intervals.filter(i => i <= interval).length) as ReviewCard['box']

/**
 * FSRS-6 (open-spaced-repetition, default parameters): each card keeps a stability S and a difficulty D. The chance
 * of recalling it after t days is R = (1 + F·t/S)^-w20; the next review is planned for when R falls to 90%, which is
 * t = S. A recall makes S grow — more when the card was nearly forgotten, less for a hard card — and a lapse shrinks S
 * instead of starting over. Longest interval 365 days, so every word comes back at least once a year.
 */
export const FSRS_W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
const W = FSRS_W
const DECAY = -W[20]
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1
export const RETENTION = 0.9
export const MAX_INTERVAL = 365
/** 1 forgot (or saw the answer), 2 recalled with a small mistake, 3 recalled, 4 easy. */
export type Grade = 1 | 2 | 3 | 4
const clampD = (d: number) => Math.min(10, Math.max(1, d))
const initialD = (g: Grade) => W[4] - Math.exp(W[5] * (g - 1)) + 1
/** Chance of recall after t days with stability s. */
export const retrievability = (t: number, s: number) => Math.pow(1 + FACTOR * Math.max(0, t) / s, DECAY)
export function nextInterval(s: number) {
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(s / FACTOR * (Math.pow(RETENTION, 1 / DECAY) - 1))))
}
/** The memory state after one review t days after the last one. A new card was made the day he met something he did
 *  not know yet (a word sorted 還不熟, a sentence from a lesson), so it starts as a first rating of "forgot" on that day.
 *  A card from the old shelves starts from its current interval with a middle difficulty. */
export function fsrsStep(card: Pick<ReviewCard, 's' | 'd' | 'box' | 'lastDay' | 'due'>, t: number, g: Grade): { s: number; d: number } {
  let s = card.s, d = card.d
  if (s === undefined || d === undefined) {
    const fresh = card.box <= 1 && daysBetween(card.lastDay, card.due) <= 1
    s = fresh ? W[0] : Math.max(1, daysBetween(card.lastDay, card.due))
    d = fresh ? clampD(initialD(1)) : 5
  }
  const r = retrievability(t, s)
  const delta = -W[6] * (g - 3)
  const damped = d + (10 - d) * delta / 9
  const nd = clampD(W[7] * initialD(4) + (1 - W[7]) * damped)
  let ns: number
  if (g === 1) {
    const longTerm = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14])
    ns = Math.min(longTerm, s / Math.exp(W[17] * W[18]))
  } else {
    const hard = g === 2 ? W[15] : 1
    const easy = g === 4 ? W[16] : 1
    ns = s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy)
  }
  return { s: Math.max(0.001, ns), d: nd }
}

export function reviewCard(
  card: ReviewCard,
  day: string,
  remembered: boolean,
  shownAnswer = false,
  grade?: Grade,
): { card: ReviewCard; event: ReviewEvent | null } {
  if (day <= card.lastDay || day < card.due) return { card, event: null }
  const recalled = remembered && !shownAnswer
  // Seeing the answer counts as forgetting, whatever grade was asked for.
  const g: Grade = shownAnswer ? 1 : grade ?? (recalled ? 3 : 1)
  const gap = daysBetween(card.lastDay, day)
  const { s, d } = fsrsStep(card, gap, g)
  const interval = nextInterval(s)
  return {
    card: {
      ...card,
      box: boxFor(interval),
      lastDay: day,
      due: addDays(day, interval),
      // Known for good once recalled after an interval of two weeks or more.
      mastered: card.mastered || (g >= 3 && card.box >= 5),
      s: Math.round(s * 1000) / 1000,
      d: Math.round(d * 1000) / 1000,
    },
    event: { id: card.id, day, gap, remembered, shownAnswer },
  }
}
/** A self-marked "correct" nobody could check: the card neither climbs nor drops, and no recall is recorded. */
export function holdCard(card: ReviewCard, day: string): ReviewCard {
  if (day <= card.lastDay || day < card.due) return card
  const interval = card.s !== undefined ? nextInterval(card.s) : intervals[card.box - 1]
  return { ...card, lastDay: day, due: addDays(day, interval) }
}
/** A written answer applied to its review card: checked and correct climbs, a small mistake is a hard recall, wrong or
 *  seen drops, correct but unchecked (自評完成・待確認) holds — self-marking alone never makes a card look learned. */
export function applyAnswer(card: ReviewCard, day: string, a: { rating: 'correct' | 'minor' | 'again'; revealed: boolean; verified?: boolean }): { card: ReviewCard; event: ReviewEvent | null } {
  if (a.rating === 'correct' && !a.revealed && a.verified !== true) return { card: holdCard(card, day), event: null }
  return reviewCard(card, day, a.rating === 'correct', a.revealed, a.rating === 'minor' && !a.revealed ? 2 : undefined)
}

/** Word cards due on each of the next `days` days (day 0 includes everything overdue), from the cards' due dates. */
export function wordForecast(cards: readonly ReviewCard[], day: string, days = 7): number[] {
  const out = new Array<number>(days).fill(0)
  for (const c of cards) {
    if (!c.id.startsWith('word:')) continue
    const at = c.due <= day ? 0 : daysBetween(day, c.due)
    if (at < days) out[at]++
  }
  return out
}
/** How well word cards were recalled in the last two weeks (cards that waited at least two days). */
export function recentRecall(events: readonly ReviewEvent[], day: string) {
  const seen = new Set<string>()
  let n = 0, ok = 0
  for (const e of events) {
    if (!e.id.startsWith('word:') || e.gap < 2 || e.day > day || daysBetween(e.day, day) >= 14) continue
    const key = e.day + '/' + e.id
    if (seen.has(key)) continue
    seen.add(key)
    n++
    if (e.remembered && !e.shownAnswer) ok++
  }
  return { n, rate: n ? ok / n : 1 }
}
/** Word-card review is limited by time, not a fixed handful: roughly five cards a minute. */
export const reviewMinutes = { low: 10, normal: 20, high: 25 } as const
export const reviewBudget = (energy: Energy) => reviewMinutes[energy] * 5
/** The cap the 單字複習 screen uses: the short plan in exam and internship periods, otherwise a normal day. */
export const reviewEnergy = (day: string, periods: readonly PeriodRange[]): Energy => {
  const period = activePeriod(day, periods)
  return period === 'exam' || period === 'internship' ? 'low' : 'normal'
}
/** Sentence cards (lesson sentences, mistakes saved from Emma or passages) are reviewed in 中翻英, about a minute
 *  each, so the daily review takes a few of them; the rest wait their turn, oldest first. */
export const SENTENCE_QUOTA = 5
export const sentenceReviewKey = (day: string) => 'review.sentences.' + day
const isDue = (c: ReviewCard, day: string) => c.due <= day && c.lastDay < day
const isWordCard = (id: string) => id.startsWith('word:')
/** How many cards are waiting today. */
export const dueCount = (cards: readonly ReviewCard[], day: string) =>
  cards.filter((c) => isDue(c, day)).length

export interface ReviewLoad {
  /** Word cards today's review still takes (up to what is left of the day's cap). */
  words: number
  /** Word cards due beyond today's cap: the backlog that slows down new words. */
  backlog: number
  /** Sentence cards today's review still takes (up to what is left of the daily quota). */
  sentences: number
  /** Due sentence cards waiting for a later day. They never hold back new words. */
  queued: number
  /** Minutes today's remaining review needs: five word cards a minute, a minute a sentence. */
  minutes: number
}
/** Today's review in one place, so the plan, the daily words and the review screens agree. */
export function reviewLoad(
  s: { cards: readonly ReviewCard[]; reviewEvents: readonly ReviewEvent[]; notes: Record<string, string> },
  day: string,
  energy: Energy,
): ReviewLoad {
  let wordsDue = 0, sentencesDue = 0
  for (const c of s.cards) if (isDue(c, day)) { if (isWordCard(c.id)) wordsDue++; else sentencesDue++ }
  const wordsReviewed = new Set(s.reviewEvents.filter((e) => e.day === day && isWordCard(e.id)).map((e) => e.id)).size
  const words = Math.min(wordsDue, Math.max(0, reviewBudget(energy) - wordsReviewed))
  const sentences = Math.min(sentencesDue, Math.max(0, SENTENCE_QUOTA - (Number(s.notes[sentenceReviewKey(day)]) || 0)))
  return { words, backlog: wordsDue - words, sentences, queued: sentencesDue - sentences, minutes: Math.ceil(words / 5) + sentences }
}
export function dueCards<T extends ReviewCard>(
  cards: readonly T[],
  day: string,
  energy: Energy,
): T[] {
  const limit = reviewBudget(energy)
  return cards
    .filter((c) => c.due <= day && c.lastDay < day)
    .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id))
    .slice(0, limit)
}
export interface WorkSession {
  day: string
  energy: Energy
  feedback?: Feedback | null
}
interface WorkloadInput {
  day: string
  startedDay: string
  lastAssessment?: string
  lastReduction?: string
  period: Period
  sessions: readonly WorkSession[]
  events: readonly ReviewEvent[]
}
export function workloadDecision(
  input: WorkloadInput,
): 'offer' | 'reduce' | 'keep' {
  const {
    day,
    startedDay,
    lastAssessment,
    lastReduction,
    period,
    sessions,
    events,
  } = input
  if (period === 'exam' || period === 'internship') return 'keep'
  const age = daysBetween(startedDay, day)
  const recent = sessions.filter(
    (s) => s.day <= day && daysBetween(s.day, day) < 14,
  )
  const demanding = recent.filter((s) => s.energy !== 'low')
  const countDays = (rows: readonly WorkSession[]) =>
    new Set(rows.map((r) => r.day)).size
  const latestWeek = (s: WorkSession) => daysBetween(s.day, day) < 7
  const tooMuch = recent.filter((s) => s.feedback === 'much')
  const renewed = tooMuch.filter(
    (s) => latestWeek(s) && (!lastReduction || s.day > lastReduction),
  )
  const sparse =
    age >= 14 &&
    countDays(demanding.filter(latestWeek)) < 2 &&
    countDays(demanding.filter((s) => !latestWeek(s))) < 2
  const sinceReduction = lastReduction
    ? daysBetween(lastReduction, day)
    : Infinity
  if (
    (countDays(renewed) >= 2 && sinceReduction >= 7) ||
    (sparse && sinceReduction >= 14)
  )
    return 'reduce'
  if (
    age < 14 ||
    (lastAssessment && daysBetween(lastAssessment, day) < 14) ||
    tooMuch.length ||
    countDays(demanding) < 4
  )
    return 'keep'
  const seen = new Set<string>()
  const eligible = events.filter((e) => {
    if (
      e.gap < 4 ||
      e.shownAnswer ||
      e.day > day ||
      daysBetween(e.day, day) >= 14
    )
      return false
    const key = e.day + '/' + e.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return eligible.length &&
    eligible.filter((e) => e.remembered).length / eligible.length >= 0.7
    ? 'offer'
    : 'keep'
}
export function practiceDays(
  sessions: readonly Pick<WorkSession, 'day'>[],
): number {
  return new Set(sessions.map((s) => s.day)).size
}
export function reviewBonus(
  events: readonly ReviewEvent[],
  day: string,
): number {
  const valid = events.filter(
    (e) => e.day === day && e.gap >= 4 && e.remembered && !e.shownAnswer,
  )
  return Math.min(10, 2 * new Set(valid.map((e) => e.id)).size)
}
export function attendance(
  sessions: readonly Pick<WorkSession, 'day'>[],
  today: string,
  restDays: readonly number[],
  ranges: readonly PeriodRange[],
) {
  const practiced = new Set(
    sessions.map((s) => s.day).filter((d) => d <= today),
  )
  let streak = 0,
    leave = 0,
    cumulative = 0
  const start = [...practiced].sort()[0]
  if (!start) return { streak, leave, cumulative }
  for (let day = start; day <= today; day = addDays(day, 1)) {
    if (practiced.has(day)) {
      streak++
      cumulative++
      if (cumulative % 7 === 0) leave = Math.min(2, leave + 1)
      continue
    }
    const period = activePeriod(day, ranges)
    if (
      day === today ||
      restDays.includes(new Date(midnight(day)).getUTCDay()) ||
      period === 'exam' ||
      period === 'internship'
    )
      continue
    if (leave > 0) leave--
    else streak = 0
  }
  return { streak, leave, cumulative }
}
