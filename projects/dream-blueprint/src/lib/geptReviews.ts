import { geptFeedbackComplete, type GeptFeedback, type GeptLevel } from './gept'

export type GeptSavedAnswer =
  | { kind: 'recorded'; id: string; text: string; sawText: boolean }
  | { kind: 'failed' | 'silent' }
  | null

export type GeptReview = {
  id: string
  at: number
  feedback: GeptFeedback
  questions: string[]
  answers?: GeptSavedAnswer[]
  text?: string
  sample?: string
  custom?: boolean
}

type ReviewPart = 'questions' | 'picture'
export const geptReviewPrefix = 'dream-gept-review-v1:'
export const geptReviewChange = 'dream-gept-reviews'
const recentReviews = 3

function reviewGroup(part: ReviewPart, level: GeptLevel, setId: string) {
  return geptReviewPrefix + part + ':' + level + ':' + encodeURIComponent(setId) + ':'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function savedAnswer(value: unknown): value is GeptSavedAnswer {
  if (value === null) return true
  if (!isRecord(value)) return false
  if (value.kind === 'failed' || value.kind === 'silent') return true
  return value.kind === 'recorded' && typeof value.id === 'string'
    && typeof value.text === 'string' && typeof value.sawText === 'boolean'
}

function isFeedback(value: unknown): value is GeptFeedback {
  if (!isRecord(value) || typeof value.score !== 'number' || value.score < 0 || value.score > 5
    || !Number.isInteger(value.score * 2)) return false
  return typeof value.why === 'string' && typeof value.good === 'string' && typeof value.fix === 'string'
    && typeof value.rest === 'string' && Array.isArray(value.items) && value.items.every(item =>
      isRecord(item) && Number.isInteger(item.n) && typeof item.text === 'string')
    && Array.isArray(value.cards) && value.cards.every(card => isRecord(card) && typeof card.wrong === 'string'
      && typeof card.en === 'string' && typeof card.zh === 'string' && typeof card.why === 'string'
      && (card.tag === undefined || typeof card.tag === 'string')
      && (card.question === undefined || Number.isInteger(card.question)))
}

function isReview(value: unknown): value is GeptReview {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.at !== 'number'
    || !Number.isFinite(value.at) || !Array.isArray(value.questions) || !value.questions.length
    || !value.questions.every(q => typeof q === 'string') || !isFeedback(value.feedback)
    || !geptFeedbackComplete(value.feedback, value.questions.length)) return false
  if (value.answers !== undefined) return value.text === undefined && Array.isArray(value.answers)
    && value.answers.length === value.questions.length && value.answers.every(savedAnswer)
  return typeof value.text === 'string' && !!value.text.trim()
    && (value.custom === undefined || typeof value.custom === 'boolean')
    && (value.sample === undefined || typeof value.sample === 'string')
}

function readReview(raw: string | null): GeptReview | undefined {
  if (!raw) return
  try {
    const value: unknown = JSON.parse(raw)
    return isReview(value) ? value : undefined
  } catch { return undefined }
}

function newestFirst(a: GeptReview, b: GeptReview) {
  if (a.at !== b.at) return b.at - a.at
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/** One key per review keeps simultaneous attempts in different tabs from replacing each other. */
function reviewEntries(prefix: string, part: ReviewPart) {
  const entries: { key: string; review: GeptReview }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(prefix)) continue
    const review = readReview(localStorage.getItem(key))
    if (review && (part === 'questions') === (review.answers !== undefined)) entries.push({ key, review })
  }
  return entries.sort((a, b) => newestFirst(a.review, b.review))
}

export function readGeptReviews(part: ReviewPart, level: GeptLevel, setId: string): GeptReview[] {
  try { return reviewEntries(reviewGroup(part, level, setId), part).slice(0, recentReviews).map(entry => entry.review) }
  catch { return [] }
}

export function saveGeptReview(part: ReviewPart, level: GeptLevel, setId: string, review: GeptReview) {
  if (!isReview(review) || (part === 'questions') !== (review.answers !== undefined)) throw new Error('這次英檢口說回饋不完整。')
  const group = reviewGroup(part, level, setId)
  const { id, at, feedback, questions, answers, text, custom, sample } = review
  // The transcript stays on this browser. A personal photo or object URL is never written here.
  const stored = { id, at, feedback, questions, ...(answers ? { answers } : { text, custom, sample: custom ? undefined : sample }) }
  const key = group + encodeURIComponent(id)
  const previous = readReview(localStorage.getItem(key))
  if (!previous || previous.at <= at) localStorage.setItem(key, JSON.stringify(stored))
  for (const entry of reviewEntries(group, part).slice(recentReviews)) localStorage.removeItem(entry.key)
  window.dispatchEvent(new Event(geptReviewChange))
}
