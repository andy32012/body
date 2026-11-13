export type Energy = 'low' | 'normal' | 'high'
export type Period = 'semester' | 'exam' | 'internship' | 'vacation'
export type Feedback = 'right' | 'much' | 'more'
export interface PeriodRange {
  type: Period
  start: string
  end: string
}

// Compare the local wall clock, including on a daylight-saving transition.
export function dayKey(now = new Date()): string {
  const d = new Date(now)
  if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

const DAY = 86400000
const midnight = (d: string) => Date.parse(d + 'T00:00:00Z')
export const addDays = (day: string, n: number) =>
  new Date(midnight(day) + n * DAY).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) =>
  (midnight(b) - midnight(a)) / DAY
export function weekKey(day = dayKey()) {
  return addDays(day, -((new Date(midnight(day)).getUTCDay() + 6) % 7))
}
export function activePeriod(
  day: string,
  ranges: readonly PeriodRange[],
): Period {
  const current = ranges.filter(
    (r) => r.start <= day && (!r.end || r.end >= day),
  )
  const priority: Period[] = ['exam', 'internship', 'vacation']
  return (
    priority.find((type) => current.some((r) => r.type === type)) ?? 'semester'
  )
}

export interface ReviewCard {
  id: string
  box: 1 | 2 | 3 | 4 | 5
  lastDay: string
  due: string
  mastered: boolean
}
export interface ReviewEvent {
  id: string
  day: string
  gap: number
  remembered: boolean
  shownAnswer: boolean
}
export function newCard(id: string, day: string): ReviewCard {
  return { id, box: 1, lastDay: day, due: addDays(day, 1), mastered: false }
}
const intervals = [1, 2, 4, 8, 16]
export function reviewCard(
  card: ReviewCard,
  day: string,
  remembered: boolean,
  shownAnswer = false,
): { card: ReviewCard; event: ReviewEvent | null } {
  if (day <= card.lastDay || day < card.due) return { card, event: null }
  const recalled = remembered && !shownAnswer
  const box = (recalled ? Math.min(card.box + 1, 5) : 1) as ReviewCard['box']
  return {
    card: {
      ...card,
      box,
      lastDay: day,
      due: addDays(day, intervals[box - 1]),
      mastered: card.mastered || (card.box === 5 && recalled),
    },
    event: {
      id: card.id,
      day,
      gap: daysBetween(card.lastDay, day),
      remembered,
      shownAnswer,
    },
  }
}
export function dueCards<T extends ReviewCard>(
  cards: readonly T[],
  day: string,
  energy: Energy,
): T[] {
  const limit = { low: 1, normal: 5, high: 10 }[energy]
  return cards
    .filter((c) => c.due <= day && c.lastDay < day)
    .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id))
    .slice(0, limit)
}
export interface WorkSession {
  day: string
  energy: Energy
  feedback?: Feedback | null
}
interface WorkloadInput {
  day: string
  startedDay: string
  lastAssessment?: string
  lastReduction?: string
  period: Period
  sessions: readonly WorkSession[]
  events: readonly ReviewEvent[]
}
export function workloadDecision(
  input: WorkloadInput,
): 'offer' | 'reduce' | 'keep' {
  const {
    day,
    startedDay,
    lastAssessment,
    lastReduction,
    period,
    sessions,
    events,
  } = input
  if (period === 'exam' || period === 'internship') return 'keep'
  const age = daysBetween(startedDay, day)
  const recent = sessions.filter(
    (s) => s.day <= day && daysBetween(s.day, day) < 14,
  )
  const demanding = recent.filter((s) => s.energy !== 'low')
  const countDays = (rows: readonly WorkSession[]) =>
    new Set(rows.map((r) => r.day)).size
  const latestWeek = (s: WorkSession) => daysBetween(s.day, day) < 7
  const tooMuch = recent.filter((s) => s.feedback === 'much')
  const renewed = tooMuch.filter(
    (s) => latestWeek(s) && (!lastReduction || s.day > lastReduction),
  )
  const sparse =
    age >= 14 &&
    countDays(demanding.filter(latestWeek)) < 2 &&
    countDays(demanding.filter((s) => !latestWeek(s))) < 2
  const sinceReduction = lastReduction
    ? daysBetween(lastReduction, day)
    : Infinity
  if (
    (countDays(renewed) >= 2 && sinceReduction >= 7) ||
    (sparse && sinceReduction >= 14)
  )
    return 'reduce'
  if (
    age < 14 ||
    (lastAssessment && daysBetween(lastAssessment, day) < 14) ||
    tooMuch.length ||
    countDays(demanding) < 4
  )
    return 'keep'
  const seen = new Set<string>()
  const eligible = events.filter((e) => {
    if (
      e.gap < 4 ||
      e.shownAnswer ||
      e.day > day ||
      daysBetween(e.day, day) >= 14
    )
      return false
    const key = e.day + '/' + e.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return eligible.length &&
    eligible.filter((e) => e.remembered).length / eligible.length >= 0.7
    ? 'offer'
    : 'keep'
}
export function practiceDays(
  sessions: readonly Pick<WorkSession, 'day'>[],
): number {
  return new Set(sessions.map((s) => s.day)).size
}
export function reviewBonus(
  events: readonly ReviewEvent[],
  day: string,
): number {
  const valid = events.filter(
    (e) => e.day === day && e.gap >= 4 && e.remembered && !e.shownAnswer,
  )
  return Math.min(10, 2 * new Set(valid.map((e) => e.id)).size)
}
export function attendance(
  sessions: readonly Pick<WorkSession, 'day'>[],
  today: string,
  restDays: readonly number[],
  ranges: readonly PeriodRange[],
) {
  const practiced = new Set(
    sessions.map((s) => s.day).filter((d) => d <= today),
  )
  let streak = 0,
    leave = 0,
    cumulative = 0
  const start = [...practiced].sort()[0]
  if (!start) return { streak, leave, cumulative }
  for (let day = start; day <= today; day = addDays(day, 1)) {
    if (practiced.has(day)) {
      streak++
      cumulative++
      if (cumulative % 7 === 0) leave = Math.min(2, leave + 1)
      continue
    }
    const period = activePeriod(day, ranges)
    if (
      day === today ||
      restDays.includes(new Date(midnight(day)).getUTCDay()) ||
      period === 'exam' ||
      period === 'internship'
    )
      continue
    if (leave > 0) leave--
    else streak = 0
  }
  return { streak, leave, cumulative }
}
