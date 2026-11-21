import test from 'node:test'
import assert from 'node:assert/strict'
import { spellingForms, spellingMatches } from '../src/lib/wordSkills'

test('拼字：合併詞條的每個字形都算對，黏在一起的假字不算', () => {
  assert.equal(spellingMatches('argument', 'argue(argument)'), true)
  assert.equal(spellingMatches('argue', 'argue(argument)'), true)
  assert.equal(spellingMatches('argueargument', 'argue(argument)'), false)
  for (const w of ['he', 'him', 'his', 'himself']) assert.equal(spellingMatches(w, 'he (him, his, himself)'), true)
  assert.deepEqual(spellingForms('agree(ment)'), ['agree', 'agreement'])
  assert.deepEqual(spellingForms('sneaker(s)'), ['sneaker', 'sneakers'])
  assert.deepEqual(spellingForms('advertise(ment)/ad'), ['advertise', 'advertisement', 'ad'])
  assert.equal(spellingMatches('Actress', 'actor/actress'), true)
  assert.equal(spellingMatches('cafe', 'café/cafe'), true)
  assert.equal(spellingMatches('café', 'café/cafe'), true)
  assert.equal(spellingMatches('', 'actor/actress'), false)
})
