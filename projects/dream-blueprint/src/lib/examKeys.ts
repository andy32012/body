import { firstOfDay, isDatedGrade, mergeDailyGrades } from './firstDailyGrade'

/** Answer keys corrected after they were published (94 學測 第 49–56 題, checked against the passage and the official
 *  key). Kept apart from examReading.ts so the app's start-up (importBackup) can rescore saved picks without loading
 *  anything else. Each id's key is the whole set of answers, in question order. */
export const correctedKeys: Record<string, number[]> = { 'ex-gsat-94-3': [0, 3, 1, 0], 'ex-gsat-94-4': [1, 2, 3, 2] }

export interface ExamAttempt { day: string; correct: number; total: number; picks?: number[]; at?: number }
export interface ExamRecord extends ExamAttempt {
  picks: number[]; tries: number; best?: ExamAttempt; practice?: boolean; firstByDay?: ExamAttempt[]; priorBest?: ExamAttempt
}
export const examRatio = (a: ExamAttempt) => a.correct / Math.max(1, a.total)

/** A legacy formal score can serve as the best. Practice without a formal score cannot qualify on its own. */
export function bestExamAttempt(record: ExamRecord): ExamAttempt | undefined {
  if (record.best) return record.best
  if (record.practice) return undefined
  const { day, correct, total, picks, at } = record
  return { day, correct, total, picks, at }
}

export const examGrade = ({ day, correct, total, picks, at }: ExamAttempt): ExamAttempt => ({ day, correct, total, picks, at })
export const firstExamGrades = (record: ExamRecord) => Array.isArray(record.firstByDay)
  ? record.firstByDay.filter(isDatedGrade) : record.practice ? [] : [examGrade(record)]
export const priorExamGrade = (record: ExamRecord) => {
  if (record.firstByDay) return record.priorBest
  return record.practice || record.best?.day !== record.day ? record.best : undefined
}
function betterExamGrade(a: ExamAttempt | undefined, b: ExamAttempt | undefined) {
  return !!a && (!b || examRatio(a) > examRatio(b) || (examRatio(a) === examRatio(b) && !!a.picks && !b.picks))
}
export const bestExamFrom = (grades: readonly ExamAttempt[], prior?: ExamAttempt) =>
  grades.reduce<ExamAttempt | undefined>((best, grade) => betterExamGrade(grade, best) ? grade : best, prior)
export function mergeExamRecords(a: ExamRecord, b: ExamRecord): ExamRecord {
  const firstByDay = mergeDailyGrades(firstExamGrades(a), firstExamGrades(b))
  const olderBest = priorExamGrade(a)
  const newerBest = priorExamGrade(b)
  const priorBest = betterExamGrade(olderBest, newerBest) ? olderBest : newerBest
  const latest = a.day > b.day ? a : b.day > a.day ? b
    : !!a.practice !== !!b.practice ? a.practice ? b : a
    : firstOfDay(a, b)
  return { ...latest, firstByDay, priorBest, best: bestExamFrom(firstByDay, priorBest), tries: Math.max(a.tries ?? 0, b.tries ?? 0) }
}
export const hasExamSubmission = (record: ExamRecord | null, day: string) =>
  !!record && (record.day === day || firstExamGrades(record).some(grade => grade.day === day))

/** Score the latest submission and the formal best independently. Old practice never provides the best's answers. */
export function rescoreExams(notes: Record<string, string>, keys: Record<string, number[]> = correctedKeys) {
  let out = notes
  for (const [id, key] of Object.entries(keys)) {
    const name = 'exam.read.' + id
    let r: ExamRecord | null = null
    try { r = out[name] ? JSON.parse(out[name]) : null } catch { r = null }
    if (!r || typeof r.day !== 'string') continue
    const score = (attempt: ExamAttempt): ExamAttempt => {
      const picks = attempt.picks
      return Array.isArray(picks) && picks.length === key.length
        ? { ...attempt, correct: key.filter((answer, i) => picks[i] === answer).length, total: key.length }
        : attempt
    }
    const now = score(r)
    if (Array.isArray(r.firstByDay)) {
      const firstByDay = firstExamGrades(r).map(score)
      const priorBest = r.priorBest && score(r.priorBest)
      out = { ...out, [name]: JSON.stringify({ ...r, correct: now.correct, total: now.total,
        firstByDay, priorBest, best: bestExamFrom(firstByDay, priorBest) }) }
      continue
    }
    let best = bestExamAttempt(r)
    if (best && !best.picks && !r.practice && best.at === r.at && best.day === r.day && best.correct === r.correct && best.total === r.total) {
      // In the old format only the first (formal) submission of a day can supply these answers.
      best = { ...best, picks: r.picks }
    }
    if (best) best = score(best)
    if (!r.practice && (!best || examRatio(now) > examRatio(best))) {
      const { day, correct, total, picks, at } = now
      best = { day, correct, total, picks, at }
    }
    out = { ...out, [name]: JSON.stringify({ ...r, correct: now.correct, total: now.total, best }) }
  }
  return out
}
