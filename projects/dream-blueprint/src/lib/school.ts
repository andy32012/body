import initial from '../data/school.json'

export interface SchoolClass { id: string; weekday: number; start: string; end: string; label: string }
export interface SchoolEvent { id: string; day: string; label: string; kind: string }
export interface SchoolRequirement { id: string; group: string; label: string; done: boolean }
export interface SchoolData extends Omit<typeof initial, 'classes' | 'events' | 'requirements'> {
  classes: SchoolClass[]
  events: SchoolEvent[]
  requirements: SchoolRequirement[]
}
export const defaultSchool: SchoolData = initial as SchoolData
export const weekdays = ['日', '一', '二', '三', '四', '五', '六']
export const makeSchoolId = () => 'school-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2))

export function schoolToday(school: SchoolData, day: string) {
  const weekday = new Date(day + 'T12:00:00').getDay()
  const lessons = school.classes.filter(c => c.weekday === weekday)
    .sort((a, b) => a.start.localeCompare(b.start))
  const slot = school.study.find(s => s.weekday === weekday)
  const classes = lessons.map(c => [c.start, c.label].filter(Boolean).join(' ')).join('、') ||
    (school.classes.length ? '今日未排課程' : '課表時段待填')
  const study = slot?.minutes ? [slot.time, '英文 ' + slot.minutes + ' 分鐘'].filter(Boolean).join(' ') : '英文休息日'
  const events = school.events.filter(e => e.day === day).map(e => e.label)
  return { classes, study, events, summary: [classes, study, ...events].join(' · ') }
}
