import test from 'node:test'
import assert from 'node:assert/strict'
import { answerAllowed, claudeUsable } from '../src/lib/answerGate'
import { FULL_ASK, chatTurns, correctionSystem, hintGivesAway, parseCorrection, stageFor } from '../src/lib/correction'
import { parseFeedback } from '../src/lib/writing'
import { judgeVariation } from '../src/lib/evidence'

test('a model answer shows only when Claude cannot teach, and only after one try', () => {
  const usable = claudeUsable({ keyed: true, online: true, failed: false })
  assert.equal(usable, true)
  assert.equal(answerAllowed(usable, true), false, 'Claude can teach: no reference, even after trying')
  for (const down of [{ keyed: false, online: true, failed: false }, { keyed: true, online: false, failed: false }, { keyed: true, online: true, failed: true }]) {
    const u = claudeUsable(down)
    assert.equal(u, false)
    assert.equal(answerAllowed(u, false), false, 'not before trying once')
    assert.equal(answerAllowed(u, true), true)
  }
})

test('opening the answer yourself is never "done alone", even if you then copy it exactly', () => {
  assert.equal(judgeVariation('good', 'She is a nurse.', 'She is a nurse.', {}), 'independent')
  assert.equal(judgeVariation('good', 'She is a nurse.', 'She is a nurse.', { revealed: true }), 'assisted')
})

test('checks give hints twice, then the full correction', () => {
  assert.deepEqual([1, 2, 3, 4].map(n => stageFor(n, true)), ['hint1', 'hint2', 'full', 'full'])
  assert.equal(stageFor(1, false), 'full')
})

test('a hint check never asks for the corrected text and keeps the learner rules', () => {
  const hint = correctionSystem({ zh: '我是學生。', reference: 'I am a student.', stage: 'hint1', learned: ['他學過什麼：', '- 已經上完的文法單元：be 動詞現在式'] })
  assert.match(hint, /不要寫出正確的英文/)
  assert.match(hint, /只說錯的類型和大概位置/)
  assert.match(hint, /沒學過的字或文法（learned false）：hint 直接用繁體中文簡單教/)
  assert.match(hint, /不要改成更難的寫法/)
  assert.match(hint, /be 動詞現在式/)
  assert.ok(hint.indexOf('"hint"') < hint.indexOf('"corrected"'), 'the first reply is the hint format; the full one is only for 看完整批改')
  assert.match(correctionSystem({ zh: 'x', stage: 'hint2' }), /說清楚一點/)
  assert.ok(!correctionSystem({ zh: 'x', stage: 'full' }).includes('"hint"'))
})

test('a hint reply that slips in the answer is cut back to the hint', () => {
  const r = parseCorrection(JSON.stringify({ verdict: 'small', corrected: 'I am a student.', fixes: [{ wrong: 'I student', right: 'I am a student', type: 'be 動詞', hint: '這裡少了一個字', learned: true }] }), 'hint1')!
  assert.equal(r.partial, true)
  assert.equal(r.corrected, '')
  assert.equal(r.fixes[0].right, undefined)
  assert.equal(r.fixes[0].hint, '這裡少了一個字')
  assert.equal(r.fixes[0].learned, true)
  const full = parseCorrection(JSON.stringify({ verdict: 'small', corrected: 'I am a student.', fixes: [{ wrong: 'I student', right: 'I am a student', why: 'be' }] }), 'full')!
  assert.equal(full.partial, undefined)
  assert.equal(full.fixes[0].right, 'I am a student')
  assert.ok(hintGivesAway('答案是 I am a student.', ['I am a student.']))
  assert.ok(!hintGivesAway('主詞後面少了一個字', ['I am a student.']))
})

test('the request for the full correction is not shown as chat', () => {
  const turns = [{ role: 'user', content: '為什麼？' }, { role: 'assistant', content: '因為…' }, { role: 'user', content: FULL_ASK }, { role: 'assistant', content: '{"verdict":"small"}' }]
  assert.deepEqual(chatTurns(turns).map(t => t.content), ['為什麼？', '因為…'])
})

test('writing ladder: a hint check keeps scores but drops right answers and the revised text', () => {
  const criteria = ['文法正確', '內容完整']
  const reply = JSON.stringify({ criteria: [{ name: '文法正確', score: 3, comment: '時態再看一下' }, { name: '內容完整', score: 4, comment: '好' }], summary: 's', next: 'n',
    fixes: [{ wrong: 'I go yesterday', right: 'I went yesterday', type: '時態', hint: '昨天的事', learned: true }], revised: 'I went yesterday.' })
  const hint = parseFeedback(reply, criteria, false, true)!
  assert.equal(hint.partial, true)
  assert.equal(hint.revised, undefined)
  assert.equal(hint.fixes[0].right, undefined)
  assert.equal(hint.fixes[0].hint, '昨天的事')
  const full = parseFeedback(reply, criteria, false)!
  assert.equal(full.revised, 'I went yesterday.')
  assert.equal(full.fixes[0].right, 'I went yesterday')
})
