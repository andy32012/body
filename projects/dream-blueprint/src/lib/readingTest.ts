import { passed, readRecord, type ReadExtra, type ReadPassage, type ReadStep } from './reading'
import { examPassed, readExamRecord, type ExamPassage } from './examReading'

/** 閱讀測驗: the graded reading with the past-exam passages put into the same levels and bands (A1 into A1, B1 into B1).
 *  Each kind keeps its own records (read.<id>, exam.read.<id>); here they are read side by side. */
export type TestKind = 'graded' | 'exam'
export interface TestPick { kind: TestKind; id: string }

const atStep = (p: ReadStep, s: ReadStep) => p.level === s.level && p.band === s.band

/** The past-exam passages as extra passages of their bands: read once = recorded, 70% or better = passed. */
export function examExtras(exams: readonly ExamPassage[], notes: Record<string, string>): ReadExtra[] {
  return exams.map(p => {
    const r = readExamRecord(notes, p.id)
    return { id: p.id, level: p.level, band: p.band, recorded: !!r, passed: examPassed(r), ...(r ? { day: r.day } : {}) }
  })
}

/** The next passage of a band. Unread first, the two kinds taking turns (graded first, then whichever has been read less);
 *  then one not passed yet, the one read longest ago first; then the first passage, to read again. `skip`: passed over
 *  this round. Null only when the whole band is skipped. */
export function nextInBand(graded: readonly ReadPassage[], exams: readonly ExamPassage[], step: ReadStep, notes: Record<string, string>, skip: readonly string[] = []): TestPick | null {
  const g = graded.filter(p => atStep(p, step))
  const e = exams.filter(p => atStep(p, step))
  const gDay = (id: string) => readRecord(notes, id)?.day
  const eDay = (id: string) => readExamRecord(notes, id)?.day
  const open = (id: string) => !skip.includes(id)
  const freshG = g.filter(p => open(p.id) && !gDay(p.id))
  const freshE = e.filter(p => open(p.id) && !eDay(p.id))
  if (freshG.length || freshE.length) {
    const readG = g.filter(p => gDay(p.id)).length
    const readE = e.filter(p => eDay(p.id)).length
    const takeGraded = freshG.length > 0 && (readG <= readE || !freshE.length)
    return takeGraded ? { kind: 'graded', id: freshG[0].id } : { kind: 'exam', id: freshE[0].id }
  }
  const waiting: (TestPick & { day: string })[] = [
    ...g.filter(p => open(p.id) && !passed(readRecord(notes, p.id))).map(p => ({ kind: 'graded' as const, id: p.id, day: gDay(p.id)! })),
    ...e.filter(p => open(p.id) && !examPassed(readExamRecord(notes, p.id))).map(p => ({ kind: 'exam' as const, id: p.id, day: eDay(p.id)! })),
  ]
  // A stable sort keeps the graded passage first when two were read on the same day.
  const oldest = waiting.sort((a, b) => a.day.localeCompare(b.day))[0]
  if (oldest) return { kind: oldest.kind, id: oldest.id }
  const againG = g.find(p => open(p.id))
  if (againG) return { kind: 'graded', id: againG.id }
  const againE = e.find(p => open(p.id))
  return againE ? { kind: 'exam', id: againE.id } : null
}
