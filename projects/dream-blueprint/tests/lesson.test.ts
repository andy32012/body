import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lessonFinished, markLessonStep, readLessonRecord, variationFor, type Lesson } from '../src/lib/lesson.ts'

const lessons = JSON.parse(readFileSync(new URL('../src/data/lessons.json', import.meta.url), 'utf8')) as Lesson[]
const curriculum = JSON.parse(readFileSync(new URL('../src/data/curriculum.json', import.meta.url), 'utf8'))

test('42 個單元都有今天這一堂的內容：目標、對話、兩題聽力、兩個變化、開放題', () => {
  assert.equal(lessons.length, 42)
  for (const l of lessons) {
    const unit = curriculum.units.find((u: { id: number }) => u.id === l.unit)
    assert.equal(unit.cando, l.cando, '單元 ' + l.unit + ' 的目標要和課表一致')
    assert.ok(l.dialogue.length >= 4 && l.dialogue.every(d => d.en && d.zh && d.who), '單元 ' + l.unit + ' 對話')
    assert.equal(l.questions.length, 2)
    for (const q of l.questions) assert.ok(q.options.length === 3 && q.answer >= 0 && q.answer < 3, '單元 ' + l.unit + ' 題目')
    assert.equal(l.variations.length, 2)
    assert.ok(l.prompt.en && l.prompt.zh && l.prompt.sample, '單元 ' + l.unit + ' 開放題')
  }
  assert.ok(lessons[38].prompt.chart?.points.length, '第 39 課要有圖表題')
  assert.deepEqual(lessons[39].prompt.scaffold?.length, 4, '第 40 課要有意見＋理由＋例子＋結論的骨架')
})
test('一堂課的步驟會記下來；換天或換課就重新開始', () => {
  let notes = markLessonStep({}, '2026-11-21', 1, 1, 'listen')
  notes = markLessonStep(notes, '2026-11-21', 1, 1, 'pattern')
  notes = markLessonStep(notes, '2026-11-21', 1, 1, 'pattern')
  assert.deepEqual(readLessonRecord(notes, '2026-11-21')?.steps, ['listen', 'pattern'])
  assert.equal(lessonFinished(notes, '2026-11-21'), false)
  notes = markLessonStep(notes, '2026-11-21', 1, 1, 'done', { corrected: true })
  assert.equal(lessonFinished(notes, '2026-11-21'), true)
  notes = markLessonStep(notes, '2026-11-21', 1, 2, 'listen')
  assert.deepEqual(readLessonRecord(notes, '2026-11-21')?.steps, ['listen'])
  assert.equal(variationFor(lessons[0], 1), lessons[0].variations[0])
  assert.equal(variationFor(lessons[0], 2), lessons[0].variations[1])
  assert.equal(variationFor(lessons[0], 3), lessons[0].variations[0])
})
