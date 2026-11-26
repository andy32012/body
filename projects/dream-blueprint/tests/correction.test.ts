import test from 'node:test'
import assert from 'node:assert/strict'
import { correctionPrompt, parseCorrection } from '../src/lib/correction.ts'

const reply = (o: object) => JSON.stringify({ corrected: 'I am a nurse.', fixes: [], ...o })

test('批改照評分表：判定跟著分數，最高一級才算全對', () => {
  assert.deepEqual(parseCorrection(reply({ verdict: 'good', score: 4, reason: '符合第 4 級' }), 'gept-translation')?.verdict, 'small')
  const top = parseCorrection(reply({ verdict: 'small', score: 5, reason: '幾乎沒錯' }), 'gept-translation')
  assert.equal(top?.verdict, 'good')
  assert.equal(top?.score, 5)
  assert.equal(top?.reason, '幾乎沒錯')
  assert.equal(top?.rubric, 'gept-translation')
  assert.equal(parseCorrection(reply({ verdict: 'changed', score: 2 }), 'gept-translation')?.verdict, 'changed')
  assert.equal(parseCorrection(reply({ verdict: 'good', score: 1 }), 'gept-sentence')?.verdict, 'small', '造句 1 分是小錯')
})

test('分數不在表上、沒給分：那一次不算判定（不會留下「全對」），可以再批一次；沒有評分表的批改照舊（稽核 LIT-02）', () => {
  assert.equal(parseCorrection(reply({ verdict: 'good', score: 6 }), 'gept-paragraph'), null, '6 分不在表上')
  assert.equal(parseCorrection(reply({ verdict: 'good' }), 'gept-translation'), null, '沒給分')
  assert.equal(parseCorrection(reply({ verdict: 'good', score: 3.8 }), 'gept-translation'), null, '表上沒有 3.8')
  const plain = parseCorrection(reply({ verdict: 'again', score: 5 }))
  assert.equal(plain?.verdict, 'again')
  assert.equal(plain?.score, undefined)
  assert.equal(parseCorrection(reply({ verdict: 'perfect' })), null, '沒有評分表時，判定一定要是四種之一')
  assert.equal(parseCorrection('nope', 'gept-translation'), null)
})

test('Claude 說意思不一樣，分數卻給最高：還是意思不一樣，不會變成全對（稽核 LIT-02）', () => {
  assert.equal(parseCorrection(reply({ verdict: 'changed', score: 5 }), 'gept-translation')?.verdict, 'changed')
  assert.equal(parseCorrection(reply({ verdict: 'changed', score: 2 }), 'gept-sentence')?.verdict, 'changed')
})

test('批改裡格式不對的修正（null、物件當原因）不會讓批改區壞掉：只留看得懂的（稽核 LIT-03）', () => {
  const r = parseCorrection(JSON.stringify({ corrected: 'I am a nurse.', verdict: 'small', score: 4, fixes: [null, { right: 'a', why: {} }, { wrong: 'am nurse', right: 'am a nurse', why: '要加 a', zh: 7 }, { wrong: 'x' }, 'text'], note: { x: 1 }, resolved: [0, -1, 'a', 1.5] }), 'gept-translation')
  assert.ok(r)
  assert.deepEqual(r.fixes, [{ wrong: '', right: 'a', why: '' }, { wrong: 'am nurse', right: 'am a nurse', why: '要加 a' }])
  assert.equal(r.note, undefined)
  assert.deepEqual(r.resolved, [0])
})

test('給 Claude 的批改說明帶著整張評分表和 score 欄位', () => {
  const p = correctionPrompt('我是護理師。', 'I am a nurse.', undefined, 'translate', undefined, 'gept-translation')
  assert.ok(p.includes('全民英檢中級寫作・中譯英'))
  assert.ok(p.includes('5：完整譯出原文的意思'))
  assert.ok(p.includes('"score"'))
  assert.match(p, /verdict 要跟分數一致/)
  const none = correctionPrompt('我是護理師。', 'I am a nurse.')
  assert.ok(!none.includes('"score"'))
  assert.ok(!none.includes('評分表'))
})
