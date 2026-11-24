import test from 'node:test'
import assert from 'node:assert/strict'
import { createInitialState } from '../src/lib/store.ts'
import { getLessonPreview, lesson, sentenceById, units } from '../src/lib/todayLesson.ts'

const day = '2026-12-01'
const at = (unit: number, d: number, retry = 0) => {
  const s = createInitialState('2026-11-24')
  s.curriculum = { ...s.curriculum, unit, day: d, retry }
  return s
}

test('今天的課：照課表位置給那一天的句子', () => {
  const l = lesson(at(1, 1), 'normal', day)
  assert.deepEqual([l.unit, l.day, l.review, l.checkpoint, l.items.map(i => i.id)], [1, 1, false, false, ['u1-d1']])
  assert.equal(l.title, units[0].title)
  assert.deepEqual(getLessonPreview(at(1, 1), 'normal', day), l)
})

test('第六天是小關卡（三句）；要重來時改用備用句', () => {
  assert.deepEqual(lesson(at(2, 6), 'normal', day).items.map(i => i.id), ['u2-c1', 'u2-c2', 'u2-c3'])
  assert.deepEqual(lesson(at(2, 6, 1), 'normal', day).items.map(i => i.id), ['u2-r3', 'u2-r4', 'u2-r5'])
  assert.deepEqual(lesson(at(2, 4, 1), 'normal', day).items.map(i => i.id), ['u2-r1'])
})

test('累爆的日子、考試週、今天已經上過新課：只複習一句，不往前', () => {
  const low = lesson(at(3, 2), 'low', day)
  assert.equal(low.review, true)
  assert.equal(low.items.length, 1)
  assert.equal(low.newWords.length, 0)
  const exam = lesson(at(3, 2), 'normal', '2027-01-05')
  assert.equal(exam.review, true, '期末考週')
  const done = at(3, 2)
  done.sessions.push({ id: 's1', day, energy: 'normal', period: 'semester', sentenceId: 'u3-d1', words: [], advanced: true })
  const again = lesson(done, 'normal', day)
  assert.deepEqual([again.review, again.items[0].id], [true, 'u3-d1'], '複習剛上過的那一句')
})

test('所有句子都查得到 ID：課文、小關卡、備用句、生活主題和開場句', () => {
  for (const id of ['u1-d1', 'u53-c3', 'u53-r5', 't1-p1', 't1-r1', 's-001', 'start-01']) assert.ok(sentenceById.has(id), id)
  assert.equal(units.length >= 53, true)
})
