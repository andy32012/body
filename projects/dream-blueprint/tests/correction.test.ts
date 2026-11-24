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

test('分數不在表上就不給分，判定照 Claude 寫的；沒有評分表的批改照舊', () => {
  const off = parseCorrection(reply({ verdict: 'good', score: 6 }), 'gept-paragraph')
  assert.equal(off?.score, undefined)
  assert.equal(off?.verdict, 'good')
  const plain = parseCorrection(reply({ verdict: 'again', score: 5 }))
  assert.equal(plain?.verdict, 'again')
  assert.equal(plain?.score, undefined)
  assert.equal(parseCorrection('nope', 'gept-translation'), null)
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
