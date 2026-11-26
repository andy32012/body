import type { ReadBand, ReadLevel } from './reading'
import { baseForms } from './story'
import { levelEntry, wordKey } from './vocab'
import { bestExamAttempt, examRatio, type ExamAttempt, type ExamRecord } from './examKeys'

/** Reading passages from Taiwan's public exams (會考, 學測, 指考 and the civil-service exams), with the official answers,
 *  placed on the same steps as the graded reading (A1–B2, 簡單／中等／難). Official exam papers are not protected by
 *  copyright in Taiwan (著作權法第 9 條). In 閱讀測驗 they are passages of those bands (readingTest.ts): their passes count
 *  toward opening the next band. The screen never says which exam a passage came from. */
export type ExamKind = 'cap' | 'gsat' | 'ast' | 'civil'
export interface ExamQuestion {
  /** The question's number on the paper. */
  n: number
  /** Empty for a numbered blank in the passage ("social distancing {{40}}."): the options fill the blank. */
  q: string
  options: string[]
  answer: number
  blank?: boolean
  /** Notes on the official answer, shown after the learner answers. */
  explanation?: string
}
export interface ExamPassage {
  id: string; level: ReadLevel; band: ReadBand; kind: ExamKind
  /** Where it came from (113 會考, 92 學測（補考）, 114 高考三級; `exam` is the paper's full official name): kept for
   *  maintenance, never shown on screen. */
  source: string; exam: string
  first: number; last: number; words: number
  /** Paragraphs; a blank is written {{n}} with the question's number. */
  paras: string[]
  /** Emphasis in the printed passage that a question refers to. The surrounding phrase locates the word. */
  emphasis?: { phrase: string; word: string; underline?: boolean }
  /** The word notes printed with the passage on the paper. */
  gloss?: { en: string; zh: string }[]
  qs: ExamQuestion[]
  /** Blanks left in the text whose question needs the paper's picture: shown, not asked. */
  skipped?: number[]
  /** The paper has a picture with this passage; the questions kept here do not need it. */
  picture?: boolean
}

export const examKinds: { id: ExamKind; name: string; note: string }[] = [
  { id: 'cap', name: '會考', note: '國中教育會考' },
  { id: 'gsat', name: '學測', note: '大學學科能力測驗' },
  { id: 'ast', name: '指考', note: '大學指定科目考試' },
  { id: 'civil', name: '國家考試', note: '公務人員考試的英文閱讀' },
]
export const kindName = (k: ExamKind) => examKinds.find(x => x.id === k)!.name

/** 第 40–43 題 / 第 7 題: the numbers as printed on the paper. */
export const questionRange = (p: Pick<ExamPassage, 'first' | 'last'>) => p.first === p.last ? '第 ' + p.first + ' 題' : '第 ' + p.first + '–' + p.last + ' 題'

/** A passage's text in pieces, so a blank can be drawn as a box: "… distancing {{40}}. In fact" → text, blank 40, text. */
export function blankParts(para: string): ({ text: string } | { blank: number })[] {
  return para.split(/(\{\{\d+\}\})/).filter(Boolean).map(t => {
    const m = t.match(/^\{\{(\d+)\}\}$/)
    return m ? { blank: Number(m[1]) } : { text: t }
  })
}

/** The blanks numbered the way they are shown: 1, 2, 3 … in the order they appear in the text (the paper's own question
 *  numbers, like 41–45, are not shown). Blanks that need the paper's picture are numbered too, so the numbers have no gaps. */
export function blankNumbers(p: Pick<ExamPassage, 'paras'>): Map<number, number> {
  const out = new Map<number, number>()
  for (const m of p.paras.join(' ').matchAll(/\{\{(\d+)\}\}/g)) if (!out.has(Number(m[1]))) out.set(Number(m[1]), out.size + 1)
  return out
}

/** One record per passage, `exam.read.<id>`, apart from the graded reading's `read.<id>`. The latest attempt, plus `best`:
 *  a redo on the same day is practice and never replaces the record; a lower score later never erases a pass. */
export type { ExamAttempt, ExamRecord } from './examKeys'
export const examReadKey = (id: string) => 'exam.read.' + id
/** The list he was looking at (level, band, which exams), so the page opens there again. */
export const examPlaceKey = 'exam.read.at'
export interface ExamPlace { level: ReadLevel; band: ReadBand; kind?: ExamKind }

export function readExamRecord(notes: Record<string, string>, id: string): ExamRecord | null {
  try {
    const v = notes[examReadKey(id)]
    const r = v ? JSON.parse(v) as ExamRecord : null
    return r && typeof r.correct === 'number' && typeof r.total === 'number' && r.total > 0 ? r : null
  } catch { return null }
}
/** Passed at 70% or better, on an attempt that counts. */
export function examPassed(r: ExamRecord | null): boolean {
  const best = r && bestExamAttempt(r)
  return !!best && examRatio(best) >= 0.7
}
export function saveExamRead(notes: Record<string, string>, id: string, attempt: ExamAttempt & { picks: number[] }) {
  const old = readExamRecord(notes, id)
  const oldBest = old ? bestExamAttempt(old) : undefined
  const practice = !!old && old.day === attempt.day
  const now = { ...attempt, at: Math.max(Date.now(), (old?.at ?? 0) + 1) }
  const best = !practice && (!oldBest || examRatio(now) > examRatio(oldBest)) ? now : oldBest
  const rec: ExamRecord = { ...now, tries: (old?.tries ?? 0) + 1, best, ...(practice ? { practice: true } : {}) }
  return { ...notes, [examReadKey(id)]: JSON.stringify(rec) }
}

export { correctedKeys, rescoreExams } from './examKeys'

export function readExamPlace(notes: Record<string, string>): ExamPlace | null {
  try {
    const p = JSON.parse(notes[examPlaceKey] ?? 'null') as ExamPlace | null
    return p && ['A1', 'A2', 'B1', 'B2'].includes(p.level) && ['easy', 'mid', 'hard'].includes(p.band) ? p : null
  } catch { return null }
}

/** The next passage of a list: one never read first (in the list's order), then one not passed yet (the one read longest
 *  ago first). `skip`: passed over this round. Null when everything is passed or skipped. */
export function nextExamPassage(list: readonly ExamPassage[], notes: Record<string, string>, skip: readonly string[] = []): ExamPassage | null {
  const open = list.filter(p => !skip.includes(p.id))
  const fresh = open.find(p => !readExamRecord(notes, p.id))
  if (fresh) return fresh
  const waiting = open.filter(p => !examPassed(readExamRecord(notes, p.id)))
    .sort((a, b) => readExamRecord(notes, a.id)!.day.localeCompare(readExamRecord(notes, b.id)!.day))
  return waiting[0] ?? null
}

export interface ExamWord { en: string; zh: string; key?: string; note: boolean }
/** Words worth taking away from a passage: the paper's own word notes first (their meaning in this passage), then words of
 *  levels 4–6 of the 7000-word table that are in the passage and not known, learning or in the review yet. `key` is the
 *  word table's key: only those words can become review cards. */
export function examWords(p: Pick<ExamPassage, 'paras' | 'gloss'>, have: { known: readonly string[]; learning: readonly string[]; cards: readonly string[] }, extra = 5): ExamWord[] {
  const met = new Set([...have.known, ...have.learning].map(wordKey))
  const carded = new Set(have.cards)
  const fresh = (key: string) => !met.has(key) && !carded.has('word:' + key)
  const out: ExamWord[] = []
  const seen = new Set<string>()
  for (const g of p.gloss ?? []) {
    const head = g.en.replace(/\s*\(.*\)$/, '')
    const entry = levelEntry(head)
    const key = entry ? wordKey(entry.en) : undefined
    seen.add(key ?? head.toLowerCase())
    out.push({ en: head, zh: g.zh, ...(key ? { key } : {}), note: true })
  }
  const found: { en: string; zh: string; key: string; level: number }[] = []
  for (const token of p.paras.join(' ').replace(/\{\{\d+\}\}/g, ' ').match(/[A-Za-z][a-z'’-]+/g) ?? []) {
    if (token.length < 4) continue
    const entry = baseForms(token).map(b => levelEntry(b)).find(Boolean)
    if (!entry || entry.level < 4) continue
    const key = wordKey(entry.en)
    if (seen.has(key) || !fresh(key)) continue
    seen.add(key)
    found.push({ en: entry.en.split(/[\s(/]/)[0], zh: entry.zh.split('；')[0], key, level: entry.level })
  }
  found.sort((a, b) => b.level - a.level)
  return [...out, ...found.slice(0, extra).map(w => ({ en: w.en, zh: w.zh, key: w.key, note: false }))]
}

/** A typed answer for 看中文寫英文: the same word, ignoring case, spaces at the ends and a final period. */
export const sameWord = (typed: string, en: string) => {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ').replace(/’/g, "'")
  return norm(typed) === norm(en)
}
