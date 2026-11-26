/** Nursing English for the internship and licensing-exam months (and any day he wants it): listening dialogues with
 *  a transcript, reading passages in the reading format, and a nursing word list drilled like the 7000 words. */
import { bestListen, type Accent, type ListenRecord, type PackLine, type PackQuestion } from './bridge'
import { levelTarget, openSteps } from './unlock'

export type NurseLevel = 'A2' | 'B1' | 'B2'
/** `you` is the role he practises when he acts the scene out with Emma; Emma plays `emma`. */
export interface NurseListening {
  id: string; title: string; scene: string; level: NurseLevel; accent: Accent
  you: string; emma: string; dialogue: PackLine[]; questions: PackQuestion[]; words: { en: string; zh: string }[]
}
export interface NurseWord { en: string; zh: string; area: string; ex: string; exZh: string }

export const nurseListenKey = (id: string) => 'nurse.listen.' + id
export const nurseSpeakKey = (id: string) => 'nurse.speak.' + id
/** The dialogue heard most recently ({ id, title, you, day }), so the day's list can offer to act it out. */
export const nurseLastKey = 'nurse.last'
/** How many nursing words had a drill passed on a day. */
export const nurseWordsKey = (day: string) => 'nurse.words.' + day
export interface LastHeard { id: string; title: string; you: string; day: string }
export function readLastHeard(notes: Record<string, string>): LastHeard | null {
  try {
    const r = notes[nurseLastKey] ? JSON.parse(notes[nurseLastKey]) as LastHeard : null
    return r && typeof r.id === 'string' && typeof r.title === 'string' ? r : null
  } catch { return null }
}

export function readNurseListen(notes: Record<string, string>, id: string): ListenRecord | null {
  try { return notes[nurseListenKey(id)] ? JSON.parse(notes[nurseListenKey(id)]) as ListenRecord : null } catch { return null }
}
/** Understood by ear: every answer right after a complete play, without the text (on the best attempt so far). */
export const heardWell = (r: ListenRecord | null) => { const b = bestListen(r); return !!b && b.heard && b.correct === b.total }

/** Listened to without the text and at least 70% right: what counts toward finishing a level. The best attempt counts,
 *  so a redo done after reading the transcript does not lock a level that was already open. */
export const listenPassed = (r: ListenRecord | null) => { const b = bestListen(r); return !!b && b.heard && b.correct / Math.max(1, b.total) >= 0.7 }
export const nurseLevels = ['A2', 'B1', 'B2'] as const
/** Which levels of nursing listening are open: B1 once A2 has its target of passed dialogues (levelTarget), B2 after B1. */
export function nurseLevelsOpen(list: readonly { id: string; level: string }[], notes: Record<string, string>): Record<string, boolean> {
  const open = openSteps(nurseLevels.map(lv => {
    const here = list.filter(l => l.level === lv)
    return here.filter(l => listenPassed(readNurseListen(notes, l.id))).length >= levelTarget(here.length)
  }))
  return Object.fromEntries(nurseLevels.map((lv, i) => [lv, open[i]]))
}
/** Never heard first (in order), then ones not yet understood by ear (oldest first), then the rest (oldest first). */
export function nextNurseListening(list: readonly NurseListening[], notes: Record<string, string>, skip: readonly string[] = []) {
  const pool = list.filter(l => !skip.includes(l.id))
  const fresh = pool.find(l => !readNurseListen(notes, l.id))
  if (fresh) return fresh
  const byDay = (a: NurseListening, b: NurseListening) => readNurseListen(notes, a.id)!.day.localeCompare(readNurseListen(notes, b.id)!.day)
  return pool.filter(l => !heardWell(readNurseListen(notes, l.id))).sort(byDay)[0] ?? [...pool].sort(byDay)[0] ?? null
}

/** The last dialogue he listened to (for "act it out with Emma"), or null. */
export function lastNurseListening(list: readonly NurseListening[], notes: Record<string, string>) {
  return [...list].filter(l => readNurseListen(notes, l.id)).sort((a, b) => readNurseListen(notes, b.id)!.day.localeCompare(readNurseListen(notes, a.id)!.day))[0] ?? null
}

/** A nursing day has three slots: review, listen-or-read, and one more that takes turns day by day,
 *  so a few weeks cover word drills, speaking and nursing questions alike. */
export type NurseSlot = 'words' | 'speak' | 'quiz'
const slots: NurseSlot[] = ['words', 'speak', 'quiz']
export function nurseSlot(day: string): NurseSlot {
  const days = Math.round(Date.parse(day + 'T12:00:00Z') / 86_400_000)
  return slots[((days % 3) + 3) % 3]
}

/** Counts a nursing word passed in a drill today. */
export const countNurseWord = (notes: Record<string, string>, day: string) =>
  ({ ...notes, [nurseWordsKey(day)]: String((Number(notes[nurseWordsKey(day)]) || 0) + 1) })
export const nurseWordsOn = (notes: Record<string, string>, day: string) => Number(notes[nurseWordsKey(day)]) || 0

/** What Emma is told when he acts out a dialogue: she plays the other person, he plays the nurse (or the student). */
export function nurseInstructions(l: NurseListening) {
  return [
    'Today you are helping him practise English for his clinical work with a short role-play, inside a friendly chat.',
    `Scene: ${l.title}. In Chinese: ${l.scene}.`,
    `You play ${l.emma}. He plays ${l.you}. Stay in your role until the end.`,
    `Here is the dialogue he listened to, as a guide only (do not read it to him, and let the scene go a little differently): ${l.dialogue.map(d => d.who + ': ' + d.en).join(' / ')}`,
    `Useful words for him: ${l.words.map(w => w.en).join(', ')}.`,
    `Start the scene yourself with one line as ${l.emma}. Keep your lines short and natural, and ask one thing at a time so he has to answer, explain or check.`,
    'If he says something unsafe for a patient or the meaning is wrong, step out of the role for one sentence, say the safer or clearer version, and ask him to say it again.',
    'You hear him through speech recognition, so do not comment on his pronunciation.',
    'After about eight of his turns, end the scene and tell him in two sentences what he did well and one useful sentence to remember.',
  ].join('\n')
}
