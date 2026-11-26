import data from '../data/gept-sessions.json'
import type { ExamId } from './cefr'

/** 全民英檢's published public sessions (LTTC 官網測驗日期): when each part is tested, when registration opens and closes,
 *  and when results come out. Reminders follow these dates, not the course's own milestones, so a reminder never comes
 *  after registration has closed. Dates later than the published list are not guessed. */
export interface GeptSession { exam: ExamId; part: string; test: string[]; register: [string, string]; results: string }
export const geptSessions = data.sessions as GeptSession[]
export const sessionsSource = data.source

/** 9/14 from 2027-09-14. */
const md = (day: string) => Number(day.slice(5, 7)) + '/' + Number(day.slice(8, 10))
const tested = (s: GeptSession) => s.test.map(md).join('–')

/** Sessions of an exam he can still register for on `day` (registration not closed yet), earliest deadline first. */
export function openSessions(exam: ExamId, day: string): GeptSession[] {
  return geptSessions.filter(s => s.exam === exam && s.register[1] >= day).sort((a, b) => a.register[1].localeCompare(b.register[1]))
}

/** One line for the plan and the calendar: the next session still open (test date, registration deadline, results), or —
 *  when every published session has closed — which one closed last and that the next year's dates are not out yet. */
export function bookingNote(exam: ExamId, day: string): string {
  const open = openSessions(exam, day)
  if (open.length) {
    const s = open[0]
    const opens = s.register[0] > day ? md(s.register[0]) + ' 開始、' : ''
    return '最近還能報名的是 ' + s.test[0].slice(0, 4) + ' 年 ' + tested(s) + ' ' + s.part + '（' + opens + md(s.register[1]) + ' 截止報名，' + md(s.results) + ' 放榜）'
  }
  // The last listening-reading and speaking-writing sessions that closed (聽讀 comes first, so it is named first).
  const lastOf = (part: string) => geptSessions.filter(s => s.exam === exam && s.part === part).sort((a, b) => b.register[1].localeCompare(a.register[1]))[0]
  const closed = ['聽讀', '說寫'].map(lastOf).filter((s): s is GeptSession => !!s)
  return closed.length ? '已公布的場次報名都截止了（最後一場' + closed.map(s => s.part + ' ' + tested(s) + ' 在 ' + md(s.register[1]) + ' 截止').join('、') + '），報下一年第一場，日期公布後看官網'
    : '報名前看官網的測驗日期'
}
