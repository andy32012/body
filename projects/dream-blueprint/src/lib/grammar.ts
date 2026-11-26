/** Step-by-step teaching for each grammar unit, and the small recognition drills that come before writing:
 *  choose the right form, fill a blank, fix a wrong sentence. Translation stays the main practice; these make sure
 *  the pattern is recognised first. Records live in notes as "gram.<unit>". */
import data from '../data/grammar.json'
import { matchesReference, normalizeEnglish } from './evidence'

export interface GrammarExample { en: string; zh: string }
export interface GrammarStep { t: string; p: string; ex: GrammarExample[] }
export interface GrammarTable { title: string; head: string[]; rows: string[][] }
export interface GrammarMistake { bad: string; good: string; why: string }
export interface ChooseDrill { k: 'choose'; q: string; options: string[]; answer: number; why: string }
export interface TypeDrill { k: 'fill' | 'fix'; q: string; accept: string[]; why: string }
export type Drill = ChooseDrill | TypeDrill
export interface GrammarUnit { unit: number; steps: GrammarStep[]; table?: GrammarTable; mistakes: GrammarMistake[]; drills: Drill[]
  /** A1–A2 items the unit did not teach (checked against the Core Inventory): extra teaching and practice drills, kept
   *  apart from the three steps and seven drills (not counted, not paced into the daily lesson). */
  extra?: { title: string; steps: GrammarStep[]; drills: Drill[] } }

export const grammarUnits = data as GrammarUnit[]
export const grammarFor = (unit: number) => grammarUnits.find(g => g.unit === unit)
export const drillNames: Record<Drill['k'], string> = { choose: '選擇', fill: '填空', fix: '改錯' }

/** A typed answer is compared the way written sentences are: case, punctuation and contractions do not matter
 *  (isn't = is not). A choice is right when it is the answer's index. */
export function checkDrill(d: Drill, answer: string | number) {
  if (d.k === 'choose') return answer === d.answer
  const text = String(answer)
  if (!text.trim()) return false
  if (d.k === 'fix') return matchesReference(text, d.accept)
  const typed = normalizeEnglish(text)
  return d.accept.some(a => normalizeEnglish(a) === typed)
}
/** The full correct sentence: the blank(s) filled in, or the corrected sentence. Options like "had / started" fill two blanks. */
export function drillAnswer(d: Drill) {
  if (d.k === 'fix') return d.accept[0]
  const parts = (d.k === 'choose' ? d.options[d.answer] : d.accept[0]).split(' / ')
  let i = 0
  const filled = d.q.replace(/___/g, (_m, at: number) => {
    const word = parts[Math.min(i++, parts.length - 1)]
    // A blank that starts a sentence gets a capital letter: "___ is your doctor?" → "Who is your doctor?"
    const starts = at === 0 || /[.!?]\s+$/.test(d.q.slice(0, at))
    return starts && /^[a-z]/.test(word) ? word[0].toUpperCase() + word.slice(1) : word
  })
  // Hints in brackets belong to the question, not to the answer: "___ (be，否定)", "（填一個字）"; 「（不加）」 means no word at all.
  return filled.replace(/\s*\([^)]*\)/g, '').replace(/（[^）]*）/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim()
}

/** 1 = right the first time, 0 = wrong the first time and not yet fixed, 2 = wrong at first, right on a later try. */
export type DrillMark = 0 | 1 | 2
export interface GrammarRecord { marks: Record<string, DrillMark>; day?: string }
export const grammarKey = (unit: number) => 'gram.' + unit
/** The drill marks kept under a note key (gram.<unit> for a course unit, gbook.<section> for the grammar book). */
export function readMarks(notes: Record<string, string>, key: string): GrammarRecord {
  try {
    const v = notes[key] ? JSON.parse(notes[key]) as GrammarRecord : null
    return v && typeof v.marks === 'object' && v.marks ? v : { marks: {} }
  } catch { return { marks: {} } }
}
/** The first try is what counts; a later right answer only turns a miss into "fixed later". */
export function saveMark(notes: Record<string, string>, key: string, index: number, right: boolean, day: string) {
  const rec = readMarks(notes, key)
  const old = rec.marks[index]
  const next: DrillMark = old === undefined ? (right ? 1 : 0) : old === 0 && right ? 2 : old
  if (next === old) return notes
  return { ...notes, [key]: JSON.stringify({ marks: { ...rec.marks, [index]: next }, day }) }
}
export const readGrammar = (notes: Record<string, string>, unit: number) => readMarks(notes, grammarKey(unit))
export const saveDrill = (notes: Record<string, string>, unit: number, index: number, right: boolean, day: string) => saveMark(notes, grammarKey(unit), index, right, day)
export function drillSummary(notes: Record<string, string>, unit: number) {
  const total = grammarFor(unit)?.drills.length ?? 0
  const marks = Object.values(readGrammar(notes, unit).marks)
  return { total, done: marks.length, first: marks.filter(m => m === 1).length, open: marks.filter(m => m === 0).length }
}
/** Which drills a lesson day shows: the unit's drills are spread over its first three days (4, 2, 1), unanswered ones
 *  roll over to the next day, and a drill missed on an earlier day comes back until it is answered right. */
export function drillsForDay(notes: Record<string, string>, unit: number, day: number): number[] {
  const drills = grammarFor(unit)?.drills ?? []
  const { marks } = readGrammar(notes, unit)
  const upTo = day <= 1 ? 4 : day === 2 ? 6 : drills.length
  const fresh = drills.map((_, i) => i).filter(i => i < upTo && marks[i] === undefined)
  const missed = day <= 1 ? [] : drills.map((_, i) => i).filter(i => marks[i] === 0)
  return [...missed, ...fresh]
}
