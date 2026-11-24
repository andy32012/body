import curriculum from '../data/curriculum.json'
import type { AppState } from './store'
import { assistedUnits } from './grammarRetention'
import { baseForms } from './story'
import { readTopic, topics } from './topics'
import { wordKey } from './vocab'

/** What the Claude tutor needs to know about this learner for ONE sentence: which grammar has been taught,
 *  which has not, and which words of this sentence he has met. Built from the saved progress, so it is
 *  never empty once he has moved past the first lesson. Only the parts that matter for this sentence go in. */
export interface LearnedContext {
  /** Units already behind him, in course order. */
  learned: string[]
  /** Of those, units he finished with help and has not yet written alone. */
  shaky: string[]
  /** Grammar taught in life-topic lessons he has finished. */
  topicGrammar: string[]
  /** The unit he is on now (taught today, so it counts as taught). */
  current: string | null
  /** The next few units: not taught yet. */
  notYet: string[]
  /** Words in this sentence's answer that he has already met. */
  knownWords: string[]
  /** Words in this sentence's answer that he has not met and that are not listed as today's new words. */
  unknownWords: string[]
}

type Unit = (typeof curriculum.units)[number]
type Word = { en: string }
type Sentence = { id: string; reference: string[]; newWords: Word[] }

const units = curriculum.units as Unit[]
const NOT_YET_SHOWN = 4

/** Small grammar words that the grammar units teach; they are never "new vocabulary". */
const grammarWords = new Set([
  'a', 'an', 'the', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had', 'not', 'no', 'yes',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and', 'but', 'or', 'so', 'this', 'that', 'these', 'those', 'will', 'can',
  'there', 'here', 'what', 'who', 'where', 'when', 'why', 'how', 'which', 'mr', 'mrs', 'ms', 'ok', 'okay',
])

/** "I'm" → i, "doesn't" → does, "nurse's" → nurse. */
function tokens(text: string): string[] {
  return text.toLowerCase()
    .replace(/[’']s\b/g, '').replace(/n[’']t\b/g, '').replace(/[’'](m|re|ll|ve|d)\b/g, '')
    .split(/[^a-z]+/).filter(Boolean)
}

/** Every word the course has put in front of him up to and including the current lesson day. */
function courseWords(cursor: { unit: number; day: number }): Set<string> {
  const seen = new Set<string>()
  for (const unit of units) {
    if (unit.id > cursor.unit) break
    for (const day of unit.days) {
      if (unit.id === cursor.unit && day.day > cursor.day) continue
      const lists = [day.newWords, day.words, (day as { bonusWords?: Word[] }).bonusWords ?? []]
      for (const list of lists) for (const w of list ?? []) seen.add(wordKey(w.en))
    }
  }
  return seen
}

export function learnedFor(state: Pick<AppState, 'curriculum' | 'knownWords' | 'learningWords' | 'notes'>, sentence: Sentence): LearnedContext {
  const cursor = state.curriculum
  const passed = units.filter(u => u.id < cursor.unit)
  const assisted = new Set(assistedUnits(state.notes))
  const stable = new Set(cursor.stableUnits)
  const current = units.find(u => u.id === cursor.unit) ?? null

  const met = courseWords(cursor)
  for (const w of [...state.knownWords, ...state.learningWords]) met.add(wordKey(w))
  const fresh = new Set(sentence.newWords.map(w => wordKey(w.en)))

  const known: string[] = []
  const unknown: string[] = []
  for (const token of new Set(tokens(sentence.reference[0] ?? ''))) {
    if (grammarWords.has(token)) continue
    const forms = baseForms(token).map(wordKey)
    if (forms.some(f => fresh.has(f))) continue
    if (forms.some(f => met.has(f))) known.push(token)
    else unknown.push(token)
  }

  return {
    learned: passed.map(u => u.title),
    shaky: passed.filter(u => assisted.has(u.id) && !stable.has(u.id)).map(u => u.title),
    topicGrammar: topics.filter(t => readTopic(state.notes, t.id).done.B).map(t => t.grammar.title),
    current: current?.title ?? null,
    notYet: units.filter(u => u.id > cursor.unit).slice(0, NOT_YET_SHOWN).map(u => u.title),
    knownWords: known,
    unknownWords: unknown,
  }
}

/** The lines that go into the tutor's system prompt. Compact: unit titles, not their full rules. */
export function learnedLines(ctx: LearnedContext): string[] {
  const lines = ['他學過什麼（照這個分辨「學過的規則寫錯」和「沒學過」）：']
  lines.push(ctx.learned.length ? '- 已經上完的文法單元：' + ctx.learned.join('、') : '- 已經上完的文法單元：還沒有（這是他的第一個單元）')
  if (ctx.shaky.length) lines.push('- 其中做完但有看提示、還不穩的：' + ctx.shaky.join('、'))
  if (ctx.topicGrammar.length) lines.push('- 生活主題課另外教過：' + ctx.topicGrammar.join('、'))
  if (ctx.current) lines.push('- 正在上（今天已經教過，算學過）：' + ctx.current)
  if (ctx.notYet.length) lines.push('- 還沒教：' + ctx.notYet.join('、') + '，以及之後的所有單元。他用到這些時，錯了算「沒學過」，用簡單的中文直接教，不要扣分。')
  if (ctx.knownWords.length) lines.push('- 這句裡他已經背過或課堂上學過的字：' + ctx.knownWords.join('、'))
  if (ctx.unknownWords.length) lines.push('- 這句裡他可能還沒學過的字（不會寫不算錯，直接教）：' + ctx.unknownWords.join('、'))
  return lines
}
