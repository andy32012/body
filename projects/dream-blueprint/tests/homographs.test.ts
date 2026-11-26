import test from 'node:test'
import assert from 'node:assert/strict'
import nursing from '../src/data/nursing-words.json' with { type: 'json' }
import { confusableOf, confusables, homographOf, homographs, nurseSkillKey } from '../src/lib/homographs.ts'
import { levelEntry, wordKey } from '../src/lib/vocab.ts'
import { markSkill, readSkills } from '../src/lib/wordSkills.ts'

const nurseWords = new Set((nursing as { en: string }[]).map(w => wordKey(w.en)))

test('一字多義：每一個都真的在一般字表和護理單字裡，兩邊的意思和例句都寫了', () => {
  assert.ok(homographs.length >= 20)
  for (const h of homographs) {
    assert.ok(levelEntry(h.en), h.en + ' 在一般 7000 單字表')
    assert.ok(nurseWords.has(wordKey(h.nurseWord ?? h.en)), (h.nurseWord ?? h.en) + ' 在護理單字')
    assert.ok(h.nurse.trim() && h.everyday.trim() && h.nurse !== h.everyday, h.en + ' 兩邊的意思不一樣')
    for (const ex of [h.nurseEx, h.everydayEx]) assert.ok(ex.en.trim() && ex.zh.trim(), h.en + ' 例句有英文和中文')
    assert.match(h.nurseEx.en.toLowerCase(), new RegExp(wordKey(h.en).slice(0, 4)), h.en + ' 護理例句用到這個字')
    assert.match(h.everydayEx.en.toLowerCase(), new RegExp(wordKey(h.en).slice(0, 4)), h.en + ' 一般例句用到這個字')
  }
  assert.equal(new Set(homographs.map(h => wordKey(h.en))).size, homographs.length, '不重複')
  // pupil: 學生 in the everyday list, 瞳孔 in nursing.
  assert.equal(homographOf('pupil', 'everyday')?.nurse, '瞳孔')
  assert.equal(homographOf('pupil', 'nurse')?.everyday, '學生、門生')
  assert.equal(homographOf('blood culture', 'nurse')?.everyday, '文化', '片語也標：culture 在護理是培養')
  assert.equal(homographOf('culture', 'everyday')?.nurseWord, 'blood culture')
  assert.equal(homographOf('ankle', 'nurse'), null, '意思一樣的字不標')
})

test('護理單字裡一字多義的字分開記：一般單字練過「學生」，不算護理的「瞳孔」也會；意思一樣的字共用紀錄', () => {
  assert.equal(nurseSkillKey('pupil'), 'n:pupil')
  assert.equal(nurseSkillKey('positive'), 'n:positive')
  assert.equal(nurseSkillKey('ankle'), 'ankle', '腳踝兩邊都是腳踝，共用')
  assert.equal(nurseSkillKey('blood culture'), 'blood culture', '片語本來就是自己一筆')
  const day = '2026-11-26'
  let notes = markSkill({}, wordKey('pupil'), 'read', day)
  assert.equal(readSkills(notes, nurseSkillKey('pupil')).read, undefined, '一般的 pupil 練過，護理的還沒有')
  notes = markSkill(notes, nurseSkillKey('pupil'), 'read', day)
  assert.equal(readSkills(notes, 'pupil').read, day, '原本一般單字的紀錄還在')
  assert.equal(readSkills(notes, 'n:pupil').read, day)
})

test('容易搞混的護理字：每一組都在護理單字裡，查得到彼此', () => {
  for (const c of confusables) {
    assert.ok(c.words.length >= 2 && c.tip.trim())
    for (const w of c.words) assert.ok(nurseWords.has(wordKey(w)), w + ' 在護理單字')
  }
  assert.deepEqual(confusableOf('delirium')?.words, ['dementia', 'delirium'])
  assert.equal(confusableOf('ankle'), null)
})
