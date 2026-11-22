/** B1→B2 bridge units (stage BR): each one has a skills pack — word chunks, two readings, a listening, two writing
 *  tasks, two speaking tasks — and a held-out test (an unseen reading and listening) that can be taken once.
 *  The packs themselves live in data/bridge.json, loaded when the pack is opened. */
import curriculum from '../data/curriculum.json'
import { weekKey } from './progress'

export type Accent = 'en-US' | 'en-GB' | 'en-AU'
export const accentNames: Record<Accent, string> = { 'en-US': '美式', 'en-GB': '英式', 'en-AU': '澳洲' }
export interface PackLine { who: string; en: string; zh: string }
export interface PackQuestion { q: string; options: string[]; answer: number }
export interface PackListening { title: string; scene: string; accent: Accent; dialogue: PackLine[]; questions: PackQuestion[] }
export interface PackTask { title: string; zh: string; en: string }
export interface Pack {
  unit: number; code: string; focus: string
  chunks: { en: string; zh: string; ex: string }[]
  reading: string[]; heldReading: string
  listen: PackListening[]; heldListen: PackListening
  write: string[]; speak: PackTask[]
}

/** Units that come with a pack, in order. */
export const packUnits: number[] = curriculum.overview.filter(o => o.stage === 'BR').map(o => o.unit)
export const hasPack = (unit: number) => packUnits.includes(unit)
/** The pack to show for where the course stands: this unit's, else the next one ahead, else the last one. */
export const packFor = (unit: number) => hasPack(unit) ? unit : packUnits.find(u => u > unit) ?? packUnits[packUnits.length - 1]
export const unitTitle = (unit: number) => curriculum.units.find(u => u.id === unit)?.title ?? ''
export const unitRule = (unit: number) => curriculum.units.find(u => u.id === unit)?.rule ?? ''

// ── Held-out test: one attempt per part, opened on the unit's last day (its checkpoint) or once it is finished.
export const heldKey = (unit: number) => 'bridge.held.' + unit
export interface HeldPart { day: string; correct: number; total: number; picks: number[]; heard?: boolean }
export interface HeldRecord { reading?: HeldPart; listening?: HeldPart }
export function readHeld(notes: Record<string, string>, unit: number): HeldRecord {
  try { return notes[heldKey(unit)] ? JSON.parse(notes[heldKey(unit)]) as HeldRecord : {} } catch { return {} }
}
/** Keeps the first attempt: a part that is already recorded is never replaced. */
export function saveHeld(notes: Record<string, string>, unit: number, part: keyof HeldRecord, rec: HeldPart) {
  const old = readHeld(notes, unit)
  if (old[part]) return notes
  return { ...notes, [heldKey(unit)]: JSON.stringify({ ...old, [part]: rec }) }
}
export const heldOpen = (cur: { unit: number; day: number }, unit: number) => cur.unit > unit || (cur.unit === unit && cur.day >= 6)

// ── Pack listening and speaking records.
export const listenKey = (unit: number, i: number) => 'bridge.listen.' + unit + '.' + i
export interface ListenRecord { day: string; correct: number; total: number; heard: boolean; plays: number }
export function readListen(notes: Record<string, string>, unit: number, i: number): ListenRecord | null {
  try { return notes[listenKey(unit, i)] ? JSON.parse(notes[listenKey(unit, i)]) as ListenRecord : null } catch { return null }
}
export const speakKey = (unit: number, i: number) => 'bridge.speak.' + unit + '.' + i

// ── Which skills were practised on which days, so the "listen or read" and "speak or write" slots can be balanced over a week.
export type Skill = 'listen' | 'read' | 'speak' | 'write'
export const skillLogKey = 'skills.log'
type SkillLog = Partial<Record<Skill, string[]>>
function readLog(notes: Record<string, string>): SkillLog {
  try { return notes[skillLogKey] ? JSON.parse(notes[skillLogKey]) as SkillLog : {} } catch { return {} }
}
/** Marks a skill as practised on a day; keeps the last 60 days per skill. */
export function logSkill(notes: Record<string, string>, skill: Skill, day: string) {
  const log = readLog(notes)
  const days = log[skill] ?? []
  if (days.includes(day)) return notes
  return { ...notes, [skillLogKey]: JSON.stringify({ ...log, [skill]: [...days, day].sort().slice(-60) }) }
}
const recordDays = (notes: Record<string, string>, prefix: string) => Object.entries(notes).filter(([k]) => k.startsWith(prefix)).flatMap(([, v]) => {
  try { const r = JSON.parse(v) as { day?: unknown; best?: { day?: unknown } }; return [r.day, r.best?.day].filter((d): d is string => typeof d === 'string') } catch { return [] }
})
/** Days each skill was practised: the log, plus saved reading and writing records and sentence shadowing in the library. */
export function skillDays(notes: Record<string, string>, sessions: readonly { day: string; spokenIds?: string[] }[] = []): Record<Skill, Set<string>> {
  const log = readLog(notes)
  return {
    listen: new Set([...(log.listen ?? []), ...sessions.filter(s => s.spokenIds?.length).map(s => s.day)]),
    read: new Set([...(log.read ?? []), ...recordDays(notes, 'read.')]),
    speak: new Set(log.speak ?? []),
    write: new Set([...(log.write ?? []), ...recordDays(notes, 'write.')]),
  }
}
/** How many days this week (Monday to today) each skill was practised. */
export function weekCounts(notes: Record<string, string>, sessions: readonly { day: string; spokenIds?: string[] }[], today: string): Record<Skill, number> {
  const from = weekKey(today), days = skillDays(notes, sessions)
  const inWeek = (s: Set<string>) => [...s].filter(d => d >= from && d <= today).length
  return { listen: inWeek(days.listen), read: inWeek(days.read), speak: inWeek(days.speak), write: inWeek(days.write) }
}
export const practisedOn = (notes: Record<string, string>, sessions: readonly { day: string; spokenIds?: string[] }[], skill: Skill, day: string) =>
  skillDays(notes, sessions)[skill].has(day)

/** What Emma is told for a pack speaking task. */
export function packInstructions(pack: Pack, i: number) {
  const task = pack.speak[i]
  return [
    `Today you are also helping him with a speaking task from his English course, inside a friendly chat (still be his friend, not a teacher).`,
    `Unit ${pack.unit}: "${unitTitle(pack.unit)}". Grammar focus (in Chinese): ${pack.focus}. Rule (in Chinese): ${unitRule(pack.unit)}`,
    `Task: ${task.en}`,
    `Useful phrases from his unit: ${pack.chunks.slice(0, 10).map(c => c.en.replace(/^[,\s]+/, '')).join(' / ')}.`,
    'Start the task yourself in one or two sentences. Ask one question at a time, and let him talk in longer turns.',
    'When a mistake breaks the grammar focus or changes the meaning, say the correct sentence once and ask him to say it again. Other small mistakes: just recast them naturally.',
    'You hear him through speech recognition, so do not comment on his pronunciation.',
    'After about eight of his turns, wrap up in one or two sentences: what he did well with the grammar focus and one sentence to remember.',
  ].join('\n')
}
