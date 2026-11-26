import test from 'node:test'
import assert from 'node:assert/strict'
import curriculum from '../src/data/curriculum.json' with { type: 'json' }
import { checkDrill, drillAnswer, drillSummary, drillsForDay, grammarFor, grammarUnits, readGrammar, saveDrill } from '../src/lib/grammar.ts'
import { matchesReference } from '../src/lib/evidence.ts'

const hasChinese = (s: string) => /[一-鿿]/.test(s)

test('文法講解：48 個單元都有三步講解、對照表、常見錯誤和七題小練習', () => {
  assert.deepEqual(grammarUnits.map(g => g.unit), curriculum.units.map(u => u.unit), '單元和課表一一對應')
  for (const g of grammarUnits) {
    const at = '單元 ' + g.unit
    assert.equal(g.steps.length, 3, at + ' 三步講解')
    for (const s of g.steps) {
      assert.ok(s.t && s.p && hasChinese(s.p), at + ' 每一步有標題和中文說明')
      assert.ok(s.ex.length >= 2, at + ' 每一步至少兩個例句')
      for (const e of s.ex) assert.ok(/[A-Za-z]/.test(e.en) && !hasChinese(e.en) && hasChinese(e.zh), at + ' 例句英文配中文：' + e.en)
    }
    assert.ok(g.table && g.table.head.length >= 2 && g.table.rows.length >= 2, at + ' 有對照表')
    for (const r of g.table!.rows) assert.equal(r.length, g.table!.head.length, at + ' 表格每列欄數一致')
    assert.ok(g.mistakes.length >= 2, at + ' 至少兩個常見錯誤')
    for (const m of g.mistakes) {
      assert.ok(m.why && hasChinese(m.why), at + ' 常見錯誤有原因')
      assert.notEqual(m.bad, m.good, at + ' 錯句和正確句不能一樣：' + m.bad)
    }
    const kinds = g.drills.map(d => d.k)
    assert.equal(g.drills.length, 7, at + ' 七題')
    assert.deepEqual([kinds.filter(k => k === 'choose').length, kinds.filter(k => k === 'fill').length, kinds.filter(k => k === 'fix').length], [3, 2, 2], at + ' 選擇 3、填空 2、改錯 2')
  }
})

test('文法小練習：每題只有一個標準答案，改錯題的原句一定不會被判對', () => {
  const seen = new Set<string>()
  for (const g of grammarUnits) for (const [i, d] of g.drills.entries()) {
    const at = '單元 ' + g.unit + ' 第 ' + (i + 1) + ' 題'
    assert.ok(d.why && hasChinese(d.why), at + ' 有解說')
    assert.ok(!seen.has(g.unit + d.q), at + ' 題目不重複')
    seen.add(g.unit + d.q)
    if (d.k === 'choose') {
      assert.ok(d.q.includes('___'), at + ' 有空格')
      assert.equal(d.options.length, 3, at + ' 三個選項')
      assert.equal(new Set(d.options).size, 3, at + ' 選項不重複')
      assert.ok(d.answer >= 0 && d.answer < 3, at + ' 答案在選項裡')
      assert.ok(checkDrill(d, d.answer) && !checkDrill(d, (d.answer + 1) % 3), at + ' 只有答案那一個算對')
      // An option like "had / started" fills two blanks.
      const parts = d.options[d.answer].split(' / ').length
      assert.ok(parts === 1 || parts === d.q.split('___').length - 1, at + ' 空格數和答案對得上')
    } else if (d.k === 'fill') {
      assert.equal(d.q.split('___').length - 1, 1, at + ' 一個空格')
      assert.ok(d.accept.length >= 1, at + ' 有答案')
      for (const a of d.accept) assert.ok(checkDrill(d, a) && checkDrill(d, ' ' + a.toUpperCase() + ' '), at + ' 大小寫和空白不影響：' + a)
      assert.ok(!checkDrill(d, ''), at + ' 空白不算對')
      // The base word given as a hint must not already be the answer, unless the answer really is the base form.
      const hint = d.q.match(/\(([a-z]+)\)/)?.[1]
      if (hint && d.accept.some(a => a === hint)) assert.ok(/原形/.test(d.why), at + ' 答案就是提示的原形時，解說要說明用原形')
    } else {
      assert.ok(!d.q.includes('___'), at + ' 改錯題是完整的句子')
      assert.ok(!matchesReference(d.q, d.accept), at + ' 原句不能算對：' + d.q)
      for (const a of d.accept) assert.ok(checkDrill(d, a), at + ' 改好的句子算對：' + a)
      assert.ok(!checkDrill(d, d.q), at + ' 沒改就交不算對')
    }
    const answer = drillAnswer(d)
    assert.ok(!answer.includes('___') && !/[（(]/.test(answer), at + ' 完整答案句沒有空格和提示：' + answer)
    assert.ok(/^["A-Z]/.test(answer), at + ' 答案句大寫開頭：' + answer)
  }
})

test('文法小練習：縮寫和完整寫法都算對，選項裡的「不加」會從答案句拿掉', () => {
  const u5 = grammarFor(5)!
  const notPlay = u5.drills.find(d => d.k === 'fill' && d.q.includes('(not，play)'))!
  assert.ok(checkDrill(notPlay, "doesn't play") && checkDrill(notPlay, 'does not play') && !checkDrill(notPlay, "don't play"))
  const u11 = grammarFor(11)!
  const wont = u11.drills.find(d => d.k === 'fill' && d.q.includes('will 的否定'))!
  assert.ok(checkDrill(wont, "won't") && checkDrill(wont, 'will not'))
  const u41 = grammarFor(46)!
  const breakfast = u41.drills.find(d => d.q.includes('breakfast'))!
  assert.equal(drillAnswer(breakfast), 'I usually have breakfast at seven.')
  const u16 = grammarFor(16)!
  assert.equal(drillAnswer(u16.drills.find(d => d.q.includes('your doctor'))!), 'Who is your doctor? — Dr. Lin.')
  const u43 = grammarFor(48)!
  assert.equal(drillAnswer(u43.drills.find(d => d.q.includes('the meeting'))!), 'When we arrived, the meeting had already started.')
  const fix = grammarFor(1)!.drills.find(d => d.k === 'fix')!
  assert.ok(checkDrill(fix, "He's my friend.") && checkDrill(fix, 'he is my friend'), '改錯題接受縮寫、不管大小寫和句點')
})

test('文法小練習的紀錄：只記第一次，之後改對記成「後來改對」；每天出的題目照天數分配', () => {
  let notes: Record<string, string> = {}
  assert.deepEqual(drillsForDay(notes, 1, 1), [0, 1, 2, 3], '第 1 天四題')
  notes = saveDrill(notes, 1, 0, true, '2026-11-23')
  notes = saveDrill(notes, 1, 1, false, '2026-11-23')
  notes = saveDrill(notes, 1, 1, false, '2026-11-23')
  assert.deepEqual(readGrammar(notes, 1).marks, { 0: 1, 1: 0 })
  assert.deepEqual(drillsForDay(notes, 1, 1), [2, 3], '同一天只剩沒做的')
  assert.deepEqual(drillsForDay(notes, 1, 2), [1, 2, 3, 4, 5], '第 2 天：先重做錯的，再接沒做的和新的兩題')
  notes = saveDrill(notes, 1, 1, true, '2026-11-24')
  assert.equal(readGrammar(notes, 1).marks[1], 2, '後來改對')
  const again = saveDrill(notes, 1, 0, false, '2026-11-24')
  assert.equal(again, notes, '第一次對了，之後再錯不改紀錄')
  for (const i of [2, 3, 4, 5, 6]) notes = saveDrill(notes, 1, i, true, '2026-11-25')
  assert.deepEqual(drillsForDay(notes, 1, 4), [], '都做過、沒有待改的就不再出')
  assert.deepEqual(drillSummary(notes, 1), { total: 7, done: 7, first: 6, open: 0 })
  assert.deepEqual(readGrammar({ 'gram.3': 'not json' }, 3).marks, {}, '壞掉的紀錄當成沒有')
})

// A1–A2 items the Core Inventory lists that the units did not teach: a supplement on six units (the three steps and
// seven drills of each unit stay as they are).
test('A1–A2 補充：六個單元有補充講解和小練習，每題只有一個標準答案', async () => {
  const { grammarFor, checkDrill, drillAnswer } = await import('../src/lib/grammar.ts')
  const want: Record<number, RegExp> = { 1: /\bmy\b.*\byour\b/, 2: /’s|'s/, 4: /\bme\b.*\bhim\b/, 11: /tomorrow|next/, 22: /\bIf\b/, 28: /look for|turn/ }
  for (const [unit, sign] of Object.entries(want)) {
    const g = grammarFor(Number(unit))!
    assert.ok(g.extra, 'unit ' + unit + ' 有補充')
    assert.equal(g.steps.length, 3, 'unit ' + unit + ' 原本的三步不變')
    assert.equal(g.drills.length, 7, 'unit ' + unit + ' 原本的七題不變')
    assert.ok(g.extra!.steps.length >= 2 && g.extra!.drills.length >= 4, 'unit ' + unit + ' 補充至少兩步、四題')
    assert.match(JSON.stringify(g.extra), sign, 'unit ' + unit + ' 教到該教的')
    for (const d of g.extra!.drills) {
      assert.ok(d.why.trim(), unit + ' ' + d.q + ' 有原因')
      assert.equal(checkDrill(d, d.k === 'choose' ? d.answer : d.accept[0]), true, unit + ' ' + d.q + ' 標準答案判對')
      assert.ok(drillAnswer(d).trim(), unit + ' ' + d.q + ' 有顯示用的答案')
      if (d.k === 'choose') assert.ok(d.options.filter((_, i) => checkDrill(d, i)).length === 1, unit + ' ' + d.q + ' 只有一個選項對')
      if (d.k === 'fix') assert.equal(checkDrill(d, d.q), false, unit + ' ' + d.q + ' 原句不算對')
    }
  }
})
