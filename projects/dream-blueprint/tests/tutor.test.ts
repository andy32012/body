import test from 'node:test'
import assert from 'node:assert/strict'
import curriculum from '../src/data/curriculum.json'
import { tutorSystem, verdictOf } from '../src/lib/tutor'

test('tutor prompt carries the sentence, rules and verdict format', () => {
  const s = curriculum.units[0].days[3]
  const prompt = tutorSystem(s, [])
  assert.ok(prompt.includes(s.zh))
  assert.ok(prompt.includes(s.reference[0]))
  assert.ok(prompt.includes('不要先給答案'))
  assert.ok(prompt.includes('判定：對了'))
})

test('verdict line is read from the reply', () => {
  assert.equal(verdictOf('很好\n判定：對了'), 'good')
  assert.equal(verdictOf('判定：小錯'), 'small')
  assert.equal(verdictOf('判定： 再試一次'), 'again')
  assert.equal(verdictOf('沒有判定'), null)
})
