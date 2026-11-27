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

test('拼字：只忽略大小寫、重音、撇號樣式、前後空白和句點；中間混數字或符號算錯', async () => {
  assert.equal(spellingMatches('a1rgument', 'argue(argument)'), false)
  assert.equal(spellingMatches('argu-ment', 'argue(argument)'), false)
  assert.equal(spellingMatches('argument!', 'argue(argument)'), false)
  assert.equal(spellingMatches('  Argument ', 'argue(argument)'), true)
  assert.equal(spellingMatches('a.m.', 'am/a.m.'), true)
  assert.equal(spellingMatches('am', 'am/a.m.'), true)
  assert.equal(spellingMatches('Mr.', 'Mr./Mister'), true)
  assert.equal(spellingMatches("ma’am", "madam/ma'am"), true)
  assert.equal(spellingMatches('T-shirt', 'T-shirt'), true)
  assert.equal(spellingMatches('Tshirt', 'T-shirt'), false)
})

test('拼字練習一次問一個字形，用那個字形自己的中文', async () => {
  const { spellingTargets, meaningLine, levelEntry, formLines } = await import('../src/lib/vocab.ts')
  const he = { en: 'he (him, his, himself)', zh: '他' }
  const targets = [0, 1, 2, 3].map(t => spellingTargets(he, t))
  assert.deepEqual(targets.map(t => t.en), ['he', 'him', 'his', 'himself'])
  assert.equal(targets[1].zh, 'pron. 他（當受詞）')
  // 問的是受格，就只有 him 算對。
  assert.equal(spellingMatches('him', targets[1].accept), true)
  assert.equal(spellingMatches('his', targets[1].accept), false)
  // 同一個字的不同拼法（airplane／plane）兩個都算對。
  assert.equal(spellingMatches('plane', spellingTargets({ en: 'airplane/plane', zh: '飛機' }).accept), true)
  // agree(ment)：動詞和名詞分開問。
  assert.deepEqual([0, 1].map(t => spellingTargets({ en: 'agree(ment)', zh: '同意' }, t).en), ['agree', 'agreement'])
  // 字表的詞性跟著每個意思走。
  assert.equal(meaningLine(levelEntry('sound')!), 'n. 聲音；v. 聽起來')
  assert.equal(meaningLine(levelEntry('play')!), 'v. 玩；彈奏（樂器）；打（球）、比賽；n. 戲劇')
  assert.match(meaningLine(levelEntry('even')!), /偶數的/)
  assert.equal(formLines(levelEntry('he')!).length, 4)
})
