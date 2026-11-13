import schedule from '../data/curriculumSchedule.json' with { type: 'json' }
import { activePeriod, addDays, daysBetween, type Energy, type Period, type PeriodRange } from './progress.ts'

const initial = new Map(schedule.initialDays.map(entry => [entry.day, entry]))
const weekday = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay()
const initialBounds = { from: '2026-11-13', to: '2027-02-20' }
const limit = schedule.preparedThroughUnit * schedule.daysPerUnit
const label = (unit: number, day: number) => `單元 ${unit} 第 ${day} 天`
const holidayBreak = (day: string) => day >= '2027-02-05' && day <= '2027-02-10'

export function originalPlan(day: string): string {
  const planned = initial.get(day)
  if (planned) return label(planned.unit, planned.lessonDay)
  if (holidayBreak(day)) return '過年休息，想練時複習 2 分鐘'
  if (day >= initialBounds.from && day <= initialBounds.to) {
    if ((day <= '2026-11-23') || (day >= '2027-01-03' && day <= '2027-01-16')) {
      return '考週，複習 2 分鐘或休息'
    }
    return '休息或複習 2 分鐘'
  }
  const month = day.slice(0,7)
  const segment = [...schedule.monthly, ...schedule.longRange].find(s => s.from <= month && month <= s.to)
  if (!segment) return '開學時重排'
  return [segment.units.length ? '單元 ' + segment.units.join('、') : '', segment.goal].filter(Boolean).join(' · ')
}

interface Session { day: string; energy: Energy; advanced?: boolean }
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
}
export interface ProjectedDay {
  day: string
  kind: 'lesson' | 'review' | 'rest' | 'future'
  unit: number | null
  lessonDay: number | null
  label: string
  period: string
  original: string
}

// Count eligible days only. A period of rest has no weight in the next term's forecast.
function recentPace(input: CalendarInput, weekdays: readonly number[]) {
  const practiced = new Set(input.sessions.filter(s => s.advanced ?? s.energy !== 'low').map(s => s.day))
  const start = input.startedDay ?? input.sessions.reduce((first, s) => s.day < first ? s.day : first, input.today)
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

export function projectCalendar(input: CalendarInput): ProjectedDay[] {
  const weekdays = input.weekdays ?? schedule.terms.semester.weekdays
  const restDays = input.restDays ?? [0,5]
  const pace = recentPace(input,weekdays)
  const advanced = new Set(input.sessions.filter(s => s.advanced ?? s.energy !== 'low').map(s => s.day))
  let cursor = Math.max(0, Math.min(limit, Math.trunc(input.cursor)))
  let credit = 1 - pace
  const result: ProjectedDay[] = []
  const start = input.from < input.today ? input.from : input.today
  for (let day = start; day <= input.to; day = addDays(day,1)) {
    const explicitPeriod = input.ranges.some(r => r.start <= day && (!r.end || r.end >= day))
    const forecast = !explicitPeriod && day > initialBounds.to
      ? schedule.periods.find(r => r.tentative && r.start <= day && r.end >= day) : undefined
    const period = forecast ? forecast.type as Period : activePeriod(day, input.ranges)
    const original = originalPlan(day)
    const item: ProjectedDay = { day, original, period, kind:'rest', unit:null, lessonDay:null, label:'休息日' }
    if (day < input.today) {
      item.label = '原訂 · ' + original
    } else if (period === 'exam' || period === 'internship') {
      item.kind = 'review'
      const maintenance = schedule.periods.find(p =>
        p.start >= '2028-02-01' && !p.tentative && p.type === period && p.start <= day && day <= p.end)
      item.label = maintenance
        ? maintenance.label + ' · 舊句複習或休息'
        : period === 'exam' ? '考週 · 2 分鐘舊句複習或休息' : '實習 · 2 分鐘舊句聽說或休息'
    } else if (holidayBreak(day)) {
      item.label = '過年休息'
    } else if (advanced.has(day)) {
      item.label = '今天已完成課表練習'
    } else {
      const dow = weekday(day)
      let regular = period === 'vacation' ? dow !== 0 : weekdays.includes(dow)
      // The supplied calendar resumes on February 15 after the February 12 lesson.
      if (period === 'vacation' && (day === '2027-02-13' || day === '2027-01-17')) regular = false
      if (regular && day >= '2029-01-01') {
        item.kind = 'future'
        item.label = '重排計畫時安排 · ' + original
      } else if (regular) {
        credit += pace
        if (credit >= 1 - 1e-8) {
          credit = Math.max(0, credit - 1)
          if (cursor < limit) {
            item.kind = 'lesson'
            item.unit = Math.floor(cursor / schedule.daysPerUnit) + 1
            item.lessonDay = cursor % schedule.daysPerUnit + 1
            item.label = label(item.unit, item.lessonDay)
            if (input.retry && item.unit === Math.floor(input.cursor / schedule.daysPerUnit) + 1) item.label += ' · 換句再練'
            cursor++
          } else {
            item.kind = 'future'
            item.label = '複習已學單元 · 後續教材待加入'
          }
        } else {
          item.kind = 'review'
          item.label = '跟著近期節奏 · 複習或休息'
        }
      } else if (!restDays.includes(dow) && period !== 'vacation') {
        item.kind = 'review'
        item.label = '複習 2 分鐘或休息'
      }
    }
    if (forecast && day >= input.today) item.label += '（月份暫排）'
    if (day >= input.from) result.push(item)
  }
  return result
}
