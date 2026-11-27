import { addDays, daysBetween } from './progress'
import { legacyRecordId } from './recordId'

/** A short level check (listening, reading, writing, speaking), repeated every 12 weeks with a new form of similar difficulty. */
export type FormId = 'A' | 'B' | 'C'
export type Q = { q: string; options: string[]; answer: number }
/** listenZh: the clip in Chinese, shown with the English transcript only after the test is saved. */
export interface Form { listen: string; listenZh: string; listenQs: Q[]; read: string; readQs: Q[]; write: string; speak: string }
export interface BaselineResult {
  id?: string
  form?: FormId
  date: string
  /** null = 缺測 (skipped, or the clip was never played) — never stored as 0, which would look like a drop. */
  listening: number | null
  /** How many times the listening clip was played (max 2), so results are compared under the same conditions. */
  plays?: number
  reading: number | null
  /** This form was done before, so the questions were already seen. */
  repeat?: boolean
  writing: { text: string; feedback: string }
  speaking: { transcript: string; feedback: string; seconds: number }
}

export const legacyKey = 'baseline.v1'
export const resultsKey = 'baseline.results'
export const RETEST_DAYS = 84

export const forms: Record<FormId, Form> = {
  A: {
    listen: 'Hi, this is Amy from Green Valley Clinic. I am calling about your appointment on Thursday at ten a.m. The doctor is sick that day, so we need to change the time. We have two choices: Friday at two p.m., or next Monday at nine a.m. Please call us back before Wednesday at five p.m. Thank you.',
    listenZh: '嗨，我是綠谷診所的 Amy。我打來是要談你星期四早上十點的預約。那天醫師生病了，所以我們需要改時間。有兩個時間可以選：星期五下午兩點，或下星期一早上九點。請在星期三下午五點前回電給我們。謝謝。',
    listenQs: [
      { q: 'Why is the clinic calling?', options: ['To change an appointment', 'To ask about your medicine', 'To talk about your bill'], answer: 0 },
      { q: 'Which time is NOT one of the new choices?', options: ['Friday at 2 p.m.', 'Monday at 9 a.m.', 'Thursday at 10 a.m.'], answer: 2 },
      { q: 'When should you call back?', options: ['On Thursday morning', 'Before Wednesday at 5 p.m.', 'Next Monday'], answer: 1 },
    ],
    read: 'Drinking enough water is important for your health. Most adults need about eight cups of water a day, but people who exercise or live in hot places may need more. If you do not drink enough, you can feel tired, get headaches, or have trouble thinking clearly. Some easy ways to drink more water are to carry a water bottle, drink a glass with every meal, and eat fruits like watermelon and oranges. However, people with some heart or kidney problems should ask their doctor how much water is right for them.',
    readQs: [
      { q: 'What is the main idea?', options: ['Fruit is better than water', 'Water is good for you, and here is how to drink more', 'Everyone needs exactly the same amount of water'], answer: 1 },
      { q: 'Who may need more water?', options: ['People who sleep a lot', 'Only children', 'People who exercise'], answer: 2 },
      { q: 'Who should ask a doctor first?', options: ['People who like oranges', 'People with heart or kidney problems', 'People who carry a bottle'], answer: 1 },
    ],
    write: 'Write 3–5 sentences: What did you do yesterday? How did you feel?',
    speak: 'Talk for about one minute: introduce yourself — your name, your school, and why you want to be a nurse.',
  },
  B: {
    listen: 'Hello, this is Mike from Sunrise Pharmacy. Your medicine is ready. You can pick it up today until eight p.m., or tomorrow from nine a.m. Please bring your health card. The medicine costs two hundred dollars. If you have any questions, call us at 2345-6789. Thank you.',
    listenZh: '你好，我是日出藥局的 Mike。你的藥已經準備好了。你可以今天晚上八點前來拿，或明天早上九點以後來拿。請帶你的健保卡。這個藥是兩百元。有任何問題，請打 2345-6789 給我們。謝謝。',
    listenQs: [
      { q: 'Why is Mike calling?', options: ['Your appointment changed.', 'Your medicine is ready.', 'You forgot your health card.'], answer: 1 },
      { q: 'What does Mike ask you to bring?', options: ['A note from your doctor', 'Your old medicine', 'Your health card'], answer: 2 },
      { q: 'When can you pick it up tomorrow?', options: ['From 9 a.m.', 'Only until 8 a.m.', 'After 2 p.m.'], answer: 0 },
    ],
    read: 'Sleep is important for your body and your mind. Most adults need seven to nine hours of sleep each night, and teenagers need even more. Without enough sleep, people may feel moody, make more mistakes, and get sick more easily. To sleep better, try to go to bed at the same time every night, keep your phone away from your bed, and avoid coffee in the afternoon. If you still cannot sleep well for many weeks, you should talk to a doctor.',
    readQs: [
      { q: 'What is the main idea?', options: ['Teenagers sleep too much', 'Sleep is important, and here are ways to sleep better', 'Coffee is bad for everyone'], answer: 1 },
      { q: 'How many hours of sleep do most adults need?', options: ['Five to six hours', 'Ten to twelve hours', 'Seven to nine hours'], answer: 2 },
      { q: 'Which is NOT a tip in the text?', options: ['Exercise right before bed', 'Go to bed at the same time every night', 'Keep your phone away from your bed'], answer: 0 },
    ],
    write: 'Write 3–5 sentences: Describe your best friend. What do you like to do together?',
    speak: 'Talk for about one minute: describe a place you like to go, and say why you like it.',
  },
  C: {
    listen: 'Hi everyone, this is Lisa from the nursing office. Tomorrow\'s CPR class will start at one thirty, not at one. It will be in Room 402 on the fourth floor. Please wear comfortable clothes and bring a pen. The class will finish at four. If you cannot come, please email me before noon. See you tomorrow.',
    listenZh: '大家好，我是護理部的 Lisa。明天的 CPR 課改成一點半開始，不是一點。上課地點在四樓的 402 教室。請穿舒服的衣服，帶一支筆。課程四點結束。如果不能來，請在中午前寄 email 給我。明天見。',
    listenQs: [
      { q: 'What time will the class start?', options: ['At 1:00', 'At 1:30', 'At 4:00'], answer: 1 },
      { q: 'Where is the class?', options: ['Room 204', 'Room 420', 'Room 402'], answer: 2 },
      { q: 'What should you do if you cannot come?', options: ['Email Lisa before noon', 'Call the office at four', 'Come to the next class'], answer: 0 },
    ],
    read: 'The flu spreads easily from person to person, especially in winter. It can cause a fever, a cough, a sore throat, and body aches. The best way to protect yourself is to get a flu shot every year. You should also wash your hands often with soap and water for at least twenty seconds. If you are sick, stay home and cover your mouth when you cough. Most people get better in about a week, but older people and young children may need to see a doctor.',
    readQs: [
      { q: 'What is the main idea?', options: ['How the flu spreads and how to protect yourself', 'Why winter is cold', 'How to cook healthy food'], answer: 0 },
      { q: 'How long should you wash your hands?', options: ['About five seconds', 'At least twenty seconds', 'One full minute'], answer: 1 },
      { q: 'Who may need to see a doctor?', options: ['Everyone with a cough', 'People who got a flu shot', 'Older people and young children'], answer: 2 },
    ],
    write: 'Write 3–5 sentences: What did you do last weekend? Was it fun?',
    speak: 'Talk for about one minute: tell me about your nursing school — what you study and what is difficult.',
  },
}
const order: FormId[] = ['A', 'B', 'C']
type SavedResult = BaselineResult & { id: string }

/** A stable fingerprint of the work and scores, so adding feedback never changes a legacy result's identity. */
function legacyResultId(result: BaselineResult) {
  return legacyRecordId(JSON.stringify([
    result.date, result.form ?? 'A', result.listening, result.plays ?? null, result.reading,
    result.writing?.text, result.speaking?.transcript, result.speaking?.seconds,
  ]))
}

/** Every result, oldest first. The single old result (baseline.v1) counts as form A. */
export function readResults(notes: Record<string, string>): BaselineResult[] {
  try {
    if (notes[resultsKey]) return (JSON.parse(notes[resultsKey]) as BaselineResult[]).filter(r => r && r.date)
    if (notes[legacyKey]) return [{ form: 'A', ...JSON.parse(notes[legacyKey]) as BaselineResult }]
  } catch { /* broken note */ }
  return []
}

/** Legacy copies share stable identities, including repeated identical attempts. */
export function identifiedResults(notes: Record<string, string>): SavedResult[] {
  const list = readResults(notes)
  const knownIds = new Set(list.map(result => result.id))
  const occurrences = new Map<string, number>()
  return list.map(result => {
    if (result.id) return { ...result, id: result.id }
    const signature = legacyResultId(result)
    let occurrence = occurrences.get(signature) ?? 0
    let id: string
    do { id = signature + '-' + ++occurrence } while (knownIds.has(id))
    occurrences.set(signature, occurrence)
    return { ...result, id }
  })
}
export const makeBaselineId = () => 'baseline-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))

export function addResult(notes: Record<string, string>, result: BaselineResult) {
  return { ...notes, [resultsKey]: JSON.stringify([...readResults(notes), result]) }
}

/** Combine feedback saved on different devices without treating one attempt as two results. */
export function mergeBaselineResults(older: Record<string, string>, newer: Record<string, string>) {
  const feedbackFrom = (latest: unknown, previous: unknown) => typeof latest === 'string' && latest.trim() ? latest
    : typeof previous === 'string' ? previous : ''
  const byId = new Map(identifiedResults(older).map(result => [result.id, result]))
  for (const result of identifiedResults(newer)) {
    const prev = byId.get(result.id)
    byId.set(result.id, prev ? {
      ...result,
      writing: { ...result.writing, feedback: feedbackFrom(result.writing?.feedback, prev.writing?.feedback) },
      speaking: { ...result.speaking, feedback: feedbackFrom(result.speaking?.feedback, prev.speaking?.feedback) },
    } : result)
  }
  return [...byId.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}
/** Claude's comment on the test's writing is kept only in the form asked for: the CEFR line first, then its points. */
export const writingFeedbackOk = (text: string) => /CEFR/.test(text.trim().split('\n')[0] ?? '') && text.split('\n').filter(l => l.trim()).length >= 3
/** …and on the speaking transcript only with its fixed first line (a transcript gives no level) and its points. */
export const speakingFeedbackOk = (text: string) => /^只看逐字稿/.test(text.trim()) && text.split('\n').filter(l => l.trim()).length >= 3
/** Claude's comment added later to a specific saved check. The work and scores stay as they are. */
export function setResultFeedback(notes: Record<string, string>, at: string | { date: string; form?: FormId }, part: 'writing' | 'speaking', feedback: string) {
  const list = identifiedResults(notes)
  const matches = list.filter(result => typeof at === 'string' ? result.id === at
    : result.date === at.date && (result.form ?? 'A') === (at.form ?? 'A'))
  const i = matches.length === 1 ? list.indexOf(matches[0]) : -1
  if (i < 0) return notes
  list[i] = { ...list[i], [part]: { ...list[i][part], feedback } }
  return { ...notes, [resultsKey]: JSON.stringify(list) }
}
/** Keep all attempts in the history. Choose by the forms completed, not by the number of submissions. */
export function nextForm(results: readonly BaselineResult[]): FormId {
  const unseen = order.find(form => !formSeen(results, form))
  if (unseen) return unseen
  const last = order.indexOf(results.at(-1)?.form ?? 'A')
  return order[(last + 1) % order.length]
}
/** Whether this form's questions have already been used. */
export const formSeen = (results: readonly BaselineResult[], form: FormId) => results.some(r => (r.form ?? 'A') === form)
/** Score of one section: null when nothing was answered (缺測), otherwise the number right. */
export function sectionScore(qs: readonly Q[], answers: readonly (number | undefined)[]): number | null {
  if (!answers.some(a => a !== undefined)) return null
  return qs.filter((q, i) => answers[i] === q.answer).length
}
/** A check with every part skipped is not saved, so it neither looks like zero nor uses up a form. */
export const emptyCheck = (r: Pick<BaselineResult, 'listening' | 'reading' | 'writing' | 'speaking'>) =>
  r.listening === null && r.reading === null && !r.writing.text.trim() && !r.speaking.seconds
export function retestInfo(results: readonly BaselineResult[], today: string) {
  const last = results.at(-1)
  if (!last) return { due: true, date: today, days: 0 }
  const date = addDays(last.date, RETEST_DAYS)
  return { due: today >= date, date, days: Math.max(0, daysBetween(today, date)) }
}
/** The day 「今天先不要」 was pressed (or the test was opened from the pop-up): no pop-up again that day. */
export const laterKey = 'baseline.later'
/** The level test stays out of sight until it is due: no result yet, or 12 weeks after the last one. */
export const testDue = (notes: Record<string, string>, today: string) => retestInfo(readResults(notes), today).due
/** When it is due, it pops up on the home page once a day until it is done. */
export const showTestPrompt = (notes: Record<string, string>, today: string) => testDue(notes, today) && notes[laterKey] !== today
export { wordCount } from './writing'
/** The CEFR guess Claude put on the first line of its feedback, if any. */
export const cefrOf = (feedback: string) => feedback.match(/\b([ABC][12])\b/)?.[1] ?? ''
