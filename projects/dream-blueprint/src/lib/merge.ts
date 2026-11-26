import type { AppState } from './store'
import { memoryDeletedKey, memoryNoteKey, memoryTimesKey, mergeMemoryNotes } from './memory'
import { laterWeakRemoval, readRemoved, readWeak, weakAfterRemoval, weakKey, weakRemovedKey, type WeakItem } from './weakPoints'
import { archiveKey, mergeArchives, readArchive, reviewEventKey } from './compact'
import { isClosedRun, mergeHints, mergeLessonRecords, mergeRunProgress, type HintUse, type LessonRecord, type RunProgress } from './lesson'
import { mergeMoved, movedKey, readMoved, settleWords } from './wordStates'
import { betterRead, type ReadAttempt } from './reading'
import { betterListen, mergeHeld, type HeldRecord, type ListenAttempt } from './bridge'
import { mergeCertificates } from './cefr'
import { bestExamAttempt, examRatio, type ExamRecord } from './examKeys'
import { mergeGeptRecords, type GeptRecord } from './gept'
import { mergeEvidenceRecords, readEvidence } from './evidence'
import { backgroundPinPrefix, mergeBackgroundPin } from './backgroundPin'
import { mergeUnfinished } from './unfinished'
import { mergeStory, type StoryRecord } from './story'
import type { TopicRecord } from './topics'
import { isPronRecordKey, mergePron, type PronRecord } from './pronunciation'
import { isSortedKey, mergeSortedWords } from './dailyWords'
import { legacyKey as legacyBaselineKey, mergeBaselineResults, resultsKey as baselineResultsKey } from './baseline'

/**
 * 「兩份合併」: when two devices both changed the progress since they last synced, keep everything from both instead of
 * choosing one. Lessons, sessions, review cards and lines, words, weak points and notes from either side all stay; the
 * course position is the one further along within the most recent retry; settings follow the copy changed last.
 */
type Notes = Record<string, string>
const unionBy = <T>(a: readonly T[], b: readonly T[], key: (x: T) => string) => {
  const seen = new Set<string>(), out: T[] = []
  for (const x of [...a, ...b]) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(x) } }
  return out
}
const parse = (v: string): unknown => { try { return JSON.parse(v) } catch { return undefined } }
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : 0
const earliest = (...days: unknown[]) => days.filter((d): d is string => typeof d === 'string' && !!d).sort()[0]
/** read.*, write.*, nurse.listen.*, bridge.listen.*, story.<passage>, topic.<id>: see mergeNote. Null for anything else. */
function mergePractice(key: string, a: unknown, b: unknown): string | null {
  if (!isObj(a) || !isObj(b)) return null
  if (key.startsWith('exam.read.') && typeof a.correct === 'number' && typeof b.correct === 'number') {
    const first = bestExamAttempt(a as unknown as ExamRecord)
    const second = bestExamAttempt(b as unknown as ExamRecord)
    const best = first && (!second || examRatio(first) > examRatio(second)
      || (examRatio(first) === examRatio(second) && first.picks && !second.picks)) ? first : second
    const latest = String(a.day) > String(b.day) ||
      (a.day === b.day && typeof a.at === 'number' && typeof b.at === 'number' && a.at > b.at) ? a : b
    return JSON.stringify({ ...latest, best, tries: Math.max(num(a.tries), num(b.tries)) })
  }
  if (key.startsWith('gept.speak.')) return JSON.stringify(mergeGeptRecords(a as GeptRecord, b as GeptRecord))
  if (/^bridge\.held\.\d+$/.test(key)) return JSON.stringify(mergeHeld(a as HeldRecord, b as HeldRecord))
  if (isPronRecordKey(key)) return JSON.stringify(mergePron(a as PronRecord, b as PronRecord))
  if (/^read\./.test(key) && typeof a.correct === 'number' && typeof b.correct === 'number') {
    const bestOf = (r: Record<string, unknown>) => (isObj(r.best) ? r.best : { day: r.day, correct: r.correct, total: r.total, ...(r.zh ? { zh: true } : {}) }) as unknown as ReadAttempt
    const ba = bestOf(a), bb = bestOf(b)
    const legacyBest = b.legacyBest ?? a.legacyBest
    return JSON.stringify({ ...b, best: betterRead(ba, bb) ? ba : bb, tries: Math.max(num(a.tries), num(b.tries)), ...(legacyBest ? { legacyBest } : {}) })
  }
  if (/^write\./.test(key) && (typeof a.day === 'string' || typeof b.day === 'string')) {
    const bests = [a.best, b.best].filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 9)
    const self = Math.max(num(a.self), num(b.self))
    const earlierCheck = isObj(a.last) ? num(a.last.submittedAt) : 0
    const laterCheck = isObj(b.last) ? num(b.last.submittedAt) : 0
    // A device can save an older answer later if its grading request took longer.
    const keepEarlier = laterCheck > 0 && earlierCheck > laterCheck
    const day = typeof a.day === 'string' && (typeof b.day !== 'string' || a.day > b.day) ? a.day : b.day
    return JSON.stringify({ ...a, ...b, day, last: keepEarlier ? a.last : b.last ?? a.last,
      ...(keepEarlier ? { words: a.words } : {}), ...(bests.length ? { best: Math.max(...bests) } : {}),
      tries: Math.max(num(a.tries), num(b.tries)), ...(self ? { self } : {}) })
  }
  if (/^(nurse|bridge)\.listen\./.test(key) && typeof a.correct === 'number' && typeof b.correct === 'number') {
    const bestOf = (r: Record<string, unknown>) => (isObj(r.best) ? r.best : { day: r.day, correct: r.correct, total: r.total, heard: !!r.heard }) as unknown as ListenAttempt
    const ba = bestOf(a), bb = bestOf(b)
    const firstReview = isObj(a.reviewBest) ? a.reviewBest as unknown as ListenAttempt : undefined
    const secondReview = isObj(b.reviewBest) ? b.reviewBest as unknown as ListenAttempt : undefined
    const reviewBest = firstReview && betterListen(firstReview, secondReview) ? firstReview : secondReview
    return JSON.stringify({ ...b, best: betterListen(ba, bb) ? ba : bb, plays: Math.max(num(a.plays), num(b.plays)),
      ...(reviewBest ? { reviewBest } : {}) })
  }
  if (key.startsWith('story.')) return JSON.stringify(mergeStory(a as StoryRecord, b as StoryRecord))
  if (/^topic\./.test(key) && isObj(a.done) && isObj(b.done)) {
    const done: Record<string, string> = {}
    for (const p of new Set([...Object.keys(a.done), ...Object.keys(b.done)])) { const day = earliest(a.done[p], b.done[p]); if (day) done[p] = day }
    const open = isObj(a.open) || isObj(b.open) ? { ...(isObj(a.open) ? a.open : {}), ...(isObj(b.open) ? b.open : {}) } : undefined
    const items = isObj(a.items) || isObj(b.items) ? { ...(isObj(a.items) ? a.items : {}), ...(isObj(b.items) ? b.items : {}) } : undefined
    const earlierReview = isObj(a.review) ? a.review as NonNullable<TopicRecord['review']> : undefined
    const laterReview = isObj(b.review) ? b.review as NonNullable<TopicRecord['review']> : undefined
    const hasAnswer = (review?: TopicRecord['review']) => !!review?.speak && (!!review.speak.mode || !!review.speak.level)
    const speak = hasAnswer(earlierReview) && !hasAnswer(laterReview) ? earlierReview?.speak : laterReview?.speak ?? earlierReview?.speak
    const review = laterReview || earlierReview ? { level: laterReview?.level ?? earlierReview?.level ?? null, speak } : undefined
    // Where to continue: the newer copy's place, unless that part is already finished on either device.
    const cur = [b.cur, a.cur].find(c => isObj(c) && typeof c.part === 'string' && !done[c.part])
    const out: Record<string, unknown> = { ...a, ...b, done, ...(open ? { open } : {}), ...(items ? { items } : {}), ...(review ? { review } : {}) }
    if (cur) out.cur = cur; else delete out.cur
    return JSON.stringify(out)
  }
  return null
}

/** One note both sides wrote differently. `newer` is the value from the copy changed last. */
export function mergeNote(key: string, older: string, newer: string, words?: Pick<AppState, 'knownWords' | 'learningWords'>): string {
  if (isSortedKey(key)) return JSON.stringify(mergeSortedWords(older, newer, words))
  if (older === newer) return newer
  if (key === weakKey || key === weakRemovedKey) return mergeWeakNotes({ [key]: older }, { [key]: newer })[key] ?? newer
  if (key.startsWith(backgroundPinPrefix)) return mergeBackgroundPin(older, newer)
  if (/^(reading\.progress\.(?:general|unit|nursing|exam)|case\.progress)\./.test(key)) return mergeUnfinished(older, newer)
  if (/^evidence\.\d+$/.test(key)) {
    const unit = Number(key.slice('evidence.'.length))
    return JSON.stringify(mergeEvidenceRecords(readEvidence({ [key]: older }, unit), readEvidence({ [key]: newer }, unit)))
  }
  // A day's count (today's sentence review and the like): the larger one has everything done on either device. Other
  // numbers are settings (how many new words a day): the one changed last.
  if ((/\d{4}-\d{2}-\d{2}/.test(key) || key.startsWith('content.notice.')) && /^\d+$/.test(older) && /^\d+$/.test(newer))
    return String(Math.max(Number(older), Number(newer)))
  const a = parse(older), b = parse(newer)
  // A practice record both devices wrote: the latest attempt from the copy changed last, but the best attempt that
  // counts, the most tries and every finished mode or part from either side, so a pass or a best score never goes back.
  const practice = mergePractice(key, a, b)
  if (practice) return practice
  // The days each skill was practised: every day from both devices.
  if (key === 'skills.log' && isObj(a) && isObj(b)) {
    const out: Record<string, unknown> = { ...a }
    for (const [k, v] of Object.entries(b)) out[k] = Array.isArray(v) && Array.isArray(a[k]) ? [...new Set([...(a[k] as unknown[]), ...v])].sort().slice(-60) : v
    return JSON.stringify(out)
  }
  // One word's four skills (the day each was shown): a skill shown on either device stays, with the later day.
  if (key.startsWith('skill.') && isObj(a) && isObj(b)) {
    const out: Record<string, unknown> = { ...a }
    for (const [k, v] of Object.entries(b)) out[k] = typeof v === 'string' && typeof a[k] === 'string' && (a[k] as string) > v ? a[k] : v
    return JSON.stringify(out)
  }
  // The folded old review lines: the archive folded further along (the lines before it are dropped from the merge).
  if (key === 'review.archive' && isObj(a) && isObj(b)) return String(a.before ?? '') > String(b.before ?? '') ? older : newer
  // Listening evidence belongs to the first reveal of this dialogue, including a reveal made without hearing it.
  if (/^lesson\.heard\.\d+$/.test(key) && isObj(a) && isObj(b) && typeof a.day === 'string' && typeof b.day === 'string') {
    if (a.day !== b.day) return a.day < b.day ? older : newer
    if (typeof a.at === 'number' && typeof b.at === 'number') return b.at < a.at ? newer : older
    return older
  }
  // A day's lesson on two devices: steps, answers and the open task's sentences from both, not just the copy changed last.
  if (/^lesson\.\d{4}-\d{2}-\d{2}$/.test(key) && isObj(a) && isObj(b) && Array.isArray(a.steps) && Array.isArray(b.steps))
    return JSON.stringify(mergeLessonRecords(a as unknown as LessonRecord, b as unknown as LessonRecord))
  // Help used that day outside the lesson (hints and answers shown): the most from either device.
  if (/^hints\.\d{4}-\d{2}-\d{2}$/.test(key) && isObj(a) && isObj(b))
    return JSON.stringify(mergeHints(a as Record<string, HintUse>, b as Record<string, HintUse>))
  // When words last moved between 認得 and 還不熟: the later move of each word.
  if (key === movedKey) return JSON.stringify(mergeMoved(readMoved({ [key]: older }), readMoved({ [key]: newer })))
  if (/^progress\.(?:(?:review|checkpoint)\.)?\d{4}-\d{2}-\d{2}$/.test(key)) {
    if (isRunProgress(a) && isRunProgress(b)) return JSON.stringify(mergeRunProgress(a, b))
    if (isClosedRun(a) && (isClosedRun(b) || isRunProgress(b)))
      return a.updatedAt >= (b.updatedAt ?? 0) ? older : newer
    if (isClosedRun(b) && isRunProgress(a))
      return b.updatedAt >= (a.updatedAt ?? 0) ? newer : older
  }
  // Other lists (dated records, for example): everything from both, once.
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(unionBy(a, b, x => JSON.stringify(x)))
  // 0: missed, 1: right first time, 2: missed and later corrected. Preserve both the miss and the resolution.
  if (/^(gram|gbook)\./.test(key) && isObj(a) && isObj(b) && isObj(a.marks) && isObj(b.marks)) {
    const marks = { ...a.marks }
    for (const [id, result] of Object.entries(b.marks)) {
      if (result !== 0 && result !== 1 && result !== 2) continue
      const earlier = marks[id]
      marks[id] = earlier === 0 || earlier === 1 || earlier === 2
        ? earlier === result ? result : 2
        : result
    }
    return JSON.stringify({ ...a, ...b, marks })
  }
  return newer
}

function isRunProgress(value: unknown): value is RunProgress {
  return isObj(value) && typeof value.unit === 'number' && typeof value.day === 'number' && typeof value.pos === 'number'
    && Array.isArray(value.records) && Array.isArray(value.levels)
}

function mergeWeakNotes(older: Notes, newer: Notes): Notes {
  const removed = new Map(Object.entries(readRemoved(older)))
  for (const [label, mark] of Object.entries(readRemoved(newer))) {
    removed.set(label, laterWeakRemoval(removed.get(label), mark))
  }
  const items = new Map<string, WeakItem>()
  for (const item of [...readWeak(older), ...readWeak(newer)]) {
    if (!weakAfterRemoval(item, removed.get(item.k))) continue
    const previous = items.get(item.k)
    if (!previous) { items.set(item.k, item); continue }
    const [stronger, weaker] = item.n >= previous.n ? [item, previous] : [previous, item]
    const lastAt = Math.max(item.lastAt ?? 0, previous.lastAt ?? 0)
    items.set(item.k, {
      ...stronger,
      ex: unionBy(stronger.ex, weaker.ex, e => JSON.stringify(e)).slice(0, 8),
      first: earliest(previous.first, item.first) ?? stronger.last,
      last: item.last > previous.last ? item.last : previous.last,
      ...(lastAt ? { lastAt } : {}),
    })
  }
  return {
    ...(weakKey in older || weakKey in newer ? { [weakKey]: JSON.stringify([...items.values()]) } : {}),
    ...(removed.size ? { [weakRemovedKey]: JSON.stringify(Object.fromEntries(removed)) } : {}),
  }
}

function mergeSchool(older: AppState['school'], newer: AppState['school']): AppState['school'] {
  const removed = new Map(Object.entries(older.requirementsRemoved ?? {}))
  for (const [id, modifiedAt] of Object.entries(newer.requirementsRemoved ?? {}))
    removed.set(id, Math.max(removed.get(id) ?? 0, modifiedAt))
  const items = new Map(newer.requirements.map(item => [item.id, item]))
  for (const item of older.requirements) {
    const latest = items.get(item.id)
    // Legacy checklist rows have only the overall save order. Keep the newer copy's choices in that case.
    if ((item.modifiedAt ?? 0) > (latest?.modifiedAt ?? 0)) items.set(item.id, item)
  }
  const requirements = [...items.values()].filter(item => (item.modifiedAt ?? 0) > (removed.get(item.id) ?? -1))
  return { ...newer, requirements, ...(removed.size ? { requirementsRemoved: Object.fromEntries(removed) } : {}) }
}

function compareCourse(a: AppState['curriculum'], b: AppState['curriculum']) {
  return a.unit - b.unit || a.retry - b.retry || a.day - b.day
}

/** Both copies merged. `mineNewer`: this device's copy was changed after the cloud copy was saved. */
export function mergeStates(mine: AppState, theirs: AppState, mineNewer: boolean): AppState {
  const [older, newer] = mineNewer ? [theirs, mine] : [mine, theirs]
  // The same session id on both (the practice library keeps one session a day): every answer and word from both.
  const sessions = new Map<string, AppState['sessions'][number]>()
  for (const s of [...older.sessions, ...newer.sessions]) {
    const had = sessions.get(s.id)
    if (!had) { sessions.set(s.id, s); continue }
    const translations = unionBy(had.translations ?? [], s.translations ?? [], t => JSON.stringify(t))
    const spokenIds = unionBy(had.spokenIds ?? [], s.spokenIds ?? [], x => x)
    const advanced = (had.advanced ?? had.energy !== 'low') || (s.advanced ?? s.energy !== 'low')
    sessions.set(s.id, { ...had, ...s, words: unionBy(had.words, s.words, x => x),
      ...(translations.length ? { translations } : {}), ...(spokenIds.length ? { spokenIds } : {}), advanced })
  }
  const cards = new Map<string, AppState['cards'][number]>()
  for (const c of [...older.cards, ...newer.cards]) {
    const had = cards.get(c.id)
    if (!had || c.lastDay > had.lastDay || (c.lastDay === had.lastDay && c.due >= had.due)) cards.set(c.id, c)
  }
  const ahead = compareCourse(older.curriculum, newer.curriculum) > 0 ? older : newer
  // A word moved to 還不熟 on one device and still 認得 on the other is on one list only: the later move decides.
  const moved = mergeMoved(readMoved(older.notes), readMoved(newer.notes))
  const words = settleWords(unionBy(older.knownWords, newer.knownWords, w => w),
    unionBy(older.learningWords, newer.learningWords, w => w), moved, newer)
  const notes: Notes = { ...older.notes }
  for (const [k, v] of Object.entries(newer.notes)) notes[k] = k in older.notes ? mergeNote(k, older.notes[k], v, words) : v
  const merged: Notes = {
    ...notes,
    ...mergeCertificates(older.notes, newer.notes),
    ...mergeWeakNotes(older.notes, newer.notes),
  }
  if (memoryNoteKey in notes || memoryDeletedKey in notes || memoryTimesKey in notes)
    Object.assign(merged, mergeMemoryNotes(newer.notes, older.notes))
  if (baselineResultsKey in merged || legacyBaselineKey in merged)
    merged[baselineResultsKey] = JSON.stringify(mergeBaselineResults(older.notes, newer.notes))
  // A box ticked or unticked on the copy changed last keeps that state; boxes only the other copy has stay.
  const checks = { ...older.checks, ...newer.checks }
  // Old review lines folded on either device: the two archives merged day by day; lines from before the merged archive
  // are folded into it (keeping them too would count them twice).
  const events = unionBy(older.reviewEvents, newer.reviewEvents, reviewEventKey)
  const archive = archiveKey in older.notes || archiveKey in newer.notes ? mergeArchives(readArchive(older.notes), readArchive(newer.notes), events) : null
  if (archive) merged[archiveKey] = JSON.stringify(archive)
  const before = archive?.before ?? ''
  return {
    ...newer,
    startedDay: [mine.startedDay, theirs.startedDay].sort()[0],
    school: mergeSchool(older.school, newer.school),
    sessions: [...sessions.values()].sort((a, b) => a.day.localeCompare(b.day)),
    cards: [...cards.values()],
    reviewEvents: events.filter(e => !before || e.day >= before).sort((a, b) => a.day.localeCompare(b.day)),
    curriculum: { ...ahead.curriculum, stableUnits: [...new Set([...mine.curriculum.stableUnits, ...theirs.curriculum.stableUnits])].sort((a, b) => a - b) },
    ...words,
    customWords: unionBy(newer.customWords, older.customWords, w => w.en.toLowerCase()),
    // Flags are cleared one by one in Settings: the copy changed last decides.
    flagged: newer.flagged,
    checks,
    notes: merged,
  }
}
