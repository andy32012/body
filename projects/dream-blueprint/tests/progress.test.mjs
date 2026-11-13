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
test('五格卡片，晉級間隔、同日防刷及曾經學會不可逆', () => {
  let card = newCard('word', '2026-11-01')
  assert.equal(card.due, '2026-11-02')
  for (const gap of [2, 4, 8, 16, 16]) {
    const day = card.due
    const result = reviewCard(card, day, true)
    card = result.card
    assert.equal(daysBetween(day, card.due), gap)
    assert.equal(reviewCard(card, day, true).event, null)
  }
  assert.equal(card.mastered, true)
  const forgotten = reviewCard(card, card.due, false)
  assert.equal(forgotten.card.box, 1)
  assert.equal(forgotten.card.mastered, true)
  assert.equal(daysBetween(forgotten.card.lastDay, forgotten.card.due), 1)
  assert.equal(
    reviewCard(forgotten.card, forgotten.card.due, true, true).card.box,
    1,
  )
})
test('每日複習有上限，未到期的卡片不出現', () => {
  const cards = Array.from({ length: 15 }, (_, i) =>
    newCard(String(i), '2026-11-01'),
  )
  assert.equal(dueCards(cards, '2026-11-01', 'high').length, 0)
  assert.deepEqual(
    ['low', 'normal', 'high'].map(
      (e) => dueCards(cards, '2026-11-02', e).length,
    ),
    [1, 5, 10],
  )
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
