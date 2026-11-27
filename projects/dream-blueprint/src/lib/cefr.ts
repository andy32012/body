/** The English course as a CEFR ladder: A1 → A2 → B1 → B2 → C1 → C2. Each step ends with a certificate; passing it is
 *  what moves the level up. The daily lessons of the next step open once that certificate is passed or booked (an exam
 *  date is filled in), so waiting for a test date or a result never stops the study — a failed result closes the next
 *  step again until the next sitting is booked. */
import curriculum from '../data/curriculum.json'
import { overallBand, skills, validBand, type MockSkill } from './ieltsMock'
import { dayKey } from './progress'

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
  /** The plan's target for seeing those levels (a goal, kept as it was set). */
  wordsBy?: string
  /** Where the app's own rules land at the planned pace (20 new words a day, review first, the review cap and the new-word
   *  brake), worked out day by day by `npm run words:pace` (scripts/words-pace.ts, every published unit): the range is
   *  from opening the app every day to leaving Sundays out. A model with assumptions, not a promise — rerun it when the
   *  rules change. Last run 2026-11-27. */
  wordsForecast?: string
  /** Rough date in the five-year plan, and Cambridge's guided-learning hours from zero (self-study usually needs more). */
  target: string; hours: string
  /** When the plan books this certificate, if not right after the step's last unit (shown where the units end). */
  bookWhen?: string
  exams: ExamId[]
  /** The course's IELTS Academic overall-band progression target. */
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
    fee: '2026 年聽讀 850、說寫 1,550、一日考 2,400 元；2027 年聽讀 900、說寫 1,630、一日考 2,530 元' },
  'gept-b2': { id: 'gept-b2', name: '全民英檢中高級', how: '聽讀、說寫兩個都要過，或報一日考', link: geptLink, sessions: '一年 5 場',
    pass: '聽讀：合計 160、單項不低於 72；說寫：寫作、口說都要 80',
    fee: '2026 年聽讀 1,050、說寫 1,750 元；2027 年 1,110、1,850 元' },
  'gept-c1': { id: 'gept-c1', name: '全民英檢高級', how: '聽讀、說寫兩個都要過', link: geptLink, sessions: '聽讀、說寫各一年一次',
    pass: '照成績單上的「通過」', fee: '2026 年聽讀 1,980、說寫 3,200 元' },
  ielts: { id: 'ielts', name: '雅思學術組（IELTS Academic）', how: '聽力、閱讀、寫作用電腦連續應考。口試由考場排定，也會另日舉行，以考前通知為準。', link: 'https://ielts.idp.com/taiwan',
    sessions: '電腦考場次多，報名前看官網',
    pass: '本課程採雅思學術組總分判定能否升級。各受理單位另訂分數要求。',
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
  { from: 'A1', to: 'A2', units: unitsOf(['A']), words: [1, 2], wordsBy: '約 2027 年 3 月看完', wordsForecast: '第 2 級約 2027 年 4–5 月', target: '2027 年下半年', hours: '約 200 小時', exams: ['gept-a2', 'other'],
    practice: '每日課單元 ' + span(['A']) + '、7000 單第 1–2 級、閱讀 A1–A2、寫作階梯①–⑥（從一句完整的話到三五句的小短文）、生活主題' },
  { from: 'A2', to: 'B1', units: unitsOf(['B']), words: [3, 4], wordsBy: '第 3 級約 2027 年 7 月、第 4 級約 2027 年 12 月看完，趕在實習之前', wordsForecast: '第 3 級約 2027 年 11 月到 2028 年 4 月、第 4 級約 2029 年 8–12 月', target: '2028 年初', hours: '約 350–400 小時', exams: ['gept-b1', 'other'],
    practice: '每日課單元 ' + span(['B']) + '、7000 單第 3–4 級、閱讀 B1、寫作階梯⑦一段、⑧說出意見、⑨多段' },
  { from: 'B1', to: 'B2', units: unitsOf(['C', 'BR']), words: [5, 6], wordsBy: '不設看完的期限，照每天的進度走（不是報名條件）', wordsForecast: '第 5 級約 2030 年 11 月到 2031 年 11 月，第 6 級在模擬截止時尚未看完', target: '2030 年中', hours: '約 500–600 小時', exams: ['gept-b2', 'ielts', 'other'], ielts: 5.5,
    bookWhen: '先不考：等中高級題型的聽讀、說寫模擬穩定到通過標準再報名（目標約 2029 年 10 月，國考後）；不用等 7000 單第 5–6 級看完',
    practice: '每日課單元 ' + span(['C']) + '，再接 B1→B2 橋接單元（敘事時態、未來完成、推測、第三類假設、wish、非限定關係子句），每個橋接單元都有讀聽說寫和沒看過的回測；7000 單第 5–6 級、閱讀 B2、寫作階梯⑩–⑭（數字和變化、雅思 Task 1／2、兩面意見、橋接段落）、口說 Part 2' },
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
  /** Date when registration was completed, if known. */
  registeredOn?: string
  /** GEPT: what this sitting was — 聽讀, 說寫, all four in one day (一日考), or one skill taken again (只考寫作 / 只考口說). */
  parts?: GeptParts
  /** GEPT listening, reading (out of 120). */
  lr?: [number, number]
  /** GEPT writing, speaking (out of 100). */
  sw?: [number, number]
  /** GEPT writing or speaking taken on its own (out of 100): not taking a skill is not a zero. */
  writing?: number
  speaking?: number
  /** IELTS bands. */
  band?: IeltsBands
  /** GEPT 高級 and other certificates: the result as printed. */
  passed?: boolean
  otherName?: string
  otherLevel?: LevelId
}
type IeltsBands = { overall: number } & Partial<Record<MockSkill, number | null>>

export function ieltsBandCheck(band: IeltsBands) {
  // null records a section explicitly cleared during an edit, so a synced old value cannot reappear.
  if (!validBand(band.overall) || skills.some(skill => band[skill] != null && !validBand(band[skill]))) return { valid: false }
  const sections = Object.fromEntries(skills.map(skill => [skill, band[skill] ?? undefined]))
  const calculated = overallBand(sections)
  return { valid: calculated === undefined || calculated === band.overall, calculated }
}

export function validExamDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const date = new Date(day)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
}
export const certKey = (to: LevelId) => 'cert.' + to
const deletedCertKey = (to: LevelId) => 'cert.removed.' + to
function removedAttempts(notes: Record<string, string>, to: LevelId): string[] {
  try {
    const list: unknown = JSON.parse(notes[deletedCertKey(to)] || '[]')
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] }
}
function readAttemptList(notes: Record<string, string>, to: LevelId): CertAttempt[] {
  try {
    const v = JSON.parse(notes[certKey(to)] || '[]')
    return Array.isArray(v) ? v.filter((a): a is CertAttempt => !!a && typeof a.id === 'string' && typeof a.date === 'string' &&
      typeof a.exam === 'string' && Object.hasOwn(exams, a.exam)) : []
  } catch { return [] }
}
function uniqueAttempts(list: CertAttempt[], removed: ReadonlySet<string>) {
  const byId = new Map<string, CertAttempt>()
  for (const attempt of list) {
    if (removed.has(attempt.id)) continue
    const previous = byId.get(attempt.id)
    // Recording a result completes the same booking. A second device's open booking cannot erase that result.
    if (previous && !waiting(previous) && waiting(attempt)) {
      if (attempt.registeredOn) byId.set(attempt.id, { ...previous, registeredOn: attempt.registeredOn })
      continue
    }
    const current = { ...attempt, registeredOn: attempt.registeredOn ?? previous?.registeredOn }
    if (previous?.band && attempt.band) {
      // IELTS permits filling in any subset of the four part scores. Each device may have a different subset.
      const band = { ...previous.band, overall: attempt.band.overall }
      for (const part of skills) {
        const score = attempt.band[part]
        if (score !== undefined) band[part] = score
      }
      byId.set(attempt.id, { ...current, band })
    } else {
      byId.set(attempt.id, current)
    }
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
export function readAttempts(notes: Record<string, string>, to: LevelId): CertAttempt[] {
  return uniqueAttempts(readAttemptList(notes, to), new Set(removedAttempts(notes, to)))
}
export function saveAttempt(notes: Record<string, string>, to: LevelId, attempt: CertAttempt) {
  const list = uniqueAttempts([...readAttempts(notes, to), attempt], new Set(removedAttempts(notes, to)))
  return { ...notes, [certKey(to)]: JSON.stringify(list) }
}
export function removeAttempt(notes: Record<string, string>, to: LevelId, id: string) {
  const removed = [...new Set([...removedAttempts(notes, to), id])].sort()
  return { ...notes, [certKey(to)]: JSON.stringify(readAttempts(notes, to).filter(a => a.id !== id)),
    [deletedCertKey(to)]: JSON.stringify(removed) }
}
/** Roll up both copies after all notes have been read, even when one side only has the deletion note. */
export function mergeCertificates(older: Record<string, string>, newer: Record<string, string>) {
  const patch: Record<string, string> = {}
  for (const to of levelIds) {
    const key = certKey(to)
    const removed = new Set([...removedAttempts(older, to), ...removedAttempts(newer, to)])
    if (key in older || key in newer || removed.size) {
      patch[key] = JSON.stringify(uniqueAttempts([...readAttemptList(older, to), ...readAttemptList(newer, to)], removed))
    }
    if (removed.size) patch[deletedCertKey(to)] = JSON.stringify([...removed].sort())
  }
  return patch
}

export type GeptParts = 'lr' | 'sw' | 'both' | 'w' | 's'
export const gept = (e: ExamId) => e === 'gept-a2' || e === 'gept-b1' || e === 'gept-b2'
export function geptParts(exam: ExamId): readonly GeptParts[] {
  return exam === 'gept-a2' ? ['lr', 'sw', 'w', 's'] : ['lr', 'sw', 'both', 'w', 's']
}
const examScore = (score: unknown, max: number): score is number =>
  typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= max
export const lrPass = (lr?: readonly number[]) => Array.isArray(lr) && examScore(lr[0], 120) && examScore(lr[1], 120) &&
  lr[0] + lr[1] >= 160 && lr[0] >= 72 && lr[1] >= 72
const writingMark = (exam: ExamId) => exam === 'gept-a2' ? 70 : 80
export const swPass = (exam: ExamId, sw?: readonly number[]) => !!sw && sw[0] >= writingMark(exam) && sw[1] >= 80
// A sitting saved before the parts were asked is all four.
export const partsOf = (a: CertAttempt): GeptParts => a.parts ?? 'both'
export const legacyElementary = (a: CertAttempt) => a.exam === 'gept-a2' && partsOf(a) === 'both'
const takesLr = (a: CertAttempt) => partsOf(a) === 'lr' || partsOf(a) === 'both'
const takesW = (a: CertAttempt) => ['sw', 'both', 'w'].includes(partsOf(a))
const takesS = (a: CertAttempt) => ['sw', 'both', 's'].includes(partsOf(a))
export const writingOf = (a: CertAttempt) => partsOf(a) === 'w' ? a.writing : takesW(a) ? a.sw?.[0] : undefined
export const speakingOf = (a: CertAttempt) => partsOf(a) === 's' ? a.speaking : takesS(a) ? a.sw?.[1] : undefined
export const writingPass = (a: CertAttempt) => { const w = writingOf(a); return examScore(w, 100) && w >= writingMark(a.exam) }
export const speakingPass = (a: CertAttempt) => { const v = speakingOf(a); return examScore(v, 100) && v >= 80 }
/** No result filled in yet: booked, or taken and waiting for the scores. */
export function waiting(a: CertAttempt) {
  if (gept(a.exam)) return (takesLr(a) && !a.lr) || (takesW(a) && writingOf(a) === undefined) || (takesS(a) && speakingOf(a) === undefined)
  if (a.exam === 'ielts') return !a.band
  return a.passed === undefined
}
/** Two years on from a test day (the 全民英檢 window for the second stage and for taking failed parts again). */
export const twoYearsOn = (day: string) => String(Number(day.slice(0, 4)) + 2) + (day.endsWith('-02-29') ? '-02-28' : day.slice(4))
function registeredInTime(a: CertAttempt, from: string, until: string) {
  const registered = a.registeredOn ?? a.date
  return validExamDay(registered) && a.date >= registered && registered >= from && registered <= until
}
/**
 * Whether 全民英檢 sittings of one level add up to passing it, and when (LTTC 報名須知 2027 初級 p.6、中級 p.13 and
 * 一日考問與答): a passed 聽讀 lets 說寫 be booked within two years of that 聽讀 test day; 說寫 is taken together the first
 * time and afterwards only the failed one (只考寫作／只考口說); a one-day test (all four in a day) never joins results
 * passed before it, and its failed parts can be taken again within two years of it (failed 聽讀 first, at a 聽讀 test).
 * The certificate itself never expires: a level passed stays passed.
 */
export function geptPassed(attempts: readonly CertAttempt[], today = dayKey()): { on?: string; until?: string; lr: boolean; w: boolean; s: boolean } {
  let best: string | undefined
  let open: { until: string; lr: boolean; w: boolean; s: boolean } | undefined
  const sorted = attempts.filter(a => gept(a.exam) && validExamDay(a.date) && a.date <= today && !legacyElementary(a) && !waiting(a))
    .sort((a, b) => a.date.localeCompare(b.date))
  for (const anchor of sorted.filter(a => partsOf(a) === 'both' || (partsOf(a) === 'lr' && lrPass(a.lr)))) {
    const until = twoYearsOn(anchor.date)
    const oneDay = partsOf(anchor) === 'both'
    const sameLevel = sorted.filter(a => a.exam === anchor.exam)
    // A failed 一日考 can reuse only later results. Recovering 聽讀 keeps the original deadline for this path.
    const lrOn = lrPass(anchor.lr) ? anchor.date : sameLevel.find(a => partsOf(a) === 'lr' && lrPass(a.lr)
      && registeredInTime(a, anchor.date, until))?.date
    let wOn = oneDay && writingPass(anchor) ? anchor.date : undefined
    let sOn = oneDay && speakingPass(anchor) ? anchor.date : undefined
    if (lrOn) for (const a of sameLevel) {
      const parts = partsOf(a)
      if (a === anchor || !registeredInTime(a, lrOn, until)) continue
      if ((parts === 'sw' || (parts === 'w' && sOn && sOn <= (a.registeredOn ?? a.date))) && writingPass(a)) wOn ??= a.date
      if ((parts === 'sw' || (parts === 's' && wOn && wOn <= (a.registeredOn ?? a.date))) && speakingPass(a)) sOn ??= a.date
    }
    if (lrOn && wOn && sOn) {
      const on = [lrOn, wOn, sOn].sort().at(-1)!
      if (!best || on < best) best = on
    } else if (lrOn || wOn || sOn) {
      // Show the strongest active partial route. If all have expired, show the most recent deadline.
      const nextActive = until >= today
      const previousActive = !!open && open.until >= today
      const coverage = Number(!!lrOn) + Number(!!wOn) + Number(!!sOn)
      const oldCoverage = open ? Number(open.lr) + Number(open.w) + Number(open.s) : 0
      if (!open || nextActive && !previousActive || (nextActive === previousActive &&
          (nextActive && coverage !== oldCoverage ? coverage > oldCoverage : until > open.until))) {
        open = { until, lr: !!lrOn, w: !!wOn, s: !!sOn }
      }
    }
  }
  if (best) return { on: best, lr: true, w: true, s: true }
  return { until: open?.until, lr: open?.lr ?? false, w: open?.w ?? false, s: open?.s ?? false }
}
/** Whether one sitting (with the others before it, for GEPT halves) reached `to`. */
function attemptPasses(a: CertAttempt, to: LevelId, today: string) {
  const step = stepTo(to)
  if (!step?.exams.includes(a.exam) || !validExamDay(a.date) || a.date > today) return false
  if (a.exam === 'ielts') return !!a.band && ieltsBandCheck(a.band).valid && a.band.overall >= (step.ielts ?? 99)
  if (a.exam === 'other') return a.passed === true && !!a.otherLevel && levelIndex(a.otherLevel) >= levelIndex(to)
  if (a.exam === 'gept-c1') return a.passed === true
  return false
}

export type CertState = 'passed' | 'waiting' | 'partial' | 'failed' | 'none'
/** lr / w / s: the partial results of a GEPT path; until: the last day to register for missing parts. */
export interface CertStatus { state: CertState; passedOn?: string; next?: CertAttempt; lr?: boolean; sw?: boolean; w?: boolean; s?: boolean; until?: string; attempts: CertAttempt[] }
export function certStatus(notes: Record<string, string>, to: LevelId, today = dayKey()): CertStatus {
  const attempts = readAttempts(notes, to)
  const geptExam = steps.find(s => s.to === to)?.exams.find(gept)
  const mine = attempts.filter(a => a.exam === geptExam && !waiting(a))
  const g = geptPassed(mine, today)
  let passedOn = g.on
  for (const a of attempts) if (attemptPasses(a, to, today) && (!passedOn || a.date < passedOn)) passedOn = a.date
  const next = attempts.find(a => stepTo(to)?.exams.includes(a.exam) && waiting(a) && validExamDay(a.date) && !legacyElementary(a) &&
    (a.exam !== 'other' || !!a.otherLevel && levelIndex(a.otherLevel) >= levelIndex(to)))
  if (passedOn) return { state: 'passed', passedOn, attempts }
  // What is passed and can still be joined (a 聽讀 with its two years, what a one-day test passed); `until` says how long.
  const parts = { lr: g.lr, sw: g.w && g.s, w: g.w, s: g.s, ...(g.until ? { until: g.until } : {}) }
  if (next) return { state: 'waiting', next, attempts, ...parts }
  if (g.lr || g.w || g.s) return { state: 'partial', attempts, ...parts }
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
export function visaScreen(notes: Record<string, string>, today = dayKey()) {
  const all = levelIds.flatMap(l => readAttempts(notes, l)).filter(a => a.exam === 'ielts' && validExamDay(a.date) && a.date <= today && a.band &&
    ieltsBandCheck(a.band).valid && a.band.overall >= 6.5 && (a.band.speaking ?? 0) >= 7)
  const last = all.sort((a, b) => b.date.localeCompare(a.date))[0]
  // Two calendar years on (a 29 February result ends on 28 February).
  return last ? { date: last.date, until: twoYearsOn(last.date) } : null
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
