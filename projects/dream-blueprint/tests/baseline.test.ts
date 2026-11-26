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

test('程度測驗的 Claude 回饋要照格式才存；失敗的之後可以補批，補在原來那一次（審核 R015）', async () => {
  const { writingFeedbackOk, speakingFeedbackOk, setResultFeedback, addResult, readResults } = await import('../src/lib/baseline.ts')
  assert.equal(writingFeedbackOk('大約 CEFR A2 左右（只是單次小樣本，不是正式程度）\n好：有用連接詞\n好：句子完整\n改：時態'), true)
  assert.equal(writingFeedbackOk(''), false, '空白')
  assert.equal(writingFeedbackOk('寫得不錯！'), false, '沒有 CEFR 那一行和重點')
  assert.equal(speakingFeedbackOk('只看逐字稿：發音、流暢度和停頓沒有評估\n好：回答完整\n改：過去式'), true)
  assert.equal(speakingFeedbackOk('大約 B1'), false, '口說不給等級，也要有固定第一行')
  const r = (date: string, form: 'A' | 'B') => ({ form, date, listening: 2, reading: 3, writing: { text: 'I like my job.', feedback: '' }, speaking: { transcript: 'I am a nurse.', feedback: '', seconds: 40 } })
  let notes = addResult(addResult({}, r('2026-08-01', 'A')), r('2026-11-26', 'B'))
  notes = setResultFeedback(notes, { date: '2026-11-26', form: 'B' }, 'writing', '大約 CEFR A2 左右\n好\n改')
  const list = readResults(notes)
  assert.equal(list[1].writing.feedback, '大約 CEFR A2 左右\n好\n改', '補在這一次')
  assert.equal(list[0].writing.feedback, '', '別次不動')
  assert.equal(list[1].writing.text, 'I like my job.', '原來的作品留著')
  assert.equal(setResultFeedback(notes, { date: '2026-01-01', form: 'C' }, 'writing', 'x'), notes, '找不到那一次就不動')
})
