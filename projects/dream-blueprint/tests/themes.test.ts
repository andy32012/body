import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dueThemeRun, finishedRuns, nextRun, perUnit, readThemeResult, saveThemeResult, saveThemeSentence, themeBreakdown, themeDay, themeKey,
  themeMinutes, themeOf, themePassed, themeQuiz, themeRuns, themes, themeScope, themeSentences,
} from '../src/lib/themes.ts'
import { grammarKey } from '../src/lib/grammar.ts'
import { units } from '../src/lib/todayLesson.ts'
import { libraryPage, menuGroups } from '../src/lib/library.ts'
import { logSentence, newCard, sentenceReviewKey } from '../src/lib/progress.ts'
import { createInitialState } from '../src/lib/store.ts'

const run = (id: string) => themeRuns().find(r => r.id === id)!
const day = '2026-12-13'

test('每個單元都屬於剛好一個主題；同一個主題連著好幾個單元，才有主題總複習', () => {
  const all = units.map(u => u.id).sort((a, b) => a - b)
  for (const u of all) assert.equal(themes.filter(t => t.units.includes(u)).length, 1, '單元 ' + u + ' 只在一個主題裡')
  assert.deepEqual(themes.flatMap(t => t.units).sort((a, b) => a - b), all, '沒有多出不存在的單元')
  assert.deepEqual(themeRuns().map(r => r.id), ['nouns-2', 'present-4', 'past-7', 'linking-21', 'perfect-36', 'contrast-39', 'clauses-42', 'conditionals-51'])
  for (const r of themeRuns()) {
    assert.ok(r.units.length >= 2)
    r.units.forEach((u, i) => { assert.equal(themeOf(u), r.theme); if (i) assert.equal(u, r.units[i - 1] + 1, r.id + ' 的單元是連著的') })
    assert.ok(r.earlier.length <= 4 && r.earlier.every(u => u < r.units[0] && themeOf(u)?.family === r.theme.family), r.id + ' 混進來的是以前學過、同一類的文法')
  }
})

test('過去式（單元 7–10）：整個過去式，加上以前學過的現在式和現在進行式，混在一起考', () => {
  const past = run('past-7')
  assert.deepEqual(past.units, [7, 8, 9, 10])
  assert.deepEqual(past.earlier, [1, 4, 5, 6])
  const scope = themeScope(past)
  assert.equal(scope.title, '過去式（單元 7–10）')
  assert.deepEqual(scope.earlierThemes, ['現在式', '進行式'])
  assert.deepEqual(scope.units.map(u => u.title), ['be 動詞過去式', '過去式（規則動詞）', '過去式（不規則動詞）', '過去式的否定和疑問'])
  const quiz = themeQuiz(past, {})
  const count = (u: number) => quiz.filter(x => x.unit === u).length
  assert.equal(perUnit(past), 3)
  assert.deepEqual([7, 8, 9, 10].map(count), [3, 3, 3, 3], '過去式每一課三題')
  for (const u of [7, 8, 9, 10]) assert.deepEqual(quiz.filter(x => x.unit === u).map(x => x.drill.k).sort(), ['choose', 'fill', 'fix'], '選擇、填空、改錯各一題')
  assert.equal(count(6), 2, '上一次學的進行式兩題')
  assert.deepEqual([1, 4, 5].map(count), [1, 1, 1])
  assert.equal(quiz.length, 17)
  assert.equal(new Set(quiz.map(x => x.unit + '.' + x.index)).size, quiz.length, '沒有重複的題目')
  const units = quiz.map(x => x.unit)
  assert.notDeepEqual(units, [...units].sort((a, b) => a - b), '題目打散，不是一課一課排')
  assert.deepEqual(themeQuiz(past, {}), quiz, '同一個主題每次打開順序一樣（重新整理不會換題）')
  assert.deepEqual(themeSentences(past).map(s => s.id), ['u10-r1', 'u6-r1'], '最後兩句：一句過去式疑問、一句進行式，要自己判斷')
  assert.equal(themeMinutes(past), 15)
})

test('以前錯過的題目先出：課堂上錯過的，和上次總複習錯的', () => {
  const past = run('past-7')
  // Unit 8's second choose drill (index 1) was missed in its lesson: it is the choose question picked for unit 8.
  const missed = { [grammarKey(8)]: JSON.stringify({ marks: { 0: 1, 1: 0 } }) }
  const pick8 = themeQuiz(past, missed).filter(x => x.unit === 8)
  assert.ok(pick8.some(x => x.index === 1), '錯過的那題一定在裡面')
  assert.ok(!themeQuiz(past, {}).filter(x => x.unit === 8).some(x => x.index === 1), '沒錯過的話是另一題')
  // A question missed in an earlier round of the review comes first the next round.
  const items = themeQuiz(past, {})
  const fixed = items.map(x => x.unit === 5 ? false : true)
  const notes = saveThemeResult({}, past.id, items, fixed, day)
  const five = items.find(x => x.unit === 5)!
  assert.ok(themeQuiz(past, notes).some(x => x.unit === 5 && x.index === five.index))
  // Units with one or two questions take turns at the kind, so the earlier grammar isn't all 改錯.
  assert.ok(new Set(items.filter(x => [1, 4, 5].includes(x.unit)).map(x => x.drill.k)).size > 1)
})

test('什麼時候該考：課程剛走過一段主題、還沒考過；只有最近的那一個，不會堆起來', () => {
  assert.equal(dueThemeRun({}, 1), null)
  assert.equal(dueThemeRun({}, 3), null, '單元 3 還在上，名詞和冠詞還沒上完')
  assert.equal(dueThemeRun({}, 4)?.id, 'nouns-2')
  assert.equal(dueThemeRun({}, 10)?.id, 'present-4')
  assert.equal(dueThemeRun({}, 11)?.id, 'past-7', '單元 10 上完（小關卡過了，課表到單元 11）就該考過去式')
  assert.equal(dueThemeRun({}, 20)?.id, 'past-7', '還沒考的話一直掛著')
  const items = themeQuiz(run('past-7'), {})
  const done = saveThemeResult({}, 'past-7', items, items.map(() => true), day)
  assert.equal(dueThemeRun(done, 11), null, '考過就不再提醒')
  assert.equal(dueThemeRun(done, 22), null, '連接詞還在上（單元 22）')
  assert.equal(dueThemeRun(done, 23)?.id, 'linking-21', '下一段上完才又該考')
  assert.equal(nextRun(1)?.id, 'nouns-2')
  assert.equal(nextRun(11)?.id, 'linking-21')
  assert.deepEqual(finishedRuns(11).map(r => r.id), ['nouns-2', 'present-4', 'past-7'], '上完的主題都可以再考，後面的鎖著')
})

test('首頁只在休息日（和沒排課的日子）放主題總複習；考週和實習不放', () => {
  assert.equal(themeDay('rest', [0]), true)
  assert.equal(themeDay('light', [0]), true)
  assert.equal(themeDay('regular', [0]), false, '上課日不擠進來（英文練習頁隨時可以做）')
  assert.equal(themeDay('winter', [0]), false)
  assert.equal(themeDay('regular', []), true, '沒有休息日的話，平常日也可以')
  for (const kind of ['exam', 'sprint', 'internship']) assert.equal(themeDay(kind, []), false, kind)
})

test('結果存起來：第一次的成績留著，再考一次只更新最近一次；錯的單元和題目都記下來', () => {
  const past = run('past-7')
  const items = themeQuiz(past, {})
  const rights = items.map(x => x.unit !== 9)
  let notes = saveThemeResult({}, past.id, items, rights, day)
  let r = readThemeResult(notes, past.id)!
  assert.equal(r.correct, 14)
  assert.equal(r.total, 17)
  assert.deepEqual(r.missed, [9])
  assert.equal(r.wrong?.length, 3)
  assert.equal(r.tries, 1)
  assert.deepEqual(r.first, { day, correct: 14, total: 17 })
  notes = saveThemeSentence(notes, past.id, 'u10-r1', 'independent')
  notes = saveThemeSentence(notes, past.id, 'u6-r1', null)
  notes = saveThemeSentence(notes, past.id, 'u6-r1', 'assisted')
  assert.deepEqual(readThemeResult(notes, past.id)?.sentences, [{ id: 'u10-r1', level: 'independent' }, { id: 'u6-r1', level: 'assisted' }])
  notes = saveThemeResult(notes, past.id, items, items.map(() => true), '2026-12-20')
  r = readThemeResult(notes, past.id)!
  assert.equal(r.correct, 17)
  assert.equal(r.tries, 2)
  assert.deepEqual(r.first, { day, correct: 14, total: 17 }, '第一次的成績不會被蓋掉')
  assert.equal(r.sentences, undefined, '新的一次重新寫句子')
  assert.equal(readThemeResult({ [themeKey('past-7')]: 'not json' }, 'past-7'), null)
  assert.equal(readThemeResult({ [themeKey('past-7')]: '{"day":3}' }, 'past-7'), null)
  // By unit, and the 80% line the other levels use.
  const by = themeBreakdown(items, rights)
  assert.deepEqual(by.find(b => b.unit === 9), { unit: 9, title: '過去式（不規則動詞）', right: 0, total: 3 })
  assert.equal(by.reduce((n, b) => n + b.total, 0), 17)
  assert.equal(themePassed(14, 17), true)
  assert.equal(themePassed(13, 17), false)
  assert.equal(themePassed(0, 0), false)
})

test('主題總複習在英文練習選單上：第一個主題上完才出現', () => {
  const has = (unit: number) => menuGroups({ unit }).flatMap(g => g.entries).some(e => e.id === 'theme')
  assert.equal(has(1), false)
  assert.equal(has(3), false)
  assert.equal(has(4), true)
  assert.equal(libraryPage('#library/theme'), 'theme')
})

test('總複習寫的句子跟中翻英一樣記：複習卡往後排、到期的算今天的句子複習、記進這次練習', () => {
  const base = createInitialState(day)
  const session = { id: 'library-' + day, day, period: 'semester' as const, energy: 'low' as const, advanced: false, sentenceId: '', words: [], translations: [], spokenIds: [] }
  const written = { sentenceId: 'u10-r1', rating: 'correct' as const, grammar: ['過去式疑問句'], revealed: false, verified: true }
  const fresh = logSentence({ ...base, sessions: [session] }, session.id, day, written)
  assert.ok(fresh.cards.some(c => c.id === 'u10-r1'), '第一次寫的句子開一張複習卡')
  assert.deepEqual(fresh.sessions[0].translations, [written])
  assert.equal(fresh.notes[sentenceReviewKey(day)], undefined)
  const dueCard = { ...newCard('u6-r1', '2026-12-01'), due: '2026-12-12' }
  const again = logSentence({ ...base, cards: [dueCard], sessions: [session] }, session.id, day, { ...written, sentenceId: 'u6-r1' })
  assert.equal(again.notes[sentenceReviewKey(day)], '1', '到期的句子卡算進今天的句子複習')
  assert.ok(again.cards[0].due > day, '寫對了，下次複習往後排')
  assert.equal(again.reviewEvents.length, 1)
})
