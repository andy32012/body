/** The graded passages used as input: read them, listen to them, write a sentence from dictation.
 *  They are the same 1,476 passages as the 7000-word translation exercise. Translation goes forward from the first
 *  passage of a level; reading and listening start from the last one, so the English is not seen before it is asked for. */
import { compareWithReference, normalizeEnglish } from './evidence'
import { doneKey, type Passage } from './passages'
import { levelEntry, meaningLine } from './vocab'
import { levelDone, openSteps } from './unlock'

export type StoryTab = 'read' | 'listen' | 'dictate'
export const storyTabs: [StoryTab, string][] = [['read', '閱讀'], ['listen', '聽力'], ['dictate', '聽寫']]
/** r, l, d: the day it was read, listened to, written from dictation. q: meaning questions right / asked.
 *  dq: dictation words right / total. zh: the Chinese was opened before the questions. u: how much was understood by ear (1–3). */
export interface StoryRecord { r?: string; l?: string; d?: string; q?: [number, number]; dq?: [number, number]; zh?: boolean; u?: 1 | 2 | 3 }
const field: Record<StoryTab, 'r' | 'l' | 'd'> = { read: 'r', listen: 'l', dictate: 'd' }
export const storyKey = (id: string) => 'story.' + id
export const storyLevelKey = 'story.level'

export function readStory(notes: Record<string, string>, id: string): StoryRecord {
  try { const v = notes[storyKey(id)]; return v ? JSON.parse(v) as StoryRecord : {} } catch { return {} }
}
export function saveStory(notes: Record<string, string>, id: string, patch: StoryRecord) {
  return { ...notes, [storyKey(id)]: JSON.stringify({ ...readStory(notes, id), ...patch }) }
}

const titles = /\b(Mr|Mrs|Ms|Dr|St|Prof|No|vs)\.$/i
const clockForms = /\b(a\.m|p\.m|e\.g|i\.e)\.$/i
/** The sentences of a passage. A title (Mr., Dr.) never ends a sentence; a.m. and p.m. end one only when the next word
 *  starts with a capital letter ("…at two p.m. I wanted…"); a closing quote stays with its sentence. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let current = ''
  const pieces = text.trim().split(/(?<=[.!?]["”’']?)\s+/)
  pieces.forEach((piece, i) => {
    current = current ? current + ' ' + piece : piece
    const bare = current.replace(/["”’']$/, '')
    const next = pieces[i + 1]
    if (next !== undefined && (titles.test(bare) || (clockForms.test(bare) && !/^["“‘']?[A-Z]/.test(next)))) return
    out.push(current)
    current = ''
  })
  if (current) out.push(current)
  return out
}

/** Order inside a level: passages already translated first (their English has been seen), then the rest from the end
 *  of the level backwards. Dictation prefers passages already read or heard. */
export function storyOrder(all: readonly Passage[], level: number, checks: Record<string, boolean>, notes: Record<string, string>, tab: StoryTab) {
  const pool = all.filter(p => p.level === level && p.en)
  const translated = pool.filter(p => checks[doneKey(p.id)])
  const rest = pool.filter(p => !checks[doneKey(p.id)]).reverse()
  const order = [...translated, ...rest]
  if (tab !== 'dictate') return order
  const met = (p: Passage) => { const r = readStory(notes, p.id); return !!(r.r || r.l) }
  return [...order.filter(met), ...order.filter(p => !met(p))]
}
/** The next passage for a tab: one not done in that tab yet; when all are done, the round starts again. */
export function nextStory(all: readonly Passage[], level: number, checks: Record<string, boolean>, notes: Record<string, string>, tab: StoryTab, skipped: readonly string[] = []) {
  const order = storyOrder(all, level, checks, notes, tab).filter(p => !skipped.includes(p.id))
  return order.find(p => !readStory(notes, p.id)[field[tab]]) ?? order[0]
}
export function storyProgress(all: readonly Passage[], level: number, notes: Record<string, string>, tab: StoryTab) {
  const pool = all.filter(p => p.level === level && p.en)
  return { done: pool.filter(p => readStory(notes, p.id)[field[tab]]).length, total: pool.length }
}

/** The six levels on one tab (讀 / 聽 / 聽寫): a level opens once the one before it is done to its target (80%) on the same tab. */
export const storyLevelsOpen = (all: readonly Passage[], notes: Record<string, string>, tab: StoryTab) =>
  openSteps([1, 2, 3, 4, 5, 6].map(n => { const p = storyProgress(all, n, notes, tab); return levelDone(p.done, p.total) }))

const irregular: Record<string, string> = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', has: 'have', had: 'have', does: 'do', did: 'do', done: 'do',
  went: 'go', gone: 'go', came: 'come', saw: 'see', seen: 'see', took: 'take', taken: 'take', got: 'get', gotten: 'get', made: 'make',
  ate: 'eat', eaten: 'eat', gave: 'give', given: 'give', told: 'tell', felt: 'feel', left: 'leave', said: 'say', knew: 'know', known: 'know',
  thought: 'think', bought: 'buy', brought: 'bring', found: 'find', heard: 'hear', kept: 'keep', met: 'meet', paid: 'pay', ran: 'run',
  sat: 'sit', slept: 'sleep', spoke: 'speak', spoken: 'speak', stood: 'stand', taught: 'teach', wrote: 'write', written: 'write',
  drank: 'drink', drunk: 'drink', drove: 'drive', driven: 'drive', fell: 'fall', fallen: 'fall', flew: 'fly', forgot: 'forget',
  forgotten: 'forget', grew: 'grow', grown: 'grow', held: 'hold', lost: 'lose', sang: 'sing', sent: 'send', sold: 'sell', swam: 'swim',
  threw: 'throw', understood: 'understand', woke: 'wake', won: 'win', wore: 'wear', began: 'begin', begun: 'begin', broke: 'break',
  broken: 'break', built: 'build', caught: 'catch', chose: 'choose', chosen: 'choose', became: 'become', rose: 'rise', risen: 'rise',
  children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth', mice: 'mouse', people: 'person',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad', me: 'i', him: 'he', her: 'she', us: 'we', them: 'they',
}
/** Base forms a written word might belong to, most likely first: walked → walk, studies → study, running → run. */
export function baseForms(word: string): string[] {
  const w = word.toLowerCase().replace(/[’']s$/, '')
  const out = [w]
  if (irregular[w]) out.push(irregular[w])
  const add = (stem: string) => { out.push(stem); if (/([b-df-hj-np-tv-z])\1$/.test(stem)) out.push(stem.slice(0, -1)); out.push(stem + 'e') }
  if (w.endsWith('ies')) out.push(w.slice(0, -3) + 'y')
  if (w.endsWith('ied')) out.push(w.slice(0, -3) + 'y')
  if (w.endsWith('ier')) out.push(w.slice(0, -3) + 'y')
  if (w.endsWith('iest')) out.push(w.slice(0, -4) + 'y')
  if (w.endsWith('ily')) out.push(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) out.push(w.slice(0, -2))
  if (w.endsWith('s')) out.push(w.slice(0, -1))
  if (w.endsWith('ed')) add(w.slice(0, -2))
  if (w.endsWith('ing')) add(w.slice(0, -3))
  if (w.endsWith('est')) add(w.slice(0, -3))
  if (w.endsWith('er')) add(w.slice(0, -2))
  if (w.endsWith('ly')) out.push(w.slice(0, -2))
  return [...new Set(out)].filter(x => x.length > 1 || x === 'a' || x === 'i')
}
export interface Lookup { form: string; en: string; zh: string; from: 'passage' | 'table' }
/** A tapped word: the passage's own hint first (its meaning in this passage), then the 7000-word table
 *  (the general meaning, by base form). Null when neither has it — names, numbers, words outside the list. */
export function lookupWord(raw: string, passage: Pick<Passage, 'words'>): Lookup | null {
  const form = raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
  if (!form) return null
  const low = form.toLowerCase()
  const hint = passage.words?.find(w => (w.form ?? w.en).toLowerCase() === low) ?? passage.words?.find(w => w.en.toLowerCase() === low)
  if (hint) return { form, en: hint.en, zh: hint.zh, from: 'passage' }
  const exact = levelEntry(low)
  // "left" is a word of its own and also the past of "leave": show both, the table cannot tell which one the sentence means.
  const other = irregular[low] ? levelEntry(irregular[low]) : undefined
  if (exact) return { form, en: exact.en, from: 'table',
    zh: meaningLine(exact) + (other && other !== exact ? '；也可能是 ' + other.en + ' 的變化形：' + meaningLine(other) : '') }
  for (const b of baseForms(form).slice(1)) {
    const entry = levelEntry(b)
    if (entry) return { form, en: entry.en, zh: meaningLine(entry), from: 'table' }
  }
  return null
}

const hash = (s: string) => { let n = 2166136261; for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0 }
export interface MeaningQuestion { form: string; en: string; zh: string; options: string[]; answer: number }
/** Up to `count` meaning questions on the passage's hint words that were not looked up: "what does this word mean here?"
 *  The wrong options are meanings of hint words from other passages of the same level. The same passage always gives the same questions. */
export function meaningQuestions(passage: Passage, all: readonly Passage[], lookedUp: ReadonlySet<string>, count = 3): MeaningQuestion[] {
  const own = (passage.words ?? []).filter(w => !(w.form ?? w.en).includes(' '))
  const free = own.filter(w => !lookedUp.has((w.form ?? w.en).toLowerCase()) && !lookedUp.has(w.en.toLowerCase()))
  const ownMeanings = new Set(own.map(w => w.zh))
  const others = all.filter(p => p.level === passage.level && p.id !== passage.id).flatMap(p => p.words ?? []).filter(w => !ownMeanings.has(w.zh))
  if (others.length < 2) return []
  const picked = [...free].sort((a, b) => hash(passage.id + a.en) - hash(passage.id + b.en)).slice(0, count)
  return picked.map(w => {
    const seed = hash(passage.id + '/' + w.en)
    const wrong: string[] = []
    for (let i = 0; wrong.length < 2 && i < others.length; i++) {
      const zh = others[(seed + i * 7919) % others.length].zh
      if (zh !== w.zh && !wrong.includes(zh)) wrong.push(zh)
    }
    const at = seed % 3
    const options = [...wrong]
    options.splice(Math.min(at, options.length), 0, w.zh)
    return { form: w.form ?? w.en, en: w.en, zh: w.zh, options, answer: options.indexOf(w.zh) }
  })
}

/** Dictation: the words of the sentence that were written down, in order. Case, punctuation and contractions do not count. */
export function dictationScore(answer: string, sentence: string) {
  const total = normalizeEnglish(sentence).split(' ').filter(Boolean).length
  const diff = answer.trim() ? compareWithReference(answer, [sentence]) : null
  if (!diff) return { right: 0, total, words: [] as { w: string; extra: boolean }[], missing: normalizeEnglish(sentence).split(' ').filter(Boolean) }
  return { right: total - diff.missing.length, total, words: diff.words, missing: diff.missing }
}
/** Whole-passage dictation result from its sentences. */
export const dictationTotal = (parts: readonly { right: number; total: number }[]): [number, number] =>
  [parts.reduce((n, p) => n + p.right, 0), parts.reduce((n, p) => n + p.total, 0)]
