import { addDays, daysBetween } from './progress'

/** A short level check (listening, reading, writing, speaking), repeated every 12 weeks with a new form of similar difficulty. */
export type FormId = 'A' | 'B' | 'C'
export type Q = { q: string; options: string[]; answer: number }
export interface Form { listen: string; listenQs: Q[]; read: string; readQs: Q[]; write: string; speak: string }
export interface BaselineResult {
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

/** Every result, oldest first. The single old result (baseline.v1) counts as form A. */
export function readResults(notes: Record<string, string>): BaselineResult[] {
  try {
    if (notes[resultsKey]) return (JSON.parse(notes[resultsKey]) as BaselineResult[]).filter(r => r && r.date)
    if (notes[legacyKey]) return [{ form: 'A', ...JSON.parse(notes[legacyKey]) as BaselineResult }]
  } catch { /* broken note */ }
  return []
}
export function addResult(notes: Record<string, string>, result: BaselineResult) {
  return { ...notes, [resultsKey]: JSON.stringify([...readResults(notes), result]) }
}
export const nextForm = (results: readonly BaselineResult[]): FormId => order[results.length % order.length]
/** Whether the next form has already been done (there are only three, so the fourth check reuses A). */
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
export { wordCount } from './writing'
/** The CEFR guess Claude put on the first line of its feedback, if any. */
export const cefrOf = (feedback: string) => feedback.match(/\b([ABC][12])\b/)?.[1] ?? ''
