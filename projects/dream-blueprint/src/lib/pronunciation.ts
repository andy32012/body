import data from '../data/pronunciation.json'
import { openSteps } from './unlock'

/** The pronunciation course: short lessons on the sounds, stress, linking and intonation a Mandarin speaker most often gets wrong.
 *  Every word and sentence has a recorded clip in a woman's and a man's voice (public/pron), packed one file per lesson and voice. */
export type PronKind = 'table' | 'pairs' | 'endings' | 'stress' | 'listen' | 'chunks'
/** In a 'chunks' lesson an item is a long word cut into syllables: label "BEAU·ti·ful", kk the KK symbols of each piece. */
export interface PronItem { label: string; text: string; note: string; kk?: string[] }
export interface PronQuiz { audio: string; q: string; options: string[]; answer: number; why: string }
export interface PronLesson {
  id: string; kind: PronKind; title: string; tag: string; explain: string[]; tip?: string
  pairs?: [string, string][]; items?: PronItem[]; quiz?: PronQuiz[]; sentences?: { en: string; zh: string }[]
}
export const pronLessons = data as PronLesson[]
export const pronLesson = (id: string) => pronLessons.find(l => l.id === id)

export type PronVoice = 'f' | 'm'
export type VoiceChoice = PronVoice | 'both'
export const pronVoices: PronVoice[] = ['f', 'm']
export const voiceNames: Record<VoiceChoice, string> = { f: '女聲', m: '男聲', both: '女＋男' }
export const voiceKey = 'pron.voice'
/** Both voices unless one was chosen: hearing a word from more than one speaker is what trains the ear. */
export const readVoice = (notes: Record<string, string>): VoiceChoice => {
  const v = notes[voiceKey]
  return v === 'f' || v === 'm' ? v : 'both'
}

/** File name of a clip inside a pack: the same rule the recording script uses. */
export const clipSlug = (text: string) => text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
/** The extra clips of a long word (a 'chunks' item), all cut from one slow recording: the slow word, each syllable, and the
 *  word growing syllable by syllable (the first two, the first three … up to all but the last; all of them is the slow word). */
export function chunkClips(item: PronItem) {
  const n = item.kk?.length ?? 0
  return {
    slow: item.text + '~slow',
    pieces: Array.from({ length: n }, (_, i) => item.text + '~' + (i + 1)),
    grown: Array.from({ length: Math.max(0, n - 2) }, (_, i) => item.text + '~1-' + (i + 2)),
  }
}
const chunkTexts = (item: PronItem) => { const c = chunkClips(item); return [c.slow, ...c.pieces, ...c.grown] }
/** Every text of a lesson that has a clip. */
export function lessonTexts(lesson: PronLesson): string[] {
  const all = [...(lesson.pairs ?? []).flat(), ...(lesson.items ?? []).map(i => i.text), ...(lesson.items ?? []).filter(i => i.kk).flatMap(chunkTexts), ...(lesson.quiz ?? []).map(q => q.audio), ...(lesson.sentences ?? []).map(s => s.en)]
  const seen = new Set<string>()
  return all.filter(t => { const s = clipSlug(t); if (seen.has(s)) return false; seen.add(s); return true })
}
export const packFile = (lessonId: string, voice: PronVoice) => 'pron/' + lessonId + '-' + voice + '.pack'

// ── The listening quiz of a lesson.
export interface PronQuestion { audio: string; prompt: string; options: string[]; answer: number; why: string; show?: string; compare?: string[] }
/** A small seeded generator, so one attempt keeps its questions and a test can ask for the same ones twice. */
function rng(seed: number) {
  let a = (seed >>> 0) || 1
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function shuffled<T>(list: readonly T[], next: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}
const edLabels = ['[t]', '[d]', '[ɪd]'], sLabels = ['[s]', '[z]', '[ɪz]']
/** The syllables of a stress label ("HOS·pi·tal") and which one is stressed. */
export function stressParts(label: string): { parts: string[]; stressed: number } {
  const raw = label.split('·')
  return { parts: raw.map(p => p.toLowerCase()), stressed: raw.findIndex(p => p === p.toUpperCase() && p !== p.toLowerCase()) }
}
const QUIZ_LENGTH = 8
/** Questions for one attempt. Minimal pairs: which of the two did you hear. Endings: which of the three sounds.
 *  Stress and long words: which syllable is stressed. Linking and intonation: the questions written for the lesson. */
export function quizFor(lesson: PronLesson, seed: number): PronQuestion[] {
  const next = rng(seed)
  if (lesson.kind === 'pairs' && lesson.pairs) {
    // Every pair once, in a random order, with a random member; a short lesson asks the other member of its pairs as well.
    const first = shuffled(lesson.pairs, next).map(p => ({ p, pick: next() < 0.5 ? 0 : 1 }))
    const second = lesson.pairs.length < 6 ? shuffled(first, next).map(x => ({ p: x.p, pick: 1 - x.pick })) : []
    return [...first, ...second].slice(0, QUIZ_LENGTH).map(({ p, pick }) => ({
      audio: p[pick], prompt: '你聽到的是哪一個？', options: [p[0], p[1]], answer: pick, why: '', compare: [p[0], p[1]],
    }))
  }
  if (lesson.kind === 'endings' && lesson.items) {
    const family = (labels: string[]) => shuffled(lesson.items!.filter(i => labels.includes(i.label)), next).slice(0, QUIZ_LENGTH / 2)
      .map(i => ({ audio: i.text, show: i.text, prompt: '這個字的字尾念哪一種？', options: labels, answer: labels.indexOf(i.label), why: i.note + '，所以念 ' + i.label + '。' }))
    return shuffled([...family(edLabels), ...family(sLabels)], next)
  }
  if ((lesson.kind === 'stress' || lesson.kind === 'chunks') && lesson.items) {
    return shuffled(lesson.items, next).slice(0, QUIZ_LENGTH).map(i => {
      const { parts, stressed } = stressParts(i.label)
      return { audio: i.text, show: i.text, prompt: '重音在哪一個音節？', options: parts, answer: stressed, why: '重音在 ' + parts[stressed] + '：' + i.label + '（' + i.note + '）' }
    })
  }
  return (lesson.quiz ?? []).map(q => ({ audio: q.audio, prompt: q.q, options: q.options, answer: q.answer, why: q.why, ...(q.options.includes(q.audio) ? {} : { show: q.audio }) }))
}
export const hasQuiz = (lesson: PronLesson) => quizFor(lesson, 1).length > 0

// ── Records: notes 'pron.<lesson id>'.
/** d: the day the lesson was last finished; q: the best quiz score; s: the day its sentences were last said aloud. */
export interface PronRecord { d?: string; q?: [number, number]; s?: string }
export const pronKey = (id: string) => 'pron.' + id
export const isPronRecordKey = (key: string) => key.startsWith('pron.') && !!pronLesson(key.slice('pron.'.length))
export function readPron(notes: Record<string, string>, id: string): PronRecord {
  try { return notes[pronKey(id)] ? JSON.parse(notes[pronKey(id)]) as PronRecord : {} } catch { return {} }
}
const ratio = (q?: [number, number]) => q && q[1] > 0 ? q[0] / q[1] : -1
export function mergePron(older: PronRecord, newer: PronRecord): PronRecord {
  const lastDay = (a?: string, b?: string) => a && b ? (a > b ? a : b) : a ?? b
  return {
    d: lastDay(older.d, newer.d),
    q: ratio(newer.q) >= ratio(older.q) ? newer.q ?? older.q : older.q,
    s: lastDay(older.s, newer.s),
  }
}
export function savePron(notes: Record<string, string>, id: string, patch: PronRecord): Record<string, string> {
  return { ...notes, [pronKey(id)]: JSON.stringify(mergePron(readPron(notes, id), patch)) }
}
export const PASS = 0.8
/** A lesson is passed when its quiz reached 80% once; a lesson without a quiz, when it was marked as done. */
export function pronPassed(lesson: PronLesson, rec: PronRecord) {
  return hasQuiz(lesson) ? ratio(rec.q) >= PASS : !!rec.d
}
export const nextPron = (notes: Record<string, string>) => pronLessons.find(l => !pronPassed(l, readPron(notes, l.id))) ?? null
export const pronProgress = (notes: Record<string, string>) => ({ done: pronLessons.filter(l => pronPassed(l, readPron(notes, l.id))).length, total: pronLessons.length })
/** The course goes in order: a lesson opens once every lesson before it is passed. */
export const pronOpen = (notes: Record<string, string>) => openSteps(pronLessons.map(l => pronPassed(l, readPron(notes, l.id))))
