// How fast the 7000 words go at the planned pace, worked out day by day with the app's own rules:
// the day plan (dailyPlan.ts), the review boxes and caps (progress.ts: intervals, reviewBudget, reviewEnergy, reviewLoad)
// and the new-word brake (dailyWords.ts). Run: npm run words:pace
// The learner model is an assumption: about 40% of level-1 words unknown (60/80/90% for the higher levels),
// 85% of word cards and 80% of sentence cards recalled, a lesson on every regular and winter day (units 1–48).
// The dates in cefr.ts (wordsBy) and the README come from the first line of output.
import { dayBudget } from '../src/lib/dailyPlan.ts'
import { createInitialState } from '../src/lib/store.ts'
import { addDays, newCard, reviewBudget, reviewCard, reviewEnergy, reviewLoad, sentenceReviewKey, type ReviewCard, type ReviewEvent } from '../src/lib/progress.ts'
import { countKey, dailyTarget } from '../src/lib/dailyWords.ts'

// WORDS=20 npm run words:pace shows the pace for another daily count (one of DAILY_CHOICES); without it, the default.
const perDay = Number(process.env.WORDS) || 0

const settings = createInitialState('2026-11-23').settings
const isDue = (c: ReviewCard, day: string) => c.due <= day && c.lastDay < day
const byDue = (a: ReviewCard, b: ReviewCard) => a.due.localeCompare(b.due)
const unknown = [0, 0.4, 0.6, 0.8, 0.9, 0.9, 0.9]

function run(label: string, sundays: boolean, seed = 7) {
  let r = seed
  const rand = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 2 ** 32 }
  const cards: ReviewCard[] = []
  let events: ReviewEvent[] = []
  let notes: Record<string, string> = perDay ? { [countKey]: String(perDay) } : {}
  let day = '2026-11-23', seen = 0, unit = 1, uday = 1, sid = 0, minutes = 0, studyDays = 0, peak = 0
  const lessonOf = new Map<string, { unit: number; d: number }>()
  const done: string[] = []
  const review = (c: ReviewCard, ok: boolean) => {
    const res = reviewCard(c, day, ok)
    cards[cards.indexOf(c)] = res.card
    if (res.event) events.push(res.event)
  }
  while (seen < 6012 && day < '2032-01-01') {
    const b = dayBudget(day, settings)
    const studies = sundays || !(b.kind === 'rest' || b.kind === 'light')
    events = events.filter(e => e.day >= addDays(day, -1))
    const cap = reviewEnergy(day, settings.periods)
    let words = 0, sentences = 0
    if (studies) {
      for (const c of cards.filter(c => c.id.startsWith('word:') && isDue(c, day)).sort(byDue).slice(0, reviewBudget(cap))) { review(c, rand() < 0.85); words++ }
      if ((b.kind === 'regular' || b.kind === 'winter') && unit <= 48) {
        const ofDay = (d: number) => cards.find(c => { const m = lessonOf.get(c.id); return !!m && m.unit === unit && m.d === d })
        const recall = uday >= 2 && uday <= 4 ? [ofDay(uday - 1)] : uday === 6 ? [ofDay(5)]
          : uday === 5 ? [ofDay(1), ofDay(2), cards.filter(c => !c.id.startsWith('word:') && isDue(c, day) && (lessonOf.get(c.id)?.unit ?? 0) < unit).sort(byDue)[0]] : []
        for (const c of recall) if (c && isDue(c, day)) { review(c, rand() < 0.8); sentences++ }
        for (let i = 0; i < (uday === 6 ? 2 : 1); i++) { const id = 's' + sid++; lessonOf.set(id, { unit, d: uday === 6 ? 6 + i : uday }); cards.push(newCard(id, day)) }
        if (uday <= 5) for (let i = 0; i < (rand() < 0.2 ? 3 : 2); i++) cards.push(newCard('word:lesson-' + sid + '-' + i, day))
        uday++
        if (uday > 6) { uday = 1; unit++ }
      }
      const quota = reviewLoad({ cards, reviewEvents: events, notes }, day, cap).sentences
      for (const c of cards.filter(c => !c.id.startsWith('word:') && isDue(c, day)).sort(byDue).slice(0, quota)) {
        review(c, rand() < 0.8); sentences++
        notes = { ...notes, [sentenceReviewKey(day)]: String((Number(notes[sentenceReviewKey(day)]) || 0) + 1) }
      }
      minutes += words / 5 + sentences; studyDays++
      peak = Math.max(peak, words / 5 + sentences)
    }
    const backlog = reviewLoad({ cards, reviewEvents: events, notes }, day, cap).backlog
    const target = studies ? dailyTarget(notes, b.quiet, day, backlog) : 0
    for (let i = 0; i < target && seen < 6012; i++) {
      const level = Math.floor(seen / 1002) + 1
      if (rand() < unknown[level]) cards.push(newCard('word:' + seen, day))
      else if (rand() < 0.25) cards.push({ id: 'word:' + seen, box: 4, lastDay: day, due: addDays(day, 14), mastered: false })
      seen++
      if (seen % 1002 === 0) done.push('第 ' + seen / 1002 + ' 級 ' + day.slice(0, 7))
    }
    day = addDays(day, 1)
  }
  console.log(label.padEnd(22) + done.join(' · ') + '  ｜複習平均 ' + Math.round(minutes / studyDays) + ' 分鐘，最多約 ' + Math.round(peak) + ' 分鐘')
}

run('每天都開（含週日）', true)
run('週日不開', false)
