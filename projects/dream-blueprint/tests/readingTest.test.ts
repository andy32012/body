import test from 'node:test'
import assert from 'node:assert/strict'
import { levelTarget, readKey, readLevelsOpen, readStepKey, readStepProgress, readSteps, suggestedLevel, type ReadExtra, type ReadPassage, type ReadStep } from '../src/lib/reading.ts'

/** 閱讀測驗 = the graded reading with the past-exam passages put into the same levels and bands (A1 into A1, B1 into B1). */
const makePassages = (step: ReadStep, count = 12): ReadPassage[] => Array.from({ length: count }, (_, i) => ({ id: 'g-' + readStepKey(step) + '-' + i, ...step, title: 'Example', topic: '測試', paras: ['A nurse is here.'], words: 4, zh: '有一位護理師。', qs: [{ type: 'detail', q: 'Who is here?', options: ['A nurse', 'A student', 'A cook'], answer: 0, why: '文章寫有護理師。', evidence: 'A nurse is here.' }] }))
const extras = (step: ReadStep, count: number, mark: (i: number) => Partial<ReadExtra> = () => ({})): ReadExtra[] =>
  Array.from({ length: count }, (_, i) => ({ id: 'e-' + readStepKey(step) + '-' + i, ...step, recorded: false, passed: false, ...mark(i) }))
const examPassages = (step: ReadStep, count: number) => Array.from({ length: count }, (_, i) => ({ id: 'ex-test-' + readStepKey(step) + '-' + i, ...step, kind: 'cap' as const, source: '113 會考', exam: '國中教育會考', first: i + 1, last: i + 1, words: 4, paras: ['A nurse is here.'], qs: [{ n: i + 1, q: 'Who is here?', options: ['A nurse', 'A cook', 'A student', 'A dog'], answer: 0 }] }))
const passedRead = JSON.stringify({ day: '2026-11-24', picks: [0], correct: 1, total: 1, tries: 1 })
const graded = readSteps.flatMap(s => makePassages(s))
const a1Easy = { level: 'A1', band: 'easy' } as const

test('考古題的過關算進打開下一小級，但門檻篇數照原本閱讀理解的數字，不會因為文章變多就要讀更多篇', () => {
  const extra = extras(a1Easy, 30, i => i < 4 ? { recorded: true, passed: true, day: '2026-11-24' } : {})
  const progress = readStepProgress(graded, a1Easy, {}, extra)
  assert.equal(progress.target, levelTarget(12), '門檻還是 12 篇要過 10 篇')
  assert.equal(progress.total, 42, '這一小級現在有 12 + 30 篇')
  assert.equal(progress.ok, 4, '考古題過了 4 篇')
  const notes = Object.fromEntries(graded.filter(p => p.level === 'A1' && p.band === 'easy').slice(0, 6).map(p => [readKey(p.id), passedRead]))
  assert.equal(readLevelsOpen(graded, notes)['A1-mid'], false, '只算閱讀理解的 6 篇還不夠')
  assert.equal(readLevelsOpen(graded, notes, extra)['A1-mid'], true, '加上考古題 4 篇，過 10 篇就打開 A1 中等')
  assert.deepEqual(suggestedLevel(graded, notes, extra), { level: 'A1', band: 'mid' }, '建議也跟著往前')
})

test('考古題以前讀過的小級不會因為合併鎖起來：讀過的那一小級和它前面都開著', () => {
  const extra = extras({ level: 'B1', band: 'mid' }, 3, i => i === 0 ? { recorded: true, passed: false, day: '2026-11-20' } : {})
  const open = readLevelsOpen(graded, {}, extra)
  for (const s of readSteps.slice(0, 8)) assert.equal(open[readStepKey(s)], true, readStepKey(s) + ' 開著')
  assert.equal(open['B1-hard'], false, '讀過不等於過關，後面那一小級還沒打開')
  assert.equal(readLevelsOpen(graded, {})['A1-mid'], false, '沒有考古題紀錄時照原本的規則')
})

test('下一篇：沒讀過的先，閱讀理解和考古題輪流出（閱讀理解先）；略過的不再排；閱讀理解都過了就接著出考古題', async () => {
  const { nextInBand } = await import('../src/lib/readingTest.ts')
  const { saveExamRead } = await import('../src/lib/examReading.ts')
  const g = makePassages(a1Easy, 2)
  const e = examPassages(a1Easy, 3)
  let notes: Record<string, string> = {}
  assert.deepEqual(nextInBand(g, e, a1Easy, notes), { kind: 'graded', id: g[0].id }, '先出閱讀理解')
  notes = { ...notes, [readKey(g[0].id)]: passedRead }
  assert.deepEqual(nextInBand(g, e, a1Easy, notes), { kind: 'exam', id: e[0].id }, '讀了一篇閱讀理解，換考古題')
  notes = saveExamRead(notes, e[0].id, { day: '2026-11-24', picks: [0], correct: 1, total: 1 })
  assert.deepEqual(nextInBand(g, e, a1Easy, notes), { kind: 'graded', id: g[1].id }, '再換回閱讀理解')
  assert.deepEqual(nextInBand(g, e, a1Easy, notes, [g[1].id]), { kind: 'exam', id: e[1].id }, '略過的那篇不排，改出還沒讀的考古題')
  notes = { ...notes, [readKey(g[1].id)]: passedRead }
  assert.deepEqual(nextInBand(g, e, a1Easy, notes), { kind: 'exam', id: e[1].id }, '閱讀理解都過了，接著出沒讀過的考古題')
  assert.equal(nextInBand(g, e, a1Easy, notes, [...g, ...e].map(p => p.id)), null, '整個小級都略過了才沒有下一篇')
  assert.equal(nextInBand(g, e, { level: 'A2', band: 'easy' }, notes)?.id.includes('A2') ?? true, true, '不會偷換到別的小級')
})

test('下一篇：都讀過以後，先出還沒過關的、讀得最久以前的那篇，不管是哪一種', async () => {
  const { nextInBand } = await import('../src/lib/readingTest.ts')
  const { saveExamRead } = await import('../src/lib/examReading.ts')
  const g = makePassages(a1Easy, 1)
  const e = examPassages(a1Easy, 2)
  let notes: Record<string, string> = { [readKey(g[0].id)]: JSON.stringify({ day: '2026-11-22', picks: [1], correct: 0, total: 1, tries: 1 }) }
  notes = saveExamRead(notes, e[0].id, { day: '2026-11-20', picks: [1], correct: 0, total: 1 })
  notes = saveExamRead(notes, e[1].id, { day: '2026-11-23', picks: [0], correct: 1, total: 1 })
  assert.deepEqual(nextInBand(g, e, a1Easy, notes), { kind: 'exam', id: e[0].id }, '11/20 讀的考古題最久以前，還沒過關')
  notes = saveExamRead(notes, e[0].id, { day: '2026-11-25', picks: [0], correct: 1, total: 1 })
  assert.deepEqual(nextInBand(g, e, a1Easy, notes), { kind: 'graded', id: g[0].id }, '剩下沒過關的是閱讀理解那篇')
})

test('考古題變成小級裡的一篇：有紀錄就算讀過，七成以上就算過關', async () => {
  const { examExtras } = await import('../src/lib/readingTest.ts')
  const { saveExamRead } = await import('../src/lib/examReading.ts')
  const e = examPassages(a1Easy, 2)
  const notes = saveExamRead({}, e[0].id, { day: '2026-11-24', picks: [0, 1, 2], correct: 2, total: 3 })
  assert.deepEqual(examExtras(e, notes), [
    { id: e[0].id, level: 'A1', band: 'easy', recorded: true, passed: false, day: '2026-11-24' },
    { id: e[1].id, level: 'A1', band: 'easy', recorded: false, passed: false },
  ])
})

test('填空題的格子照文章裡的順序從 1 開始編號（不用原卷的題號），要看圖的格子也照順序編', async () => {
  const { blankNumbers } = await import('../src/lib/examReading.ts')
  const numbers = blankNumbers({ paras: ['People {{41}} here. They {{42}} it.', 'Then {{44}} came, and {{43}} left.'] })
  assert.deepEqual([...numbers.entries()], [[41, 1], [42, 2], [44, 3], [43, 4]])
  assert.equal(blankNumbers({ paras: ['No blanks.'] }).size, 0)
})

test('點字「問 Claude 老師」：老師先問他知不知道這個字在文章裡的意思，等他回答再講', async () => {
  const { wordQuestion } = await import('../src/lib/taskContext.ts')
  assert.equal(wordQuestion('penguins'), '我想問這篇文章裡的「penguins」。你先問我知不知道它在這裡是什麼意思，等我回答了再跟我說對不對、怎麼用。')
})

test('換到建議的小級時，往上說「升到」，往回（先把前面還沒過關的讀完）不說升級', async () => {
  const { moveNote } = await import('../src/lib/reading.ts')
  assert.equal(moveNote({ level: 'A1', band: 'easy' }, { level: 'A1', band: 'mid' }), '前面這一小級過關的篇數夠了，升到 A1 中等。想留在原本的小級多讀幾篇，按上面的按鈕就好。')
  assert.equal(moveNote({ level: 'A2', band: 'easy' }, { level: 'A1', band: 'easy' }), '接下來從還沒過關的 A1 簡單讀起，一小級一小級往上。想留在 A2 簡單，按上面的按鈕就好。')
})
