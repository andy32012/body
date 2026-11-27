import { activePeriod, daysBetween, type Energy, type Period, type PeriodRange } from './progress'

/** One source for how long today is: the home page choices, today's list, the to-do line and the calendar all
 *  read it, so they cannot show different minutes.
 *
 *  The plan (2026-11): 1.5 hours a day Monday to Saturday, 3–4 hours a day in the winter vacation, 20–30 minutes of
 *  nursing English during the internship and 15 during the licensing-exam sprint. Grammar stays one lesson a day even
 *  in winter — the certificate at the end of each level is what limits the pace, so the extra hours go to listening,
 *  reading, speaking, writing and preparing for that certificate. */

/** Chinese New Year, and the two days the supplied winter calendar leaves free. */
export const holidayBreak = (day: string) => day >= '2027-02-05' && day <= '2027-02-10'
export const calendarGaps: ReadonlySet<string> = new Set(['2027-01-17', '2027-02-13'])

/** A long exam period (four weeks or more) is the licensing-exam sprint, not a school exam week. */
export function longExam(day: string, ranges: readonly PeriodRange[]) {
  const r = ranges.find(x => x.type === 'exam' && x.start <= day && (!x.end || x.end >= day))
  return !!r && (!r.end || daysBetween(r.start, r.end) >= 27)
}
/** A vacation day in December to February is the winter vacation. */
const winterMonth = (day: string) => ['12', '01', '02'].includes(day.slice(5, 7))

export type DayKind = 'regular' | 'light' | 'rest' | 'holiday' | 'winter' | 'exam' | 'sprint' | 'internship'
export interface DayBudget {
  day: string
  weekday: number
  period: Period
  kind: DayKind
  /** Exams and internship: no new lessons; 普通 is a short nursing-English plan. */
  quiet: boolean
  defaultEnergy: Energy
  /** Minutes for each choice; null when that choice is off today. */
  minutes: Record<Energy, number | null>
  labels: Record<Energy, string>
  /** No lesson is planned today, so the short choice is optional, not a task. */
  optional: boolean
  /** The English line for today's to-do list. */
  english: string
}
interface DaySettings { periods: readonly PeriodRange[]; regularDays: readonly number[]; restDays: readonly number[] }

const quietKinds: readonly DayKind[] = ['exam', 'sprint', 'internship']

export function dayKind(day: string, settings: DaySettings): DayKind {
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay()
  const period = activePeriod(day, settings.periods)
  if (period === 'exam') return longExam(day, settings.periods) ? 'sprint' : 'exam'
  if (period === 'internship') return 'internship'
  if (holidayBreak(day)) return 'rest'
  if (period === 'vacation') return weekday === 0 || calendarGaps.has(day) ? 'rest' : winterMonth(day) ? 'winter' : 'holiday'
  if (settings.regularDays.includes(weekday)) return 'regular'
  return settings.restDays.includes(weekday) ? 'rest' : 'light'
}

const fmt = (m: number | null) => m === null ? '先不用' : m >= 60 && m % 30 === 0 ? m / 60 + ' 小時' : m + ' 分鐘'
export function dayBudget(day: string, settings: DaySettings): DayBudget {
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay()
  const period = activePeriod(day, settings.periods)
  const kind = dayKind(day, settings)
  const quiet = quietKinds.includes(kind)
  const winter = period === 'vacation' && winterMonth(day)
  const minutes: Record<Energy, number | null> =
    kind === 'internship' ? { low: 10, normal: 30, high: null }
    : kind === 'sprint' ? { low: 5, normal: 15, high: null }
    : kind === 'exam' ? { low: 15, normal: 30, high: null }
    : winter ? { low: 30, normal: 180, high: 240 }
    : { low: 15, normal: 90, high: 120 }
  const labels: Record<Energy, string> = { low: fmt(minutes.low), normal: kind === 'internship' ? '20–30 分鐘' : fmt(minutes.normal), high: fmt(minutes.high) }
  const defaultEnergy: Energy = kind === 'exam' || kind === 'rest' || kind === 'light' ? 'low' : 'normal'
  const english = {
    regular: '一般日 1.5 小時：複習、今天這一堂、單字、聽或讀、說或寫。',
    holiday: '放假 1.5 小時：複習、今天這一堂、單字、聽或讀、說或寫（暑假可能有實習，先排 1.5 小時）。',
    winter: '寒假 3 小時：一堂課，加上大量聽讀說寫和證照準備；有電就 4 小時。',
    rest: (holidayBreak(day) ? '過年休息。' : '今天休息。') + '想動一下的話 ' + fmt(minutes.low) + '複習（選做）。',
    light: '今天沒排課。想動一下就 ' + fmt(minutes.low) + '複習（選做），不然休息。',
    exam: '考試優先。想動一下就 15 分鐘複習，或 30 分鐘護理英文（複習、聽或讀一段、再輪流練單字／口說／護理題），都是選做。',
    internship: '護理英文 20–30 分鐘：複習，聽或讀一段護理英文（有聽力稿），再輪流練護理單字、跟 Emma 演一段或護理題；太忙就 10 分鐘複習。',
    sprint: '國考衝刺：15 分鐘護理英文，複習加一段聽或讀，再輪流練單字、口說或護理題；太忙就 5 分鐘複習。',
  }[kind]
  return { day, weekday, period, kind, quiet, defaultEnergy, minutes, labels, optional: defaultEnergy === 'low', english }
}

/** The pieces of a day, in order. Their minutes add up to the total shown; a focus for today comes out of review. */
export type BlockId = 'focus' | 'review' | 'lesson' | 'words' | 'input' | 'output' | 'listen' | 'read' | 'write' | 'speak' | 'cert' | 'extra'
export interface Block { id: BlockId; min: number }
/** The lesson writes three sentences with its pattern (today's and two variations) and its own open task, so it takes 30
 *  minutes; 說或寫 gives it 5, since the lesson itself is writing. */
const dayOf: Block[] = [{ id: 'review', min: 15 }, { id: 'lesson', min: 30 }, { id: 'words', min: 10 }, { id: 'input', min: 20 }, { id: 'output', min: 15 }]
const winterOf: Block[] = [{ id: 'review', min: 20 }, { id: 'lesson', min: 30 }, { id: 'words', min: 20 }, { id: 'listen', min: 25 }, { id: 'read', min: 25 },
  { id: 'write', min: 20 }, { id: 'speak', min: 20 }, { id: 'cert', min: 20 }]
/** On a full day, review grows up to 10 minutes past its block when today's cards need it (word cards plus a few
 *  sentences). The time comes from the extra block, then 今日單字 (down to 5 minutes), then 說或寫 (down to 10),
 *  so the day keeps its length. */
const donors: readonly [BlockId, number][] = [['extra', 0], ['words', 5], ['output', 10]]
export function planBlocks(total: number, focusWanted = 0, reviewNeed = 0): Block[] {
  if (total <= 30) {
    const words = total >= 30 ? 10 : total >= 15 ? 5 : 0
    return [{ id: 'review', min: total - words }, ...(words ? [{ id: 'words' as const, min: words }] : [])]
  }
  const base = total >= 180 ? winterOf : total >= 90 ? dayOf
    // A shorter day keeps the same pieces, scaled down.
    : dayOf.map(b => ({ ...b, min: Math.max(5, Math.round(b.min * total / 90 / 5) * 5) }))
  const used = base.reduce((n, b) => n + b.min, 0)
  const blocks = base.map(b => ({ ...b }))
  if (total > used) blocks.push({ id: 'extra', min: total - used })
  else if (total < used) blocks[0].min -= used - total
  const review = blocks[0]
  const focus = Math.max(0, Math.min(focusWanted, review.min - 5))
  if (focus) { review.min -= focus; blocks.unshift({ id: 'focus', min: focus }) }
  let grow = total >= 90 ? Math.min(Math.ceil(reviewNeed / 5) * 5 - review.min, 10) : 0
  for (const [id, floor] of donors) {
    const b = blocks.find(x => x.id === id)
    const take = b ? Math.min(grow, b.min - floor) : 0
    if (b && take > 0) { b.min -= take; review.min += take; grow -= take }
  }
  return blocks.filter(b => b.id !== 'extra' || b.min > 0)
}

/** The calendar line for an exam or internship day. */
export function quietLabel(kind: DayKind) {
  return kind === 'exam' ? '考週 · 15 分鐘複習或休息（選做）'
    : kind === 'sprint' ? '國考衝刺 · 15 分鐘護理英文，忙的日子 5 分鐘'
    : '實習 · 20–30 分鐘護理英文，忙的日子 10 分鐘'
}
/** What a busy day shrinks to in a planned maintenance period. */
export const busyMinutes = (kind: DayKind) => kind === 'sprint' ? 5 : kind === 'internship' ? 10 : 15

type TaskMark = { done: boolean; at: number }
const nextEditTime = (previous: number) => Math.max(Date.now(), previous + 1)
export const goalMarkKey = (id: string) => 'plan.checked.' + id
export const isPlanMarkKey = (key: string) => key.startsWith('plan.checked.') || /^plan\.\d{4}-\d{2}-\d{2}\.[^.]+$/.test(key)

export function readTaskMark(raw: string | undefined): TaskMark | undefined {
  if (raw === '1' || raw === '0') return { done: raw === '1', at: 0 }
  if (!raw) return undefined
  try {
    const mark: Partial<TaskMark> | null = JSON.parse(raw)
    if (mark && typeof mark.done === 'boolean' && typeof mark.at === 'number' && Number.isSafeInteger(mark.at) && mark.at > 0)
      return { done: mark.done, at: mark.at }
  } catch { /* Revert to the automatic check when a saved mark cannot be read. */ }
  return undefined
}

export function mergeTaskMark(older: string, newer: string): string {
  const first = readTaskMark(older), second = readTaskMark(newer)
  if (!first) return newer
  if (!second || first.at > second.at) return older
  if (second.at > first.at) return newer
  // Identical timestamps can come from simultaneous edits on different devices.
  return first.done ? newer : older
}

export function writeTaskMark(raw: string | undefined, done: boolean): string {
  return JSON.stringify({ done, at: nextEditTime(readTaskMark(raw)?.at ?? 0) })
}

type GoalMove = { destination: string; at: number }
function readGoalMove(raw: string | undefined): GoalMove {
  if (raw?.startsWith('{')) {
    try {
      const move: Partial<GoalMove> | null = JSON.parse(raw)
      if (move && typeof move.destination === 'string' && typeof move.at === 'number' && Number.isSafeInteger(move.at) && move.at > 0)
        return { destination: move.destination, at: move.at }
    } catch { /* A saved move may be an older destination string. */ }
  }
  return { destination: raw ?? '', at: 0 }
}

export const goalMoveKey = (id: string) => 'move.' + id
export const goalDestination = (raw: string | undefined) => readGoalMove(raw).destination
export const writeGoalMove = (raw: string | undefined, destination: string) =>
  JSON.stringify({ destination, at: nextEditTime(readGoalMove(raw).at) })

export function mergeGoalMove(older: string, newer: string): string {
  const first = readGoalMove(older), second = readGoalMove(newer)
  if (first.at !== second.at) return first.at > second.at ? older : newer
  // Keep legacy merge behavior when neither copy recorded the move time.
  if (!first.at) return newer
  return first.destination > second.destination ? older : newer
}
