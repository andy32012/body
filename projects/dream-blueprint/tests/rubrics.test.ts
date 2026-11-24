import test from 'node:test'
import assert from 'node:assert/strict'
import { ieltsOverall, levelText, passes, rubricPrompt, rubrics, settleSentence, validRubricScore, verdictFor } from '../src/lib/rubrics.ts'

test('評分表都是官方的：全民英檢每一級都有（0 到最高），雅思每項 band 9 到 1，附官方網址', () => {
  for (const r of Object.values(rubrics)) {
    assert.ok(r.scales.length >= 1, r.id)
    assert.match(r.source.url, r.id.startsWith('ielts') ? /^https:\/\/ielts\.org\// : /^https:\/\/www\.gept\.org\.tw\//, r.id + ' 來源是官方網站')
    for (const s of r.scales) {
      const want = r.id.startsWith('ielts') ? [9, 8, 7, 6, 5, 4, 3, 2, 1] : Array.from({ length: Math.round(r.max) + 1 }, (_, i) => r.max - i)
      assert.deepEqual(s.levels.map(l => l.score), want, r.id + ' ' + s.name)
      assert.ok(s.levels.every(l => l.text.length > 4), r.id + ' 每一級都有描述')
    }
  }
  assert.equal(rubrics['ielts-task1'].scales.length, 4)
  assert.equal(rubrics['ielts-task2'].scales[0].name.startsWith('Task Response'), true)
  assert.equal(rubrics['ielts-task1'].scales[0].name.startsWith('Task Achievement'), true)
})

test('給 Claude 的評分表：每一級的描述都在，還有「描述全部符合才給、拿不定給低的」', () => {
  for (const r of Object.values(rubrics)) {
    const p = rubricPrompt(r, ['整篇'])
    for (const s of r.scales) for (const l of s.levels) assert.ok(p.includes(l.score + '：' + l.text), r.id + ' 第 ' + l.score + ' 級')
    assert.match(p, /描述全部符合/)
    assert.match(p, /給低的那一級/)
    assert.match(p, /不可以用自己的標準/)
    assert.ok(p.includes(r.source.name))
  }
  assert.match(rubricPrompt(rubrics['ielts-task2']), /20 個字以下/)
  assert.match(rubricPrompt(rubrics['gept-speak-elementary']), /只評語法和字彙/)
})

test('分數只能是表上的級分', () => {
  const para = rubrics['gept-paragraph'], ielts = rubrics['ielts-task2'], speak = rubrics['gept-speak-intermediate'], one = rubrics['gept-sentence']
  for (const v of [0, 1, 2, 3, 4, 5]) assert.ok(validRubricScore(para, v))
  for (const v of [3.5, 6, -1, '4', NaN, null]) assert.equal(validRubricScore(para, v), false, String(v))
  assert.ok(validRubricScore(speak, 3.5), '口說是幾題平均，可以有 .5')
  assert.equal(validRubricScore(speak, 3.25), false)
  assert.ok(validRubricScore(ielts, 7))
  assert.equal(validRubricScore(ielts, 7.5), false, '雅思每一項是整數 band')
  assert.equal(validRubricScore(ielts, 10), false)
  assert.equal(validRubricScore(one, 3), false, '單句最高 2 分')
})

test('雅思四項平均的進位：.25 進到 .5，.75 進到下一個整數', () => {
  assert.equal(ieltsOverall([6, 6, 5, 5]), 5.5)
  assert.equal(ieltsOverall([6, 6, 6, 5]), 6)
  assert.equal(ieltsOverall([6, 5, 5, 5]), 5.5)
  assert.equal(ieltsOverall([5, 5, 5, 5]), 5)
  assert.equal(ieltsOverall([7, 7, 6, 6]), 6.5)
  assert.equal(ieltsOverall([4, 3, 3, 3]), 3.5)
})

test('通過標準照官方：初級寫作七成、中級 80 分（4 級分）；雅思沒有及格線', () => {
  assert.equal(passes(rubrics['gept-paragraph'], 4), true)
  assert.equal(passes(rubrics['gept-paragraph'], 3), false)
  assert.equal(passes(rubrics['gept-essay'], 4), true)
  assert.equal(passes(rubrics['gept-essay'], 3), false)
  assert.equal(passes(rubrics['gept-sentence'], 5 / 3), true, '6 分拿 5 分')
  assert.equal(passes(rubrics['gept-sentence'], 4 / 3), false, '6 分拿 4 分')
  assert.equal(passes(rubrics['ielts-task2'], 9), false)
})

test('批改的判定跟著分數走：最高一級才算全對，低一級是小錯，再低要再練（意思變了另外標）', () => {
  const tr = rubrics['gept-translation'], one = rubrics['gept-sentence']
  assert.equal(verdictFor(tr, 5, 'small'), 'good')
  assert.equal(verdictFor(tr, 4, 'good'), 'small', '有錯就不能說全對')
  assert.equal(verdictFor(tr, 3, 'small'), 'again')
  assert.equal(verdictFor(tr, 2, 'changed'), 'changed')
  assert.equal(verdictFor(tr, 4, 'changed'), 'small', '分數說意思大致有到，就照分數')
  assert.equal(verdictFor(one, 2, 'again'), 'good')
  assert.equal(verdictFor(one, 1, 'good'), 'small')
  assert.equal(verdictFor(one, 0, 'small'), 'again')
})

test('中翻英的判定和單句分數要一致：對了才是 2 分，小錯是 1 分', () => {
  assert.deepEqual(settleSentence('good', 2), { verdict: 'good', score: 2 })
  assert.deepEqual(settleSentence('good', 1), { verdict: 'small', score: 1 }, '比較嚴的那個算')
  assert.deepEqual(settleSentence('good', null), { verdict: 'good', score: 2 })
  assert.deepEqual(settleSentence('small', 2), { verdict: 'small', score: 1 })
  assert.deepEqual(settleSentence('again', 2), { verdict: 'again', score: 1 })
  assert.deepEqual(settleSentence('changed', 0), { verdict: 'changed', score: 0 })
  assert.deepEqual(settleSentence('again', null), { verdict: 'again', score: null })
})

test('半級分寫成介於兩級之間', () => {
  assert.equal(levelText(rubrics['gept-speak-elementary'], 3.5), '介於 4 和 3 之間')
  assert.equal(levelText(rubrics['gept-paragraph'], 4), rubrics['gept-paragraph'].scales[0].levels[1].text)
  assert.equal(levelText(rubrics['ielts-task2'], 6, 2), rubrics['ielts-task2'].scales[2].levels[3].text)
})
