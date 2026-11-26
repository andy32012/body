/** The English course as a CEFR ladder: A1 → A2 → B1 → B2 → C1 → C2. Each step ends with a certificate; passing it is
 *  what moves the level up. The daily lessons of the next step open once that certificate is passed or booked (an exam
 *  date is filled in), so waiting for a test date or a result never stops the study — a failed result closes the next
 *  step again until the next sitting is booked. */
import curriculum from '../data/curriculum.json'

export type LevelId = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export const levelIds: readonly LevelId[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const levelIndex = (l: LevelId) => levelIds.indexOf(l)

export type ExamId = 'gept-a2' | 'gept-b1' | 'gept-b2' | 'gept-c1' | 'ielts' | 'other'
export interface Exam { id: ExamId; name: string; how: string; pass: string; fee: string; sessions: string; link?: string }
export interface Step {
  from: LevelId; to: LevelId
  /** Daily-lesson units of this step; null while its lessons are still being written. */
  units: [number, number] | null
  /** 7000 單 levels that belong here. */
  words: [number, number] | null
  /** When those levels are seen at the planned pace: 20 new words a day (DEFAULT_DAILY), review first, the app opened every day
   *  (Sunday's short plan too), new words paused in the internship and licensing exam (2028-02 to 2029-07).
   *  Worked out day by day with the app's own review rules: `npm run words:pace` (scripts/words-pace.ts). */
  wordsBy?: string
  /** Rough date in the five-year plan, and Cambridge's guided-learning hours from zero (self-study usually needs more). */
  target: string; hours: string
  /** When the plan books this certificate, if not right after the step's last unit (shown where the units end). */
  bookWhen?: string
  exams: ExamId[]
  /** IELTS Academic overall band that counts as this level. */
  ielts?: number
  practice: string
  optional?: boolean
}

const geptLink = 'https://www.gept.org.tw/'
export const exams: Record<ExamId, Exam> = {
  'gept-a2': { id: 'gept-a2', name: '全民英檢初級', how: '聽讀、說寫兩個都要過，可以分開考', link: geptLink, sessions: '一年 5 場',
    pass: '聽讀：兩項合計 160、單項不低於 72（滿分各 120）；說寫：寫作 70、口說 80（滿分各 100）',
    fee: '2026 年聽讀 600、說寫 900 元；2027 年 630、950 元' },
  'gept-b1': { id: 'gept-b1', name: '全民英檢中級', how: '聽讀、說寫兩個都要過，或報一日考', link: geptLink, sessions: '一年 7 場',
    pass: '聽讀：合計 160、單項不低於 72；說寫：寫作、口說都要 80',
    fee: '2026 年聽讀 850、說寫 1,550、一日考 2,400 元；2027 年聽讀 900、說寫 1,630 元' },
  'gept-b2': { id: 'gept-b2', name: '全民英檢中高級', how: '聽讀、說寫兩個都要過，或報一日考', link: geptLink, sessions: '一年 5 場',
    pass: '聽讀：合計 160、單項不低於 72；說寫：寫作、口說都要 80',
    fee: '2026 年聽讀 1,050、說寫 1,750 元；2027 年 1,110、1,850 元' },
  'gept-c1': { id: 'gept-c1', name: '全民英檢高級', how: '聽讀、說寫兩個都要過', link: geptLink, sessions: '聽讀、說寫各一年一次',
    pass: '照成績單上的「通過」', fee: '2026 年聽讀 1,980、說寫 3,200 元' },
  ielts: { id: 'ielts', name: '雅思學術組（IELTS Academic）', how: '聽說讀寫一天考完，電腦考', link: 'https://ielts.idp.com/taiwan',
    sessions: '電腦考場次多，報名前看官網',
    pass: 'B2 要總分 5.5、C1 要 7.0、C2 要 8.5；美國 RN 的 VisaScreen 要總分 6.5、口說 7',
    fee: '一次 NT$9,000（2026 年 7 月起）' },
  other: { id: 'other', name: '其他證照', how: '填證照名稱和成績單上的 CEFR 等級', sessions: '', pass: '成績單上的 CEFR 等級到這一級', fee: '' },
}

/** A step's daily-lesson units, from the course catalog: stage A, B, C (+ the bridge, BR) of curriculum.json, and C1 later.
 *  Null while a step has no published units. */
function unitsOf(stages: readonly string[]): [number, number] | null {
  const ids = curriculum.overview.filter(o => stages.includes(o.stage)).map(o => o.unit)
  return ids.length ? [Math.min(...ids), Math.max(...ids)] : null
}
/** "1–28": a step's units as the plan texts write them. */
const span = (stages: readonly string[]) => (unitsOf(stages) ?? []).join('–')
export const steps: readonly Step[] = [
  { from: 'A1', to: 'A2', units: unitsOf(['A']), words: [1, 2], wordsBy: '約 2027 年 3 月看完', target: '2027 年下半年', hours: '約 200 小時', exams: ['gept-a2', 'other'],
    practice: '每日課單元 ' + span(['A']) + '、7000 單第 1–2 級、閱讀 A1–A2、寫作①句子、生活主題' },
  { from: 'A2', to: 'B1', units: unitsOf(['B']), words: [3, 4], wordsBy: '第 3 級約 2027 年 7 月、第 4 級約 2027 年 12 月看完，趕在實習之前', target: '2028 年初', hours: '約 350–400 小時', exams: ['gept-b1', 'other'],
    practice: '每日課單元 ' + span(['B']) + '、7000 單第 3–4 級、閱讀 B1、寫作②一段和③多段' },
  { from: 'B1', to: 'B2', units: unitsOf(['C', 'BR']), words: [5, 6], wordsBy: '約 2029 年 10 月看完', target: '2030 年中', hours: '約 500–600 小時', exams: ['gept-b2', 'ielts', 'other'], ielts: 5.5,
    bookWhen: '先不考：等 7000 單第 5–6 級看完（約 2029 年 10 月，國考後）再報名',
    practice: '每日課單元 ' + span(['C']) + '，再接 B1→B2 橋接單元（敘事時態、未來完成、推測、第三類假設、wish、非限定關係子句），每個橋接單元都有讀聽說寫和沒看過的回測；7000 單第 5–6 級、閱讀 B2、寫作④⑤⑥、口說 Part 2' },
  { from: 'B2', to: 'C1', units: unitsOf(['C1']), words: null, target: '2031 年底', hours: '約 700–800 小時', exams: ['ielts', 'gept-c1', 'other'], ielts: 7,
    practice: '每日課教材還在寫；先用雅思閱讀、寫作 Task 1／2、口說 Part 2 和 Emma 練，最後一年找真人老師練口說' },
  { from: 'C1', to: 'C2', units: null, words: null, target: '選修，到美國以後', hours: '約 1,000–1,200 小時', exams: ['ielts', 'other'], ielts: 8.5, optional: true,
    practice: '不排進五年計畫：美國 RN 不需要 C2' },
]
export const stepTo = (to: LevelId) => steps.find(s => s.to === to)!

/** One sitting toward a level: booked with its date first, scores filled in when they come out. */
export interface CertAttempt {
  id: string
  exam: ExamId
  /** Test date. */
  date: string
  /** GEPT: which half this sitting was (聽讀 / 說寫 / both, as in the one-day test). */
  parts?: 'lr' | 'sw' | 'both'
  /** GEPT listening, reading (out of 120). */
  lr?: [number, number]
  /** GEPT writing, speaking (out of 100). */
  sw?: [number, number]
  /** IELTS bands. */
  band?: { overall: number; listening?: number; reading?: number; writing?: number; speaking?: number }
  /** GEPT 高級 and other certificates: the result as printed. */
  passed?: boolean
  otherName?: string
  otherLevel?: LevelId
}
export const certKey = (to: LevelId) => 'cert.' + to
export function readAttempts(notes: Record<string, string>, to: LevelId): CertAttempt[] {
  try {
    const v = JSON.parse(notes[certKey(to)] || '[]')
    return Array.isArray(v) ? v.filter((a): a is CertAttempt => !!a && typeof a.id === 'string' && typeof a.date === 'string' && typeof a.exam === 'string') : []
  } catch { return [] }
}
export function saveAttempt(notes: Record<string, string>, to: LevelId, attempt: CertAttempt) {
  const list = readAttempts(notes, to).filter(a => a.id !== attempt.id)
  return { ...notes, [certKey(to)]: JSON.stringify([...list, attempt].sort((a, b) => a.date.localeCompare(b.date))) }
}
export function removeAttempt(notes: Record<string, string>, to: LevelId, id: string) {
  return { ...notes, [certKey(to)]: JSON.stringify(readAttempts(notes, to).filter(a => a.id !== id)) }
}

const gept = (e: ExamId) => e === 'gept-a2' || e === 'gept-b1' || e === 'gept-b2'
export const lrPass = (lr?: readonly number[]) => !!lr && lr[0] + lr[1] >= 160 && lr[0] >= 72 && lr[1] >= 72
export const swPass = (exam: ExamId, sw?: readonly number[]) => !!sw && sw[0] >= (exam === 'gept-a2' ? 70 : 80) && sw[1] >= 80
const takesLr = (a: CertAttempt) => a.parts !== 'sw'
const takesSw = (a: CertAttempt) => a.parts !== 'lr'
/** No result filled in yet: booked, or taken and waiting for the scores. */
export function waiting(a: CertAttempt) {
  if (gept(a.exam)) return (takesLr(a) && !a.lr) || (takesSw(a) && !a.sw)
  if (a.exam === 'ielts') return !a.band
  return a.passed === undefined
}
/** Whether one sitting (with the others before it, for GEPT halves) reached `to`. */
function attemptPasses(a: CertAttempt, to: LevelId) {
  const step = stepTo(to)
  if (a.exam === 'ielts') return !!a.band && a.band.overall >= (step.ielts ?? 99)
  if (a.exam === 'other') return a.passed === true && !!a.otherLevel && levelIndex(a.otherLevel) >= levelIndex(to)
  if (a.exam === 'gept-c1') return a.passed === true
  return false
}

export type CertState = 'passed' | 'waiting' | 'partial' | 'failed' | 'none'
export interface CertStatus { state: CertState; passedOn?: string; next?: CertAttempt; lr?: boolean; sw?: boolean; attempts: CertAttempt[] }
export function certStatus(notes: Record<string, string>, to: LevelId): CertStatus {
  const attempts = readAttempts(notes, to)
  let passedOn: string | undefined
  // GEPT halves can come from different sittings of the same level. A one-day test (both halves in one sitting) does not
  // reach back: its scores never join a half passed at an earlier sitting (LTTC 一日考問與答). A half it missed can be
  // taken again later, and that later sitting joins the half it passed.
  const geptExam = steps.find(s => s.to === to)?.exams.find(gept)
  const lrOk = attempts.filter(a => a.exam === geptExam && takesLr(a) && lrPass(a.lr))
  const swOk = attempts.filter(a => a.exam === geptExam && takesSw(a) && geptExam && swPass(geptExam, a.sw))
  for (const l of lrOk) for (const w of swOk) {
    const later = l.date > w.date ? l : w.date > l.date ? w : l.parts === 'both' ? w : l
    if (l.id !== w.id && later.parts === 'both') continue
    const on = l.date > w.date ? l.date : w.date
    if (!passedOn || on < passedOn) passedOn = on
  }
  for (const a of attempts) if (attemptPasses(a, to) && (!passedOn || a.date < passedOn)) passedOn = a.date
  const next = attempts.find(waiting)
  if (passedOn) return { state: 'passed', passedOn, attempts }
  if (next) return { state: 'waiting', next, attempts, lr: lrOk.length > 0, sw: swOk.length > 0 }
  if (lrOk.length || swOk.length) return { state: 'partial', attempts, lr: lrOk.length > 0, sw: swOk.length > 0 }
  return { state: attempts.length ? 'failed' : 'none', attempts }
}

/** The level a certificate shows: the highest step passed (a B1 certificate counts even if A2 was never taken). */
export function officialLevel(notes: Record<string, string>): LevelId {
  let best: LevelId = 'A1'
  for (const s of steps) if (certStatus(notes, s.to).state === 'passed' && levelIndex(s.to) > levelIndex(best)) best = s.to
  return best
}
/** The level of a certificate actually passed, or null with none yet (the course starts at A1, which is not a certificate). */
export function certifiedLevel(notes: Record<string, string>): LevelId | null {
  return steps.some(s => certStatus(notes, s.to).state === 'passed') ? officialLevel(notes) : null
}
/** A level counts as open for moving on when it is reached, or its certificate is booked / waiting for results. */
export function levelOpen(notes: Record<string, string>, to: LevelId) {
  if (levelIndex(officialLevel(notes)) >= levelIndex(to)) return true
  return certStatus(notes, to).state === 'waiting'
}
/** The step a daily-lesson unit belongs to; past the written units, the first step whose lessons are not written yet. */
export function stepOfUnit(unit: number): Step {
  return steps.find(s => s.units && unit >= s.units[0] && unit <= s.units[1]) ?? steps.find(s => !s.units)!
}
/** The certificate a unit is waiting for: the step before it must be passed or booked. Null when the unit is open, and past
 *  the last written unit, where there is nothing to open: the plan books B2 once its words are done, not when the units are. */
export function unitGate(notes: Record<string, string>, unit: number): Step | null {
  const step = stepOfUnit(unit)
  const i = steps.indexOf(step)
  if (i <= 0 || !step.units) return null
  const before = steps[i - 1]
  return levelOpen(notes, before.to) ? null : before
}
/** The step whose daily lessons are being studied, and how far along. */
export function courseProgress(unit: number) {
  const step = stepOfUnit(unit)
  if (!step.units) return { step, done: 0, total: 0 }
  const [a, b] = step.units
  return { step, done: Math.max(0, Math.min(b, unit) - a), total: b - a + 1 }
}
/** The last unit of a step: finishing it is when to book the certificate. */
export const stepEndingAt = (unit: number) => steps.find(s => s.units && s.units[1] === unit) ?? null
/** The first exam a step suggests, for short messages. */
export const mainExam = (s: Step) => exams[s.exams[0]]

/** VisaScreen for a US RN: IELTS Academic overall 6.5 and speaking 7. Scores are usually accepted for two years. */
export function visaScreen(notes: Record<string, string>) {
  const all = levelIds.flatMap(l => readAttempts(notes, l)).filter(a => a.exam === 'ielts' && a.band && a.band.overall >= 6.5 && (a.band.speaking ?? 0) >= 7)
  const last = all.sort((a, b) => b.date.localeCompare(a.date))[0]
  // Two calendar years on (a 29 February result ends on 28 February).
  return last ? { date: last.date, until: Number(last.date.slice(0, 4)) + 2 + (last.date.endsWith('-02-29') ? '-02-28' : last.date.slice(4)) } : null
}
/** Whether that IELTS result is still inside the two years the site goes by (up to and including `until`). Reaching the
 *  score once is not the same as a result that can still be sent; acceptance is decided by the agency. */
export const visaCurrent = (v: { until: string } | null, today: string) => !!v && today <= v.until
/** The first unit from `unit` on whose lessons wait for a certificate (for the calendar), or null. */
export function firstLockedUnit(notes: Record<string, string>, unit: number): number | null {
  const starts = [unit, ...steps.flatMap(s => s.units && s.units[0] > unit ? [s.units[0]] : [])]
  return starts.find(u => unitGate(notes, u)) ?? null
}

/** How Emma talks: her level follows the step the daily lessons are on, so the chat grows with the course. */
export function emmaLevel(unit: number): { about: string; speak: string } {
  const to = stepOfUnit(unit).to
  if (to === 'A2') return { about: 'His English is around A1–A2 level (early junior-high).',
    speak: 'Speak very simple, clear English (A1–A2), slowly, with short sentences and everyday words. Keep your turns to one or two short sentences, and end with an easy question so he talks more.' }
  if (to === 'B1') return { about: 'His English is around A2–B1 level.',
    speak: 'Speak simple, clear English (A2–B1) a bit slowly. Keep your turns short, usually one or two sentences, and end with an easy question so he talks more.' }
  if (to === 'B2') return { about: 'His English is around B1–B2 level.',
    speak: 'Speak clear, natural English (B1–B2) at a natural speed. Your turns can be two or three sentences. Ask follow-up "why" and "how" questions so he explains, gives reasons and examples, and talks in longer turns.' }
  return { about: 'His English is around B2–C1 level.',
    speak: 'Speak natural English (B2–C1) at a normal speed, with everyday idioms. Talk about abstract topics too (health systems, ethics, work and life), and push him to justify his opinions, compare and speculate.' }
}
