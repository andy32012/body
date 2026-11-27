import { selectLessonRecord } from './lesson'
import { readSayCard } from './sayCards'
import { lessonSentence, units } from './todayLesson'

export interface EmmaLesson { unit: number; day: number; title: string; rule: string; cando: string; sentence: string; words: string[]; mistakes: string[] }

/** The lesson Emma should help with: the one finished or started today, else where the curriculum stands. */
export function emmaLesson(state: { notes: Record<string, string>; curriculum: { unit: number; day: number } }, target: string): EmmaLesson | null {
  const rec = selectLessonRecord(state.notes, target)?.rec
  const unitId = rec?.unit ?? state.curriculum.unit
  const day = Math.min(6, Math.max(1, rec?.day ?? state.curriculum.day))
  const unit = units.find(u => u.id === unitId)
  if (!unit) return null
  const entry = unit.days[Math.min(day, unit.days.length) - 1]
  const sentence = rec && day < 6 ? lessonSentence(unit, day, rec.retry ?? 0, rec) : entry
  // Newest saved mistakes first (ids carry a base-36 timestamp).
  const mistakes = Object.entries(state.notes)
    .filter(([k]) => k.startsWith('say.'))
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => readSayCard(v))
    .filter(Boolean)
    .slice(0, 3)
    .map(c => (c!.wrong ? '"' + c!.wrong + '" → ' : '') + '"' + c!.en + '"')
  return {
    unit: unitId, day, title: unit.title, rule: unit.rule ?? '', cando: (unit as { cando?: string }).cando ?? '',
    sentence: sentence?.reference[0] ?? '', words: (entry?.newWords ?? []).map(w => w.en), mistakes,
  }
}

export function emmaLessonInstructions(l: EmmaLesson, task?: string) {
  return [
    `Today you are also helping him practise today's English lesson, inside a friendly chat (still be his friend, not a teacher).`,
    `Lesson: unit ${l.unit}, "${l.title}". Goal: ${l.cando}. Rule (in Chinese): ${l.rule}`,
    l.sentence ? `Today's sentence: "${l.sentence}".` : '',
    l.words.length ? `Words he learned: ${l.words.join(', ')}.` : '',
    l.mistakes.length ? `Mistakes he made recently (watch for them): ${l.mistakes.join('; ')}.` : '',
    task ? `Begin with this small task, in your own friendly words: ${task}` : '',
    'Ask questions whose natural answers use today\'s pattern. Keep your turns to one or two short sentences.',
    'When he makes a mistake with the pattern, fix at most one or two things per turn: first a tiny hint so he can fix it himself; if he cannot, say the correct sentence once, then ask him to say it again. When he gets it right, cheer briefly and move on.',
    'Other mistakes: handle them as "Correcting him" says, and keep the focus on today\'s pattern.',
    'After about eight of his turns, wrap up in one or two sentences: what he did well and one sentence to remember.',
  ].filter(Boolean).join('\n')
}
