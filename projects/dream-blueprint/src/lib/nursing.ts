/** Nursing English for the internship and licensing-exam months (and any day he wants it): listening dialogues with
 *  a transcript, reading passages in the reading format, and a nursing word list drilled like the 7000 words. */
import { bestListen, betterListen, withBestListen, type Accent, type ListenAttempt, type ListenRecord, type PackLine, type PackQuestion } from './bridge'
import { levelTarget, openSteps } from './unlock'

export type NurseLevel = 'A2' | 'B1' | 'B2'
/** `you` is the role he practises when he acts the scene out with Emma; Emma plays `emma`. */
export interface NurseListening {
  id: string; title: string; scene: string; level: NurseLevel; accent: Accent
  you: string; emma: string; dialogue: PackLine[]; questions: PackQuestion[]; words: { en: string; zh: string }[]
  handoff?: { colleague: string; baseline: string; examples: string[] }
}
export interface NurseWord { en: string; zh: string; area: string; ex: string; exZh: string }

export const nurseListenKey = (id: string) => 'nurse.listen.' + id
export const nursePreviewKey = (id: string) => 'nurse.listen-preview.' + id
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
/** Understood by ear the first time: every answer right after a complete play, without seeing the text. */
export const heardWell = (r: ListenRecord | null) => { const b = bestListen(r); return !!b && b.heard && b.correct === b.total }

const passedByEar = (a?: ListenAttempt | null) => !!a?.heard && a.total > 0 && a.correct / a.total >= 0.7
export const nurseReviewPassed = (r: ListenRecord | null) => passedByEar(r?.reviewBest)
/** Either a first listen or a no-text re-listen can finish a dialogue, with separate evidence for each. */
export const listenPassed = (r: ListenRecord | null) => passedByEar(bestListen(r)) || nurseReviewPassed(r)

/** Preserve the first-listen evidence when a saved dialogue is practised again. */
export function saveNurseListen(notes: Record<string, string>, id: string, rec: ListenRecord, byEar: boolean): ListenRecord {
  const old = readNurseListen(notes, id)
  const heard = rec.heard && byEar && !old && !notes[nursePreviewKey(id)]
  const saved = withBestListen(old, { ...rec, heard })
  const review: ListenAttempt = { day: rec.day, correct: rec.correct, total: rec.total, heard: byEar }
  const reviewBest = !heard && byEar && betterListen(review, old?.reviewBest) ? review : old?.reviewBest
  return { ...saved, reviewBest }
}
export const nurseLevels = ['A2', 'B1', 'B2'] as const
/** Which levels of nursing listening are open: B1 once A2 has its target of passed dialogues (levelTarget), B2 after B1. */
export function nurseLevelsOpen(list: readonly { id: string; level: string }[], notes: Record<string, string>): Record<string, boolean> {
  const open = openSteps(nurseLevels.map(lv => {
    const here = list.filter(l => l.level === lv)
    return here.filter(l => listenPassed(readNurseListen(notes, l.id))).length >= levelTarget(here.length)
  }))
  return Object.fromEntries(nurseLevels.map((lv, i) => [lv, open[i]]))
}
/** Never attempted first, then incomplete dialogues (oldest first), then the rest (oldest first). */
export function nextNurseListening(list: readonly NurseListening[], notes: Record<string, string>, skip: readonly string[] = []) {
  const pool = list.filter(l => !skip.includes(l.id))
  const fresh = pool.find(l => !readNurseListen(notes, l.id))
  if (fresh) return fresh
  const byDay = (a: NurseListening, b: NurseListening) => readNurseListen(notes, a.id)!.day.localeCompare(readNurseListen(notes, b.id)!.day)
  return pool.filter(l => !listenPassed(readNurseListen(notes, l.id))).sort(byDay)[0] ?? [...pool].sort(byDay)[0] ?? null
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

/** Nursing work done on a day, for the nursing checklist: a general passage or pronunciation lesson is practice too, but
 *  it does not tick 護理英文：聽或讀 or 口說：演一段. */
export function nurseListenedOn(notes: Record<string, string>, day: string) {
  return Object.keys(notes).some(k => k.startsWith('nurse.listen.') && readNurseListen(notes, k.slice(13))?.day === day)
}
export function nurseReadOn(notes: Record<string, string>, day: string) {
  return Object.entries(notes).some(([k, v]) => {
    if (!k.startsWith('read.n-')) return false
    try { return (JSON.parse(v) as { day?: string }).day === day } catch { return false }
  })
}
export const nurseSpokeOn = (notes: Record<string, string>, day: string) =>
  Object.entries(notes).some(([k, v]) => k.startsWith('nurse.speak.') && v === day)

/** The nursing words passed in a drill today, each once however often it is done again (a list of words; a plain
 *  number is how it was counted before, and that day keeps counting the old way). */
export function countNurseWord(notes: Record<string, string>, day: string, word?: string) {
  const key = nurseWordsKey(day), v = notes[key]
  if (!word || (v !== undefined && /^\d+$/.test(v))) return { ...notes, [key]: String((Number(v) || 0) + 1) }
  const list = passedWords(v)
  return list.includes(word) ? notes : { ...notes, [key]: JSON.stringify([...list, word]) }
}
function passedWords(v: string | undefined): string[] {
  try { const list = JSON.parse(v ?? '[]') as unknown; return Array.isArray(list) ? list.filter((w): w is string => typeof w === 'string') : [] } catch { return [] }
}
export const nurseWordsOn = (notes: Record<string, string>, day: string) => {
  const v = notes[nurseWordsKey(day)]
  return v !== undefined && /^\d+$/.test(v) ? Number(v) : passedWords(v).length
}

/** What Emma is told when he acts out a dialogue: she plays the other person, he plays the nurse (or the student). */
export function nurseInstructions(l: NurseListening) {
  return [
    'Today you are helping him practise English for his clinical work with a short role-play, inside a friendly chat.',
    `Scene: ${l.title}. In Chinese: ${l.scene}.`,
    l.handoff
      ? `He plays ${l.you} throughout. Start as ${l.emma}. Once he has oriented the patient and asked when the change began, announce a handoff and switch to ${l.handoff.colleague}. Stay in the colleague role for the rest of the scene.`
      : `You play ${l.emma}. He plays ${l.you}. Stay in your role until the end.`,
    ...(l.handoff ? [
      `In the handoff, let him ask whether the confusion is new and when it began. Share this when asked: ${l.handoff.baseline}`,
      `Ask him to report what has changed, what he plans to check, and who he will notify. If he needs help, use these prompts and let him answer in his own words: ${l.handoff.examples.join(' / ')}`,
    ] : []),
    `Here is the dialogue he listened to, as a guide only (do not read it to him, and let the scene go a little differently): ${l.dialogue.map(d => d.who + ': ' + d.en).join(' / ')}`,
    `Useful words for him: ${l.words.map(w => w.en).join(', ')}.`,
    `Start the scene yourself with one line as ${l.emma}. Keep your lines short and natural, and ask one thing at a time so he has to answer, explain or check.`,
    'If he says something unsafe for a patient or the meaning is wrong, step out of the role for one sentence, say the safer or clearer version, and ask him to say it again.',
    'You hear him through speech recognition, so do not comment on his pronunciation.',
    l.handoff
      ? 'Aim for about eight of his turns and finish after both parts. Give a brief prompt if he misses a step. End with two sentences on what he did well and one useful sentence to remember.'
      : 'After about eight of his turns, end the scene and tell him in two sentences what he did well and one useful sentence to remember.',
  ].join('\n')
}
