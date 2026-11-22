import test from 'node:test'
import assert from 'node:assert/strict'
import { addEvidence, bestLevel, judgeCheckpoint, judgeExpress, judgeVariation, judgeWritten, matchesReference, readEvidence, setEvidenceLevel } from '../src/lib/evidence.ts'

const refs = ['I am a nursing student.', "I'm a nursing student."]

test('完成和學會分開：看提示＝在協助下完成；沒人確認的「對了」＝答案待確認', () => {
  assert.equal(judgeWritten({ rating: 'correct', revealed: true, answer: 'I am a nursing student.', references: refs }), 'assisted')
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: "i'm a nursing student", references: refs }), 'independent')
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: 'I study nursing.', references: refs }), 'pending')
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: 'I study nursing.', references: refs, firstVerdict: 'good' }), 'independent')
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: 'I study nursing.', references: refs, firstVerdict: 'small' }), 'assisted')
  assert.equal(judgeWritten({ rating: 'minor', revealed: false, answer: 'x', references: refs }), 'assisted')
  assert.equal(judgeWritten({ rating: 'again', revealed: true, answer: '', references: refs }), null)
  // 未作答：空白就算按了「對了」或「小錯」，也不留下任何紀錄。
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: '   ', references: refs }), null)
  assert.equal(judgeWritten({ rating: 'minor', revealed: false, answer: '', references: refs, firstVerdict: 'good' }), null)
  assert.ok(matchesReference("He doesn't drink tea", ['He does not drink tea.']))
})
test('變化句、表達題、小關卡的判定', () => {
  assert.equal(judgeVariation('good', 'I am not a doctor. I am a nurse.', 'I am not a doctor. I am a nurse.'), 'independent')
  assert.equal(judgeVariation('good', "I'm not a doctor, I'm a nurse", 'I am not a doctor. I am a nurse.'), 'independent')
  assert.equal(judgeVariation('good', 'No doctor, nurse.', 'I am not a doctor. I am a nurse.'), 'pending')
  assert.equal(judgeVariation('good', '', 'I am not a doctor. I am a nurse.'), null)
  assert.equal(judgeExpress({ firstVerdict: 'good', help: ['zh'], answered: true }), 'independent')
  assert.equal(judgeExpress({ firstVerdict: 'good', help: ['frame'], answered: true }), 'assisted')
  assert.equal(judgeExpress({ help: [], answered: true }), 'pending')
  assert.equal(judgeCheckpoint(['independent', 'independent', 'assisted']), 'delayed')
  assert.equal(judgeCheckpoint(['independent', 'assisted', 'assisted']), 'assisted')
  assert.equal(judgeCheckpoint(['independent', 'pending', 'again' as never]), 'pending')
})
test('紀錄：同一天同一來源只留一筆；確認後清掉答案；寫和聽分開算最好的一次', () => {
  let notes = addEvidence({}, 1, { day: '2026-11-21', level: 'pending', source: 'pattern', skill: 'write', item: 'u1-d1', answer: 'I study nursing.' })
  notes = addEvidence(notes, 1, { day: '2026-11-21', level: 'pending', source: 'pattern', skill: 'write', item: 'u1-d1', answer: 'I study nursing.' })
  notes = addEvidence(notes, 1, { day: '2026-11-21', level: 'assisted', source: 'listen', skill: 'listen' })
  assert.equal(readEvidence(notes, 1).length, 2)
  notes = setEvidenceLevel(notes, 1, 0, 'independent')
  assert.equal(readEvidence(notes, 1)[0].answer, undefined)
  assert.equal(bestLevel(readEvidence(notes, 1), 'write'), 'independent')
  assert.equal(bestLevel(readEvidence(notes, 1), 'listen'), 'assisted')
})

test('中翻英回饋：意思變了是第四種判定；跟參考句比對只標出不一樣的地方', async () => {
  const { verdictOf } = await import('../src/lib/tutor.ts')
  const { compareWithReference } = await import('../src/lib/evidence.ts')
  assert.equal(verdictOf('你寫成退款了，題目是換貨。\n判定：意思不同'), 'changed')
  assert.equal(verdictOf('判定：對了'), 'good')
  // 意思變了，就算之後改對也不是當次獨立完成。
  assert.equal(judgeWritten({ rating: 'correct', revealed: false, answer: "I'd like a refund.", references: ['Could I exchange this for a bigger size?'], firstVerdict: 'changed' }), 'assisted')
  const d = compareWithReference('I wake up at seven.', ['I get up at seven.', "I get up at seven o'clock."])!
  assert.equal(d.same, false)
  assert.deepEqual(d.words.filter(w => w.extra).map(w => w.w), ['wake'])
  assert.deepEqual(d.missing, ['get'])
  assert.equal(compareWithReference("I'm a nursing student", ['I am a nursing student.'])!.same, true)
})
