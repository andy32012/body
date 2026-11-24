import test from 'node:test'
import assert from 'node:assert/strict'
import { addResult, cefrOf, forms, laterKey, nextForm, readResults, retestInfo, legacyKey, showTestPrompt, testDue, type BaselineResult } from '../src/lib/baseline.ts'

const r = (date: string, form?: 'A' | 'B' | 'C'): BaselineResult => ({ form, date, listening: 2, reading: 3, writing: { text: 'I went to school.', feedback: '大約 CEFR A2 左右' }, speaking: { transcript: '', feedback: '', seconds: 40 } })

test('回測每次換新題本 A→B→C，每份都是聽讀各 3 題', () => {
  for (const f of Object.values(forms)) {
    assert.equal(f.listenQs.length, 3); assert.equal(f.readQs.length, 3)
    for (const q of [...f.listenQs, ...f.readQs]) assert.ok(q.answer >= 0 && q.answer < q.options.length)
  }
  assert.equal(nextForm([]), 'A')
  assert.equal(nextForm([r('2026-11-21', 'A')]), 'B')
  assert.equal(nextForm([r('2026-11-21', 'A'), r('2027-02-13', 'B')]), 'C')
})
test('舊的起點紀錄算題本 A；結果全部保留；12 週後才提醒回測', () => {
  let notes: Record<string, string> = { [legacyKey]: JSON.stringify(r('2026-11-21')) }
  assert.equal(readResults(notes)[0].form, 'A')
  notes = addResult(notes, r('2027-02-13', 'B'))
  assert.deepEqual(readResults(notes).map(x => x.form), ['A', 'B'])
  assert.deepEqual(retestInfo([r('2026-11-21', 'A')], '2026-12-01'), { due: false, date: '2027-02-13', days: 74 })
  assert.equal(retestInfo([r('2026-11-21', 'A')], '2027-02-13').due, true)
  assert.equal(cefrOf('大約 CEFR A2 左右（只是單次小樣本）'), 'A2')
})
test('程度測驗平常不出現，12 週到了才在首頁跳出來；按「今天先不要」當天不再跳', () => {
  const done = addResult({}, r('2026-11-23', 'A'))
  assert.equal(testDue(done, '2026-11-24'), false, '做完起點測驗的隔天：看不到')
  assert.equal(showTestPrompt(done, '2027-02-14'), false, '差一天')
  assert.equal(testDue(done, '2027-02-15'), true, '第 84 天')
  assert.equal(showTestPrompt(done, '2027-02-15'), true)
  const later = { ...done, [laterKey]: '2027-02-15' }
  assert.equal(showTestPrompt(later, '2027-02-15'), false, '今天先不要')
  assert.equal(testDue(later, '2027-02-15'), true, '還是到期：英文練習頁有一列可以進去')
  assert.equal(showTestPrompt(later, '2027-02-16'), true, '隔天再跳一次')
  const retested = addResult(later, r('2027-02-16', 'B'))
  assert.equal(testDue(retested, '2027-02-16'), false, '回測做完就收起來，下次再等 12 週')
  assert.equal(showTestPrompt({}, '2026-11-24'), true, '從來沒測過的新裝置：先做起點測驗')
})
