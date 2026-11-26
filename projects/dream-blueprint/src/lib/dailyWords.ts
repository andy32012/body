import { officialWords, wordKey } from './vocab'
import { addDays, newCard, recentRecall, reviewBudget, reviewLoad, wordForecast, type Energy, type ReviewCard, type ReviewEvent } from './progress'
import { createSceneDeck } from './backgroundRotation'
import { seedOf } from './starfield'
import { noteMoved } from './wordStates'

const wordPhotos = createSceneDeck(seedOf('daily-word'))
const wordIndices = new Map(officialWords.map((word, index) => [word.en, index]))

export function dailyWordPhoto(key: string) {
  const index = wordIndices.get(key) ?? seedOf(key)
  return wordPhotos[index % wordPhotos.length]
}

export const DAILY_CHOICES = [5, 8, 10, 15, 20, 25, 30] as const
/** 20 a day: at this pace levels 1–2 are seen before the first certificate (全民英檢初級, mid-2027) and levels 3–4 before
 *  the internship starts (2028-02) and 全民英檢中級. At 8 a day level 4 was not reached until 2029, after the exam it is for.
 *  Sorting a word takes seconds; only the unknown ones become cards, and the review cap and the new-word brake keep the load in hand. */
export const DEFAULT_DAILY = 20
export const countKey = 'daily-word.count'
export const doneKey = (day: string) => 'daily-word.done.' + day
export const seenKey = (day: string) => 'daily-word.seen.' + day
export const moreKey = (day: string) => 'daily-word.more.' + day
/** Today's sorted words in order, so the card can step back to the word before. */
export const sortedKey = (day: string) => 'daily-word.sorted.' + day
export interface SortedWord { k: string; known: boolean }
export const officialByKey = new Map(officialWords.map(w => [wordKey(w.en), w]))

export function readSorted(notes: Record<string, string>, day: string): SortedWord[] {
  try {
    const list = JSON.parse(notes[sortedKey(day)] ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((e): e is SortedWord => !!e && typeof e.k === 'string' && typeof e.known === 'boolean') : []
  } catch { return [] }
}
/** Adds a word to today's order; a word already there keeps its place and takes the new choice. */
export function recordSorted(notes: Record<string, string>, day: string, k: string, known: boolean) {
  const list = readSorted(notes, day)
  const next = list.some(e => e.k === k) ? list.map(e => e.k === k ? { k, known } : e) : [...list, { k, known }]
  return { ...notes, [sortedKey(day)]: JSON.stringify(next) }
}

type Sortable = { knownWords: string[]; learningWords: string[]; cards: ReviewCard[]; notes: Record<string, string> }
/** Changes the choice for a word sorted today, after stepping back to it.
 *  還不熟 → 認得: the new card made today goes away (a spot check, as for any 認得, may still bring it back in two weeks).
 *  認得 → 還不熟: the word becomes a new card for tomorrow, replacing a two-week spot check. The day's count stays the same. */
export function changeSorted<S extends Sortable>(prev: S, k: string, known: boolean, day: string): S {
  const id = 'word:' + k
  const others = (list: string[]) => list.filter(w => wordKey(w) !== k)
  let cards = prev.cards
  if (known) {
    cards = cards.filter(c => !(c.id === id && c.box === 1 && c.lastDay === day))
    if (spotCheck(k) && !cards.some(c => c.id === id)) cards = [...cards, { id, box: 4 as const, lastDay: day, due: addDays(day, 14), mastered: false }]
  } else {
    cards = cards.some(c => c.id === id) ? cards.map(c => c.id === id ? newCard(id, day) : c) : [...cards, newCard(id, day)]
  }
  return {
    ...prev,
    knownWords: known ? [...others(prev.knownWords), k] : others(prev.knownWords),
    learningWords: known ? others(prev.learningWords) : [...others(prev.learningWords), k],
    cards,
    notes: noteMoved(recordSorted(prev.notes, day, k, known), [k], known ? 'k' : 'l', day),
  }
}

/** Words of the 7000-word table (their keys) put into the word review from a reading: each becomes a learning word with a new
 *  card for tomorrow. A word already in the review keeps its card; one sorted as 認得 before moves to the words being learned. */
export function addWordsToReview<S extends Sortable>(prev: S, keys: readonly string[], day: string): S {
  const have = new Set(prev.cards.map(c => c.id))
  const fresh = [...new Set(keys.map(wordKey))].filter(k => !have.has('word:' + k))
  if (!fresh.length) return prev
  const moved = new Set(fresh)
  const wasKnown = prev.knownWords.map(wordKey).filter(k => moved.has(k))
  return { ...prev,
    knownWords: prev.knownWords.filter(w => !moved.has(wordKey(w))),
    learningWords: [...new Set([...prev.learningWords, ...fresh])],
    cards: [...prev.cards, ...fresh.map(k => newCard('word:' + k, day))],
    // Moved from 認得: recorded, so a device that still has it as 認得 does not take it back when the two merge.
    notes: noteMoved(prev.notes, wasKnown, 'l', day) }
}

/** `backlog`: word cards due beyond what today's review can take (reviewLoad in progress.ts). */
export function dailyTarget(notes: Record<string, string>, quiet: boolean, day: string, backlog = 0) {
  const chosen = Number(notes[countKey])
  const full = DAILY_CHOICES.includes(chosen as (typeof DAILY_CHOICES)[number]) ? chosen : DEFAULT_DAILY
  // Exam and internship days show one word unless the learner asks for the full set.
  if (quiet && notes[moreKey(day)] !== '1') return 1
  return Math.min(full, newWordAllowance(backlog))
}

export interface WordPlan { target: number; backlog: number; reason: string; short: string }
/** Today's new words, adapted to the review they will cause. Three brakes, the strongest wins:
 *  word cards already piling up past today's review; the next week's word reviews (from the FSRS due dates) close to
 *  what a day's review can take; and a poor recall rate over the last two weeks (new words wait until the old stick). */
export function newWordPlan(s: { notes: Record<string, string>; cards: readonly ReviewCard[]; reviewEvents: readonly ReviewEvent[] }, day: string, quiet: boolean, energy: Energy): WordPlan {
  const { backlog } = reviewLoad(s, day, energy)
  const chosen = Number(s.notes[countKey])
  const full = DAILY_CHOICES.includes(chosen as (typeof DAILY_CHOICES)[number]) ? chosen : DEFAULT_DAILY
  if (quiet && s.notes[moreKey(day)] !== '1') return { target: 1, backlog, reason: '', short: '' }
  let target = Math.min(full, newWordAllowance(backlog))
  let reason = backlog > 30 ? '單字卡積了 ' + backlog + ' 張今天複習不完，新字先' + (target === 0 ? '暫停' : '減少到 ' + target + ' 個') + '；積的卡消下去，新字就會加回來。' : ''
  let short = backlog > 30 ? '單字卡積太多' : ''
  const budget = reviewBudget(energy)
  const coming = wordForecast(s.cards, day, 8).slice(1)
  const average = coming.reduce((a, b) => a + b, 0) / coming.length
  if (target > 0 && average > budget * 0.8) {
    const cap = average > budget ? 5 : 10
    if (cap < target) {
      target = cap
      reason = '接下來一週每天平均要複習 ' + Math.round(average) + ' 張單字卡（一天大約複習得完 ' + budget + ' 張），新字先減到 ' + cap + ' 個，免得複習越積越多。'
      short = '接下來複習很多'
    }
  }
  const recall = recentRecall(s.reviewEvents, day)
  if (target > 5 && recall.n >= 30 && recall.rate < 0.75) {
    const cap = Math.max(5, Math.floor(full / 2))
    if (cap < target) {
      target = cap
      reason = '最近兩週複習單字只記得 ' + Math.round(recall.rate * 100) + '%，新字先減到 ' + cap + ' 個，把舊的記牢再加回來。'
      short = '最近記得比較少'
    }
  }
  return { target, backlog, reason, short }
}

/** New words share one budget with review: the more word cards pile up past today's review, the fewer new words.
 *  Cards today's review will clear, and sentence cards waiting their turn, never hold new words back. */
export function newWordAllowance(backlog: number) {
  if (backlog >= 80) return 0
  if (backlog <= 30) return 99
  return Math.max(2, 15 - Math.ceil((backlog - 30) / 10) * 3)
}

/** About one in four words marked "認得" comes back two weeks later as a quick recall check. */
export const spotCheck = (key: string) => [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 4 === 0

/** Words not yet sorted, lowest level first, in the same order the screening uses. */
export function dailyQueue(known: readonly string[], learning: readonly string[]) {
  const sorted = new Set([...known, ...learning].map(wordKey))
  return officialWords.filter(w => !sorted.has(wordKey(w.en)))
}
