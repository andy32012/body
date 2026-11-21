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
  assert.ok(matchesReference("He doesn't drink tea", ['He does not drink tea.']))
})
test('變化句、表達題、小關卡的判定', () => {
  assert.equal(judgeVariation('good', 'I am not a doctor. I am a nurse.', 'I am not a doctor. I am a nurse.'), 'independent')
  assert.equal(judgeVariation('good', "I'm not a doctor, I'm a nurse", 'I am not a doctor. I am a nurse.'), 'independent')
  assert.equal(judgeVariation('good', 'No doctor, nurse.', 'I am not a doctor. I am a nurse.'), 'pending')
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
