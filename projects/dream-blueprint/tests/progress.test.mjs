import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dayKey,
  addDays,
  daysBetween,
  weekKey,
  activePeriod,
  newCard,
  reviewCard,
  dueCards,
  workloadDecision,
  practiceDays,
  attendance,
  reviewBonus,
  wordForecast,
  recentRecall,
} from '../src/lib/progress.ts'

test('手機當地四點換日、週一四點換週，能跨月與跨年', () => {
  const before = dayKey(new Date(2027, 0, 4, 3, 59))
  const after = dayKey(new Date(2027, 0, 4, 4, 0))
  assert.equal(before, '2027-01-03')
  assert.equal(weekKey(before), '2026-12-28')
  assert.equal(weekKey(after), '2027-01-04')
  assert.equal(dayKey(new Date(2027, 0, 1, 2)), '2026-12-31')
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2)
})
test('時期含起訖日，日期重疊時以考週和實習優先', () => {
  const ranges = [
    { type: 'vacation', start: '2027-01-01', end: '2027-01-31' },
    { type: 'internship', start: '2027-01-10', end: '2027-01-20' },
    { type: 'exam', start: '2027-01-14', end: '2027-01-16' },
  ]
  assert.deepEqual(
    [
      '2027-01-09',
      '2027-01-10',
      '2027-01-14',
      '2027-01-16',
      '2027-01-17',
      '2027-01-21',
      '2027-02-01',
    ].map((d) => activePeriod(d, ranges)),
    [
      'vacation',
      'internship',
      'exam',
      'exam',
      'internship',
      'vacation',
      'semester',
    ],
  )
})
test('FSRS 排程：記得就越拉越長（最長 365 天）、忘了不從零開始、同日防刷', () => {
  let card = newCard('word', '2026-11-01')
  assert.equal(card.due, '2026-11-02')
  const gaps = []
  for (let i = 0; i < 9; i++) {
    const day = card.due
    const result = reviewCard(card, day, true)
    card = result.card
    gaps.push(daysBetween(day, card.due))
    assert.equal(reviewCard(card, day, true).event, null, '同一天再按不算')
  }
  assert.deepEqual(gaps, [2, 6, 17, 44, 102, 220, 365, 365, 365], '新卡是不會的字，第一次記得先隔兩天，之後一路拉長')
  assert.equal(card.box, 10)
  assert.equal(card.mastered, true)
  assert.ok(card.s > 365 && card.d >= 1 && card.d <= 10, '記憶狀態存在卡片上')
  const forgotten = reviewCard(card, card.due, false)
  const back = daysBetween(forgotten.card.lastDay, forgotten.card.due)
  assert.ok(back > 1 && back < 30, '一年後忘了，退回幾天後再看，不是從一天重來：' + back)
  assert.equal(forgotten.card.mastered, true)
  let young = reviewCard(newCard('w2', '2026-11-01'), '2026-11-02', true).card
  young = reviewCard(young, young.due, false).card
  assert.equal(daysBetween(young.lastDay, young.due), 1, '剛學的字忘了，明天再看')
  assert.equal(young.box, 1)
  const seen = reviewCard(young, young.due, true, true).card
  assert.equal(daysBetween(seen.lastDay, seen.due), 1, '看了答案算忘記')
  // A small mistake (Hard) still climbs, but more slowly than a clean recall.
  const hard = reviewCard(newCard('u1-d1', '2026-11-01'), '2026-11-02', false, false, 2).card
  const good = reviewCard(newCard('u1-d2', '2026-11-01'), '2026-11-02', true).card
  assert.ok(daysBetween(hard.lastDay, hard.due) <= daysBetween(good.lastDay, good.due))
  // A card from the old shelves keeps its interval as the starting point.
  const old = { id: 'word:x', box: 6, lastDay: '2026-10-01', due: '2026-10-31', mastered: true }
  const kept = reviewCard(old, '2026-11-02', true).card
  assert.ok(daysBetween(kept.lastDay, kept.due) > 30, '舊的 30 天卡記得了，間隔比 30 天長')
})
test('單字預估：接下來幾天每天要複習幾張，和最近兩週記得幾成', () => {
  const cards = [
    { id: 'word:a', box: 1, lastDay: '2026-11-20', due: '2026-11-21', mastered: false },
    { id: 'word:b', box: 2, lastDay: '2026-11-22', due: '2026-11-24', mastered: false },
    { id: 'word:c', box: 3, lastDay: '2026-11-22', due: '2026-11-26', mastered: false },
    { id: 'u1-d1', box: 1, lastDay: '2026-11-22', due: '2026-11-24', mastered: false },
  ]
  assert.deepEqual(wordForecast(cards, '2026-11-24', 4), [2, 0, 1, 0], '今天含過期的，句子卡不算')
  const events = [
    { id: 'word:a', day: '2026-11-20', gap: 4, remembered: true, shownAnswer: false },
    { id: 'word:b', day: '2026-11-21', gap: 4, remembered: false, shownAnswer: false },
    { id: 'word:b', day: '2026-11-21', gap: 4, remembered: false, shownAnswer: false },
    { id: 'word:c', day: '2026-11-22', gap: 1, remembered: false, shownAnswer: false },
    { id: 'word:d', day: '2026-10-01', gap: 8, remembered: false, shownAnswer: false },
  ]
  assert.deepEqual(recentRecall(events, '2026-11-24'), { n: 2, rate: 0.5 }, '同一天同一張只算一次；隔一天的和太久以前的不算')
})
test('每日複習依時間分配，未到期的卡片不出現', () => {
  const cards = Array.from({ length: 100 }, (_, i) =>
    newCard(String(i), '2026-11-01'),
  )
  assert.equal(dueCards(cards, '2026-11-01', 'high').length, 0)
  assert.deepEqual(
    ['low', 'normal', 'high'].map(
      (e) => dueCards(cards, '2026-11-02', e).length,
    ),
    [50, 100, 100],
  )
  const more = Array.from({ length: 140 }, (_, i) => newCard(String(i), '2026-11-01'))
  assert.equal(dueCards(more, '2026-11-02', 'high').length, 125)
})
const day = '2026-11-23'
const sessions = [0, 3, 8, 10].map((n) => ({
  day: addDays(day, -n),
  energy: 'normal',
  feedback: 'right',
}))
const events = Array.from({ length: 10 }, (_, i) => ({
  id: String(i),
  day,
  gap: 4,
  remembered: i < 7,
  shownAnswer: false,
}))
const base = {
  day,
  startedDay: addDays(day, -14),
  period: 'semester',
  sessions,
  events,
}
test('四條加量條件和休戰限制', () => {
  assert.equal(workloadDecision(base), 'offer')
  for (const variant of [
    { startedDay: addDays(day, -13) },
    { period: 'exam' },
    { period: 'internship' },
    { lastAssessment: addDays(day, -10) },
    { sessions: sessions.slice(0, 3) },
    { events: events.map((e) => ({ ...e, gap: 3 })) },
    { events: events.map((e) => ({ ...e, shownAnswer: true })) },
    {
      sessions: sessions.map((s, i) => ({
        ...s,
        feedback: i === 0 ? 'much' : 'right',
      })),
    },
    {
      events: events
        .concat(...Array(10).fill(events[0]))
        .map((e) => (e.id === '6' ? { ...e, remembered: false } : e)),
    },
  ])
    assert.equal(workloadDecision({ ...base, ...variant }), 'keep')
  assert.notEqual(
    workloadDecision({
      ...base,
      sessions: Array.from({ length: 5 }, (_, i) => ({
        day: addDays(day, -i),
        energy: 'low',
      })),
    }),
    'offer',
  )
})
test('一週內兩天回報太多或兩週各低於兩天自動減量，已處理不重複減', () => {
  const heavy = sessions.map((s, i) => ({
    ...s,
    feedback: i < 2 ? 'much' : 'right',
  }))
  assert.equal(workloadDecision({ ...base, sessions: heavy }), 'reduce')
  assert.equal(
    workloadDecision({ ...base, sessions: heavy, lastReduction: day }),
    'keep',
  )
  assert.equal(workloadDecision({ ...base, sessions: [] }), 'reduce')
})
test('相同日期只算一天，考週與休息日保留連續紀錄，請假卡上限兩張', () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({
    day: addDays('2026-11-01', i),
  }))
  assert.equal(practiceDays([...rows, rows[0]]), 21)
  const protectedDays = [
    { type: 'exam', start: '2026-11-23', end: '2026-11-24' },
  ]
  assert.deepEqual(attendance(rows, '2026-11-25', [0], protectedDays), {
    cumulative: 21,
    leave: 2,
    streak: 21,
  })
  assert.deepEqual(attendance(rows, '2026-11-28', [0], protectedDays), {
    cumulative: 21,
    leave: 0,
    streak: 0,
  })
})
test('延遲複習加分有每日上限，看答案、同日重刷不加分', () => {
  assert.equal(reviewBonus([...events, events[0]], day), 10)
  assert.equal(
    reviewBonus(
      [
        events[0],
        events[0],
        { ...events[1], shownAnswer: true },
        { ...events[2], gap: 0 },
      ],
      day,
    ),
    2,
  )
})
