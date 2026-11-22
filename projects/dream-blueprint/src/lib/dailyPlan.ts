import { activePeriod, daysBetween, type Energy, type Period, type PeriodRange } from './progress'

/** One source for how long today is: the home page choices, today's list, the to-do line and the calendar all
 *  read it, so they cannot show different minutes. */

/** Chinese New Year, and the two days the supplied winter calendar leaves free. */
export const holidayBreak = (day: string) => day >= '2027-02-05' && day <= '2027-02-10'
export const calendarGaps: ReadonlySet<string> = new Set(['2027-01-17', '2027-02-13'])

/** A vacation day grows from 20 minutes (2027 winter) to 60 (after the 2029 licensing exam), as in the schedule.
 *  Vacations have a lesson six days a week, so a day can be shorter than a 30-minute semester day. */
export function holidayMinutes(day: string) {
  if (day >= '2029-08-01') return 60
  if (day >= '2028-01-01') return 40
  if (day >= '2027-07-01') return 30
  return 20
}

/** A long exam period (four weeks or more) is the licensing-exam sprint: 10–15 minutes a day, not 2. */
export function longExam(day: string, ranges: readonly PeriodRange[]) {
  const r = ranges.find(x => x.type === 'exam' && x.start <= day && (!x.end || x.end >= day))
  return !!r && (!r.end || daysBetween(r.start, r.end) >= 27)
}

export type DayKind = 'regular' | 'light' | 'rest' | 'holiday' | 'exam' | 'sprint' | 'internship'
export interface DayBudget {
  day: string
  weekday: number
  period: Period
  kind: DayKind
  /** Exams and internship: no new lessons; 普通 is a 10–15 minute nursing-English plan. */
  quiet: boolean
  defaultEnergy: Energy
  /** Minutes for each choice (the nursing plan counts as 15); null when that choice is off today. */
  minutes: Record<Energy, number | null>
  labels: Record<Energy, string>
  /** No lesson is planned today, so the 2 minutes are a choice, not a task. */
  optional: boolean
  /** The English line for today's to-do list. */
  english: string
}
interface DaySettings { periods: readonly PeriodRange[]; regularDays: readonly number[]; restDays: readonly number[] }

export const NURSING_LABEL = '10–15 分鐘'
const quietKinds: readonly DayKind[] = ['exam', 'sprint', 'internship']

export function dayKind(day: string, settings: DaySettings): DayKind {
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay()
  const period = activePeriod(day, settings.periods)
  if (period === 'exam') return longExam(day, settings.periods) ? 'sprint' : 'exam'
  if (period === 'internship') return 'internship'
  if (holidayBreak(day)) return 'rest'
  if (period === 'vacation') return weekday === 0 || calendarGaps.has(day) ? 'rest' : 'holiday'
  if (settings.regularDays.includes(weekday)) return 'regular'
  return settings.restDays.includes(weekday) ? 'rest' : 'light'
}

export function dayBudget(day: string, settings: DaySettings): DayBudget {
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay()
  const period = activePeriod(day, settings.periods)
  const kind = dayKind(day, settings)
  const quiet = quietKinds.includes(kind)
  const base = period === 'vacation' ? holidayMinutes(day) : 30
  const minutes: Record<Energy, number | null> = quiet ? { low: 2, normal: 15, high: null } : { low: 2, normal: base, high: base + 15 }
  const labels: Record<Energy, string> = quiet ? { low: '2 分鐘', normal: NURSING_LABEL, high: '先不用' }
    : { low: '2 分鐘', normal: base + ' 分鐘', high: base + 15 + ' 分鐘' }
  const defaultEnergy: Energy = kind === 'exam' || kind === 'rest' || kind === 'light' ? 'low' : 'normal'
  const english = {
    exam: '考試優先。想動一下英文就選 10–15 分鐘護理英文；不然複習 2 分鐘或休息，都是選做。',
    sprint: '國考衝刺：10–15 分鐘護理英文，跟國考讀到的科目同步；太忙的日子複習 2 分鐘。',
    internship: '護理英文 10–15 分鐘：複習、幾題護理英文、用英文說一件實習的事；太忙就複習 2 分鐘。',
    holiday: '放假練習 ' + base + ' 分鐘：複習＋今天這一堂' + (base > 30 ? '＋加練' : '') + '。',
    regular: '一般日 30 分鐘：複習卡＋今天這一堂。',
    rest: (holidayBreak(day) ? '過年休息。' : '今天休息。') + '想動一下的話複習 2 分鐘（選做）。',
    light: '今天沒排課。想動一下就複習 2 分鐘（選做），不然休息。',
  }[kind]
  return { day, weekday, period, kind, quiet, defaultEnergy, minutes, labels, optional: defaultEnergy === 'low', english }
}

/** How a regular plan of `total` minutes splits: review, the lesson, extra practice and the wrap-up add up to the
 *  total shown. A focus for today takes its minutes out of review, keeping two minutes of review. */
export function splitMinutes(total: number, focusWanted = 0) {
  const full = total >= 30
  const lesson = full ? 20 : Math.max(10, total - 5)
  const wrap = full ? 2 : 0
  const baseReview = full ? 8 : Math.max(2, total - lesson)
  const extra = Math.max(0, total - lesson - wrap - baseReview)
  const focus = Math.max(0, Math.min(focusWanted, baseReview - 2))
  return { focus, review: baseReview - focus, lesson, extra, wrap }
}

/** The calendar line for an exam or internship day. */
export function quietLabel(kind: DayKind) {
  return kind === 'exam' ? '考週 · 2 分鐘舊句複習或休息（選做）'
    : kind === 'sprint' ? '國考衝刺 · 10–15 分鐘護理英文，忙的日子 2 分鐘'
    : '實習 · 10–15 分鐘護理英文，忙的日子 2 分鐘'
}
