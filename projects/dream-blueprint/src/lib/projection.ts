import schedule from '../data/curriculumSchedule.json' with { type: 'json' }
import topicData from '../data/topics.json' with { type: 'json' }
import { activePeriod, addDays, daysBetween, type Energy, type Period, type PeriodRange } from './progress.ts'
import { busyMinutes, calendarGaps, holidayBreak, longExam, quietLabel } from './dailyPlan.ts'
import { exams, stepEndingAt, stepOfUnit, steps } from './cefr.ts'

/** The plan has one source. `planDays()` walks the course from `schedule.start` (the first lesson) with the same rules as the live calendar:
 *  one main lesson a day on the default days (life topics take turns with grammar), the default exam, vacation, internship
 *  and licensing-exam periods, and every certificate booked as soon as its level's units are done. The month plan
 *  (plan.json), the year plan and the calendar's 原課表安排 all follow this walk; tests/plan.test.ts checks them. */

const weekday = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay()
/** The user's own default periods cover the first winter; from this day on, tentative months in the schedule fill the gaps. */
const forecastFrom = '2027-02-21'
/** The last day the plan page can show. */
export const planEnd = '2034-12-31'
const limit = schedule.preparedThroughUnit * schedule.daysPerUnit
const label = (unit: number, day: number) => `單元 ${unit} 第 ${day} 天`
/** After the last written unit: the lessons are done, the plan goes on with words, the four skills and certificates. */
export const courseDoneLabel = schedule.preparedThroughUnit + ' 個單元都上完了 · 照月計畫背單字、練讀聽說寫和準備證照'

interface Session { day: string; energy: Energy; advanced?: boolean; sentenceId?: string }
type Part = 'A' | 'B' | 'C'
/** Life topics as the calendar needs them: when each unlocks, which parts are done, and a part left open. */
export interface TopicPlan { n: number; title: string; after: number; done: Partial<Record<Part, string>>; open?: Part }
const partLabel: Record<Part, string> = { A: '理解', B: '說和寫', C: '換情境複習' }
interface CalendarInput {
  today: string
  from: string
  to: string
  cursor: number
  sessions: readonly Session[]
  ranges: readonly PeriodRange[]
  weekdays?: readonly number[]
  restDays?: readonly number[]
  startedDay?: string
  retry?: boolean
  /** Life topics take turns with grammar lessons (one main lesson a day; C at least 3 days after B). */
  topics?: readonly TopicPlan[]
  /** A unit that waits for a certificate (the level before it is neither passed nor booked). The lessons stop there only
   *  once the learner has reached it; a gate still ahead is assumed booked on time, as in the plan. */
  lockedUnit?: number | null
}
export interface ProjectedDay {
  day: string
  kind: 'lesson' | 'review' | 'rest' | 'future'
  unit: number | null
  lessonDay: number | null
  label: string
  period: string
  original: string
  /** A life-topic session instead of a grammar lesson: the topic number and part. */
  topic?: { n: number; part: Part }
  /** This lesson finishes a level's units: time to book its certificate (or, for B2, to plan when). */
  gate?: string
}
export type PlannedDay = Omit<ProjectedDay, 'original'>

// Count eligible days only. A period of rest has no weight in the next term's forecast.
function recentPace(input: CalendarInput, weekdays: readonly number[]) {
  const practiced = new Set(input.sessions.filter(s => s.advanced ?? s.energy !== 'low').map(s => s.day))
  // Count from the first lesson actually done: days after opening the app but before the course began are not
  // missed lessons (they made the calendar show two review days after every lesson for a learner on day 2).
  const first = [...practiced].sort()[0]
  if (!first) return 1
  const start = input.startedDay && input.startedDay > first ? input.startedDay : first
  if (daysBetween(start, input.today) < 7) return 1
  const earliest = addDays(input.today,-28)
  let eligible = 0
  let completed = 0
  for (let day = start > earliest ? start : earliest; day < input.today; day = addDays(day,1)) {
    const period = activePeriod(day,input.ranges)
    if (period === 'exam' || period === 'internship' || holidayBreak(day)) continue
    if ((period === 'vacation' ? weekday(day) !== 0 : weekdays.includes(weekday(day)))) eligible++
    if (practiced.has(day)) completed++
  }
  // Keep a single opportunity in the forecast even after four quiet weeks.
  return eligible ? Math.min(1, Math.max(1, completed) / eligible) : 1
}

/** The day-by-day walk shared by the plan and the live calendar. Days before `today` are left for the caller to label. */
function walk(input: CalendarInput): PlannedDay[] {
  const weekdays = input.weekdays ?? schedule.regularDays
  const restDays = input.restDays ?? schedule.restDays
  const pace = recentPace(input,weekdays)
  const advanced = new Set(input.sessions.filter(s => s.advanced ?? s.energy !== 'low').map(s => s.day))
  let cursor = Math.max(0, Math.min(limit, Math.trunc(input.cursor)))
  // Waiting at the gate now (or a failed result after the unit began): review until the certificate is booked.
  const stuck = !!input.lockedUnit && Math.floor(cursor / schedule.daysPerUnit) + 1 >= input.lockedUnit
  let credit = 1 - pace
  const topics = (input.topics ?? []).map(t => ({ ...t, done: { ...t.done } }))
  const lastMain = input.sessions.filter(s => s.day < input.today && s.energy !== 'low').at(-1)
  let topicTurn = !lastMain?.sentenceId?.startsWith('topic:')
  /** The same rule as the daily lesson: an open part first, then the next part of the first unlocked topic that is ready. */
  function topicFor(day: string): { t: typeof topics[number]; part: Part } | null {
    const open = topics.find(t => t.open && !t.done[t.open])
    if (open) return { t: open, part: open.open! }
    if (!topicTurn) return null
    const unit = Math.floor(cursor / schedule.daysPerUnit) + 1
    for (const t of topics) {
      if (unit <= t.after) break
      const part: Part | null = !t.done.A ? 'A' : !t.done.B ? 'B' : !t.done.C ? 'C' : null
      if (!part) continue
      if (part === 'A' || (part === 'B' && t.done.A! < day) || (part === 'C' && daysBetween(t.done.B!, day) >= 3)) return { t, part }
    }
    return null
  }
  const result: PlannedDay[] = []
  const start = input.from < input.today ? input.from : input.today
  for (let day = start; day <= input.to; day = addDays(day,1)) {
    const explicitPeriod = input.ranges.some(r => r.start <= day && (!r.end || r.end >= day))
    const forecast = !explicitPeriod && day >= forecastFrom
      ? schedule.periods.find(r => r.tentative && r.start <= day && r.end >= day) : undefined
    const period = forecast ? forecast.type as Period : activePeriod(day, input.ranges)
    const item: PlannedDay = { day, period, kind:'rest', unit:null, lessonDay:null, label:'休息日' }
    if (day < input.today) {
      // Labelled by the caller from the plan.
    } else if (period === 'exam' || period === 'internship') {
      item.kind = 'review'
      const maintenance = schedule.periods.find(p =>
        p.start >= '2028-02-01' && !p.tentative && p.type === period && p.start <= day && day <= p.end)
      const kind = period === 'internship' ? 'internship' : longExam(day, forecast ? [forecast as PeriodRange] : input.ranges) ? 'sprint' : 'exam'
      item.label = maintenance
        ? maintenance.label + ' · 忙的日子 ' + busyMinutes(kind) + ' 分鐘'
        : quietLabel(kind)
    } else if (holidayBreak(day)) {
      item.label = '過年休息'
    } else if (advanced.has(day)) {
      item.label = '今天已完成課表練習'
    } else {
      const dow = weekday(day)
      let regular = period === 'vacation' ? dow !== 0 : weekdays.includes(dow)
      // The supplied calendar resumes on February 15 after the February 12 lesson.
      if (period === 'vacation' && calendarGaps.has(day)) regular = false
      if (regular) {
        credit += pace
        if (credit >= 1 - 1e-8) {
          credit = Math.max(0, credit - 1)
          const topic = topicFor(day)
          if (topic) {
            topic.t.done[topic.part] = day
            if (topic.t.open === topic.part) topic.t.open = undefined
            topicTurn = false
            item.kind = 'lesson'
            item.topic = { n: topic.t.n, part: topic.part }
            item.label = '生活主題 ' + topic.t.n + '：' + topic.t.title + ' · 第 ' + ('ABC'.indexOf(topic.part) + 1) + ' 次（' + partLabel[topic.part] + '）'
          } else if (cursor < limit && stuck) {
            // Also mid-unit: a result that fails after the unit has begun turns the lessons into review (DBP-010).
            // The next level's lessons open once the certificate before it is booked.
            const before = steps[steps.indexOf(stepOfUnit(input.lockedUnit!)) - 1]
            item.kind = 'review'
            item.label = '升級關卡：報名' + exams[before.exams[0]].name + '，填上考試日期就接著上單元 ' + (Math.floor(cursor / schedule.daysPerUnit) + 1)
          } else if (cursor < limit) {
            topicTurn = true
            item.kind = 'lesson'
            item.unit = Math.floor(cursor / schedule.daysPerUnit) + 1
            item.lessonDay = cursor % schedule.daysPerUnit + 1
            item.label = label(item.unit, item.lessonDay)
            if (input.retry && item.unit === Math.floor(input.cursor / schedule.daysPerUnit) + 1) item.label += ' · 換句再練'
            const ending = item.lessonDay === schedule.daysPerUnit ? stepEndingAt(item.unit) : null
            if (ending) {
              item.gate = ending.to
              const exam = exams[ending.exams[0]].name
              item.label += ' · ' + ending.from + '→' + ending.to + ' 上完，' + (ending.bookWhen ? exam + ending.bookWhen : '報名' + exam)
            }
            cursor++
          } else {
            item.kind = 'future'
            item.label = courseDoneLabel
          }
        } else {
          item.kind = 'review'
          item.label = '照最近的上課節奏預估 · 複習或休息（想上課就直接上下一堂）'
        }
      } else if (!restDays.includes(dow) && period !== 'vacation') {
        item.kind = 'review'
        item.label = '複習 15 分鐘或休息（選做）'
      }
    }
    if (forecast && day >= input.today) item.label += '（月份暫排）'
    // Far ahead the same rules keep going, but the dates are a sketch until the plan is redone.
    else if (day >= '2029-01-01' && day >= input.today && item.kind !== 'rest') item.label += '（暫排，重排計畫時會更新）'
    if (day >= input.from) result.push(item)
  }
  return result
}

const planRanges: PeriodRange[] = schedule.periods.map(p => ({ type: p.type as Period, start: p.start, end: p.end }))
let plan: { days: PlannedDay[]; byDay: Map<string, PlannedDay> } | null = null
/** The whole plan, day by day: every lesson done on its day, life topics in turn, every certificate booked on time. */
export function planDays(): readonly PlannedDay[] {
  if (!plan) {
    const days = walk({
      today: schedule.start, from: schedule.start, to: planEnd, cursor: 0, sessions: [], ranges: planRanges,
      topics: topicData.map(t => ({ n: t.n, title: t.title, after: t.after, done: {} })), lockedUnit: null,
    })
    plan = { days, byDay: new Map(days.map(d => [d.day, d])) }
  }
  return plan.days
}
/** What the plan has on a day (the calendar's 原課表安排); empty outside the plan. */
export function originalPlan(day: string): string {
  planDays()
  return plan!.byDay.get(day)?.label ?? ''
}

export function projectCalendar(input: CalendarInput): ProjectedDay[] {
  return walk(input).map(d => {
    const original = originalPlan(d.day)
    return { ...d, original, label: d.day < input.today ? (original ? '原訂 · ' + original : '') : d.label }
  })
}
