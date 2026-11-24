import test from 'node:test'
import assert from 'node:assert/strict'
import writing from '../src/data/writing.json'
import { nextTask, suggestedStage, taskOpen, wordCount, writeDue, writeKey, type WriteStage } from '../src/lib/writing'

const stages = writing.stages as WriteStage[]
const graded = stages.filter(s => s.graded)
const done = (...ids: string[]) => Object.fromEntries(ids.map(id => [writeKey(id), JSON.stringify({ day: '2026-11-24', words: 40, tries: 1, best: 5 })]))

test('four graded levels, 20 pieces each, from A1 up, before the old ladder', () => {
  assert.deepEqual(graded.map(s => [s.id, s.level, s.tasks.length]), [['a1', 'A1', 20], ['a1plus', 'A1+', 20], ['a2', 'A2', 20], ['a2plus', 'A2+', 20]])
  assert.deepEqual(stages.map(s => s.id), ['a1', 'a1plus', 'a2', 'sentence', 'a2plus', 'paragraph', 'multi', 'task1', 'task2', 'bridge'])
  const ids = stages.flatMap(s => s.tasks.map(t => t.id))
  assert.equal(new Set(ids).size, ids.length, 'task ids are unique')
})

test('every piece says which grammar unit it needs, and gets longer level by level', () => {
  const range: Record<string, [number, number, number]> = { a1: [1, 6, 20], a1plus: [7, 20, 25], a2: [21, 26, 60], a2plus: [27, 35, 80] }
  for (const s of graded) {
    const [lo, hi, min] = range[s.id]
    for (const t of s.tasks) {
      assert.ok(typeof t.after === 'number' && t.after >= lo && t.after <= hi, t.id + ' opens after unit ' + t.after)
      assert.ok(t.min >= min, t.id + ' length')
      assert.ok(t.starter?.length && t.words?.length, t.id + ' has ways to begin and hint words')
      assert.ok(/[一-鿿]/.test(t.zh), t.id + ' has Chinese instructions')
      assert.ok(wordCount(t.sample) >= t.min, t.id + ' sample reaches the length')
    }
  }
  // The old tasks are kept and placed by the grammar they need.
  for (const s of stages.filter(s => !s.graded && !s.pack)) for (const t of s.tasks) assert.ok(typeof t.after === 'number', t.id)
  assert.equal(stages.find(s => s.id === 'sentence')!.level, 'A2')
})

test('a piece opens only after its grammar unit is finished', () => {
  const first = graded[0].tasks[0]
  assert.equal(first.after, 1)
  assert.equal(taskOpen(first, 1), false, 'still learning unit 1')
  assert.equal(taskOpen(first, 2), true)
  assert.equal(nextTask(stages, {}, 1), null, 'nothing to write before unit 1 is finished')
  assert.equal(suggestedStage(stages, {}, 1), 'a1', 'the page still opens on A1, showing when it opens')
})

test('the next piece follows the course without skipping', () => {
  assert.equal(nextTask(stages, {}, 2)?.task.id, 'a1-01')
  assert.equal(nextTask(stages, done('a1-01'), 2)?.task.id, 'a1-02')
  // Moving ahead in the course does not skip earlier pieces.
  assert.equal(nextTask(stages, done('a1-01'), 9)?.task.id, 'a1-02')
  const allA1 = done(...graded[0].tasks.map(t => t.id))
  assert.equal(nextTask(stages, allA1, 9)?.task.id, 'a1p-01')
  assert.equal(suggestedStage(stages, allA1, 9), 'a1plus')
  // On unit 9, the pieces that need irregular past (unit 9 itself) are still locked; finishing it opens them.
  assert.deepEqual(graded[1].tasks.filter(t => taskOpen(t, 9)).map(t => t.id), ['a1p-01', 'a1p-02'])
  assert.deepEqual(graded[1].tasks.filter(t => taskOpen(t, 10)).map(t => t.id), ['a1p-01', 'a1p-02', 'a1p-03', 'a1p-04'])
})

test('today: writing twice a week, and only when a piece is open', () => {
  assert.equal(writeDue({ write: 0, speak: 0 }, true), true)
  assert.equal(writeDue({ write: 1, speak: 0 }, true), false, 'speak the next day')
  assert.equal(writeDue({ write: 1, speak: 1 }, true), true)
  assert.equal(writeDue({ write: 2, speak: 3 }, true), false, 'two a week is enough')
  assert.equal(writeDue({ write: 0, speak: 0 }, false), false, 'nothing open yet')
})
