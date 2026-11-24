import { checkDrill, grammarFor, readGrammar, type Drill } from './grammar'
import { units, type Sentence } from './todayLesson'

/** 主題總複習: when several units in a row teach the same grammar (過去式 is units 7–10, about two weeks), the rest day
 *  after the last one is a mixed test of the whole theme plus the related grammar learned before it (for 過去式: 現在式
 *  and 現在進行式). Questions come from the units' own drills (taught before used), missed ones first, all mixed. */
export type Family = 'tense' | 'nouns' | 'modals' | 'prepositions' | 'compare' | 'questions' | 'connect' | 'conditionals' | 'verbs' | 'voice' | 'other'
export interface Theme { id: string; name: string; family: Family; units: number[] }

/** Every unit belongs to exactly one theme; a theme's family says which earlier grammar is related. */
export const themes: Theme[] = [
  { id: 'present', name: '現在式', family: 'tense', units: [1, 4, 5] },
  { id: 'progressive', name: '進行式', family: 'tense', units: [6, 24] },
  { id: 'past', name: '過去式', family: 'tense', units: [7, 8, 9, 10] },
  { id: 'future', name: '未來的說法', family: 'tense', units: [11, 49] },
  { id: 'perfect', name: '完成式', family: 'tense', units: [25, 29, 36, 37] },
  { id: 'narrative', name: '敘事時態', family: 'tense', units: [48] },
  { id: 'nouns', name: '名詞和冠詞', family: 'nouns', units: [2, 3, 14, 20, 46] },
  { id: 'modals', name: '助動詞', family: 'modals', units: [12, 50] },
  { id: 'prepositions', name: '介系詞', family: 'prepositions', units: [13, 28] },
  { id: 'compare', name: '比較', family: 'compare', units: [15, 34] },
  { id: 'questions', name: '問句', family: 'questions', units: [16, 27, 32] },
  { id: 'there', name: 'there is 和 it', family: 'other', units: [17] },
  { id: 'frequency', name: '頻率和時間', family: 'other', units: [18] },
  { id: 'requests', name: '祈使句和請求', family: 'other', units: [19] },
  { id: 'linking', name: '連接詞', family: 'connect', units: [21, 22] },
  { id: 'verbforms', name: '動詞句型', family: 'verbs', units: [23, 35] },
  { id: 'conditionals', name: '假設語氣', family: 'conditionals', units: [26, 38, 51, 52] },
  { id: 'passive', name: '被動語態', family: 'voice', units: [30, 41] },
  { id: 'clauses', name: '子句', family: 'connect', units: [31, 42, 43, 53] },
  { id: 'reporting', name: '轉述', family: 'verbs', units: [33] },
  { id: 'contrast', name: '對比和因果', family: 'connect', units: [39, 40] },
  { id: 'numbers', name: '描述數字', family: 'other', units: [44] },
  { id: 'opinion', name: '表達意見', family: 'other', units: [45] },
  { id: 'collocations', name: '搭配和片語動詞', family: 'other', units: [47] },
]
export const themeOf = (unit: number) => themes.find(t => t.units.includes(unit))
const unitTitle = (unit: number) => units.find(u => u.id === unit)?.title ?? '單元 ' + unit

/** A stretch of two or more units in a row from the same theme, and what its review covers. */
export interface ThemeRun { id: string; theme: Theme; units: number[]; earlier: number[] }
/** How many related earlier units join a review (the most recent ones of the same family). */
export const EARLIER = 4
/** Every stretch of two or more consecutive units with the same theme, in course order (worked out once: the course is fixed). */
export const themeRuns = (): ThemeRun[] => allRuns
function findRuns(): ThemeRun[] {
  const order = units.map(u => u.id).sort((a, b) => a - b)
  const runs: ThemeRun[] = []
  let i = 0
  while (i < order.length) {
    const theme = themeOf(order[i])
    let j = i
    while (j + 1 < order.length && order[j + 1] === order[j] + 1 && themeOf(order[j + 1]) === theme) j++
    if (theme && j > i) {
      const run = order.slice(i, j + 1)
      const earlier = order.filter(u => u < run[0] && themeOf(u)?.family === theme.family).slice(-EARLIER)
      runs.push({ id: theme.id + '-' + run[0], theme, units: run, earlier })
    }
    i = j + 1
  }
  return runs
}

const allRuns = findRuns()

export const themeKey = (id: string) => 'theme.' + id
/** One review, saved under theme.<run id>: the latest round, and the first one (the real test; later rounds are practice). */
export interface ThemeResult {
  day: string; correct: number; total: number
  /** Units with a question answered wrong, in course order. */
  missed: number[]
  /** The questions answered wrong, as "unit.index", so another round brings them first. */
  wrong?: string[]
  /** The sentences at the end: each one's level (null = left blank or 「不會」). */
  sentences?: { id: string; level: string | null }[]
  tries?: number
  first?: { day: string; correct: number; total: number }
}
const isCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0
export function readThemeResult(notes: Record<string, string>, id: string): ThemeResult | null {
  try {
    const v = notes[themeKey(id)] ? JSON.parse(notes[themeKey(id)]) as ThemeResult : null
    return v && typeof v.day === 'string' && isCount(v.correct) && isCount(v.total) && Array.isArray(v.missed) ? v : null
  } catch { return null }
}
/** Saves a finished round of questions. A new round starts a new set of sentences; the first round stays as it was. */
export function saveThemeResult(notes: Record<string, string>, id: string, items: readonly ThemeItem[], rights: readonly boolean[], day: string) {
  const old = readThemeResult(notes, id)
  const wrongAt = items.flatMap((x, i) => rights[i] === false ? [x] : [])
  const correct = rights.filter(Boolean).length
  const result: ThemeResult = {
    day, correct, total: items.length,
    missed: [...new Set(wrongAt.map(x => x.unit))].sort((a, b) => a - b),
    wrong: wrongAt.map(x => x.unit + '.' + x.index),
    tries: (old ? old.tries ?? 1 : 0) + 1,
    first: old ? old.first ?? { day: old.day, correct: old.correct, total: old.total } : { day, correct, total: items.length },
  }
  return { ...notes, [themeKey(id)]: JSON.stringify(result) }
}
/** Adds one sentence of this round (written again, it replaces the earlier mark). */
export function saveThemeSentence(notes: Record<string, string>, id: string, sentenceId: string, level: string | null) {
  const old = readThemeResult(notes, id)
  if (!old) return notes
  const sentences = [...(old.sentences ?? []).filter(s => s.id !== sentenceId), { id: sentenceId, level }]
  return { ...notes, [themeKey(id)]: JSON.stringify({ ...old, sentences }) }
}
/** How many of the round's questions came from each unit, and how many of those were right. */
export function themeBreakdown(items: readonly ThemeItem[], rights: readonly boolean[]) {
  const order = [...new Set(items.map(x => x.unit))].sort((a, b) => a - b)
  return order.map(unit => {
    const own = items.flatMap((x, i) => x.unit === unit ? [rights[i]] : [])
    return { unit, title: unitTitle(unit), right: own.filter(r => r === true).length, total: own.length }
  })
}
/** The share of right answers that counts as knowing the theme: the same 80% as the other levels. */
export const themePassed = (correct: number, total: number) => total > 0 && correct >= Math.ceil(total * 0.8)
/** The review that is due: the latest stretch the course has moved past, if it hasn't been done. Only the latest one —
 *  an older stretch skipped long ago doesn't pile up. */
export function dueThemeRun(notes: Record<string, string>, currentUnit: number): ThemeRun | null {
  const latest = lastFinishedRun(currentUnit)
  return latest && !readThemeResult(notes, latest.id) ? latest : null
}
/** The latest stretch the course has moved past (done or not), and the next one ahead. */
export const lastFinishedRun = (currentUnit: number) => finishedRuns(currentUnit).at(-1) ?? null
export const nextRun = (currentUnit: number) => themeRuns().find(r => r.units[r.units.length - 1] >= currentUnit) ?? null
const quietKinds = ['exam', 'sprint', 'internship']
/** The days the review is put on the home page: rest days and days without a lesson — or any ordinary day if he keeps no
 *  rest day. Never in exams or the internship, whose short plan is nursing English. */
export const themeDay = (kind: string, restDays: readonly number[]) =>
  kind === 'rest' || kind === 'light' || (!restDays.length && !quietKinds.includes(kind))

export interface ThemeItem { unit: number; index: number; drill: Drill }
/** A small fixed shuffle, so the order is mixed but the same on a reload. */
function seeded(text: string) {
  let h = 2166136261
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296 }
}
/** How many questions each unit of the stretch gives: about a dozen in all, three to five a unit. */
export const perUnit = (run: ThemeRun) => Math.max(3, Math.min(5, Math.ceil(12 / run.units.length)))
/** The questions: from each unit of the stretch one of each kind where it can (fix, fill, choose) and then more up to
 *  perUnit; from the related earlier grammar one a unit, two from the most recent one. Questions missed before (in the
 *  lessons or an earlier round) come first; then everything is mixed together. */
export function themeQuiz(run: ThemeRun, notes: Record<string, string>): ThemeItem[] {
  const wrong = new Set(readThemeResult(notes, run.id)?.wrong ?? [])
  const pick = (unit: number, count: number): ThemeItem[] => {
    const drills = grammarFor(unit)?.drills ?? []
    const marks = readGrammar(notes, unit).marks
    const missed = (i: number) => marks[i] === 0 || marks[i] === 2 || wrong.has(unit + '.' + i)
    const order = drills.map((drill, index) => ({ unit, index, drill })).sort((a, b) => Number(missed(b.index)) - Number(missed(a.index)))
    const out: ThemeItem[] = []
    // Units giving one or two questions take turns at which kind comes first, so the earlier grammar isn't all 改錯.
    const kinds = (['fix', 'fill', 'choose'] as const).map((_, i, all) => all[(i + unit) % all.length])
    for (const k of kinds) {
      const hit = order.find(x => x.drill.k === k && !out.includes(x))
      if (hit && out.length < count) out.push(hit)
    }
    for (const x of order) if (out.length < count && !out.includes(x)) out.push(x)
    return out
  }
  const latest = run.earlier[run.earlier.length - 1]
  const items = [...run.units.flatMap(u => pick(u, perUnit(run))), ...run.earlier.flatMap(u => pick(u, u === latest ? 2 : 1))]
  const rand = seeded(run.id)
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [items[i], items[j]] = [items[j], items[i]] }
  return items
}
/** Two sentences to translate at the end, where he has to pick the grammar himself: a backup sentence from the last unit
 *  of the stretch, and one from the most recent earlier grammar of another theme (for 過去式: 現在進行式) — or, without
 *  one, the most recent earlier unit, or the first unit of the stretch. */
export function themeSentences(run: ThemeRun): Sentence[] {
  const from = (unit: number) => { const u = units.find(x => x.id === unit); return u ? [...u.backup, ...u.checkpoint][0] : undefined }
  const last = from(run.units[run.units.length - 1])
  const other = [...run.earlier].reverse().find(u => themeOf(u)?.id !== run.theme.id) ?? run.earlier[run.earlier.length - 1] ?? run.units[0]
  return [last, from(other)].filter((s, i, all): s is Sentence => !!s && all.findIndex(x => x?.id === s.id) === i)
}
/** What the review covers: 「過去式（單元 7–10）」, its units, and the earlier grammar mixed in (by unit and by theme name). */
export function themeScope(run: ThemeRun) {
  const span = run.units.length > 1 ? run.units[0] + '–' + run.units[run.units.length - 1] : String(run.units[0])
  const named = (unit: number) => ({ unit, title: unitTitle(unit) })
  return {
    title: run.theme.name + '（單元 ' + span + '）',
    units: run.units.map(named),
    earlier: run.earlier.map(named),
    earlierThemes: [...new Set(run.earlier.map(u => themeOf(u)?.name ?? unitTitle(u)))],
  }
}
/** How long a review takes: about 35 seconds a question and two minutes a sentence, rounded to fives. */
export function themeMinutes(run: ThemeRun) {
  const questions = themeQuiz(run, {}).length, sentences = themeSentences(run).length
  return Math.max(5, Math.round((questions * 35 + sentences * 120) / 300) * 5)
}
/** Every stretch the course has moved past, oldest first: those can be reviewed (again) any time. */
export const finishedRuns = (currentUnit: number) => themeRuns().filter(r => r.units[r.units.length - 1] < currentUnit)
export { checkDrill }
