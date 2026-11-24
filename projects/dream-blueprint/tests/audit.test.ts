import test from 'node:test'
import assert from 'node:assert/strict'
import { judgeWritten, matchesReference } from '../src/lib/evidence.ts'
import { applyAnswer, newCard } from '../src/lib/progress.ts'
import { syncDecision } from '../src/lib/drive.ts'
import { mergeMemory, readDeleted, readMemory, replaceMemory, writeMemory } from '../src/lib/memory.ts'
import { passed, readRecord, saveRead } from '../src/lib/reading.ts'
import { projectCalendar } from '../src/lib/projection.ts'
import { emptyCheck, sectionScore } from '../src/lib/baseline.ts'
import { spellingMatches } from '../src/lib/wordSkills.ts'
import { dayBudget, planBlocks } from '../src/lib/dailyPlan.ts'
import sentences from '../src/data/sentences.json' with { type: 'json' }
import curriculum from '../src/data/curriculum.json' with { type: 'json' }

const refs = ['I have a fever.']

test('判定：Claude 的「對了」只算它看過的那一版；小錯就算跟參考句一樣也是有提示', () => {
  const base = { rating: 'correct' as const, revealed: false, references: refs }
  assert.equal(judgeWritten({ ...base, answer: 'I feel hot.', firstVerdict: 'good', checkedText: 'I feel hot.' }), 'independent')
  assert.equal(judgeWritten({ ...base, answer: 'I feel hot!', firstVerdict: 'good', checkedText: 'I feel hot.' }), 'independent', '只差標點還是同一句')
  assert.equal(judgeWritten({ ...base, answer: 'I feel very hot.', firstVerdict: 'good', checkedText: 'I feel hot.' }), 'pending', '看完以後改過的句子沒人確認')
  assert.equal(judgeWritten({ ...base, answer: 'I have a fever.', firstVerdict: 'small', checkedText: 'I has a fever.' }), 'assisted', '先被指出錯，再改成參考句')
  assert.equal(judgeWritten({ rating: 'minor', revealed: false, answer: 'I have a fever.', references: refs }), 'assisted', '自己選小錯')
})

test('縮寫：學生的縮寫兩種讀法都試；參考句照後面的字決定 is／has、would／had', () => {
  assert.ok(matchesReference("He's been sick for two days.", ['He has been sick for two days.']))
  assert.ok(matchesReference("She's tired.", ['She is tired.']))
  assert.ok(!matchesReference('She has tired.', ["She's tired."]))
  assert.ok(matchesReference("I'd like some water.", ['I would like some water.']))
  assert.ok(matchesReference("You'd better rest.", ['You had better rest.']))
  assert.ok(matchesReference('I met her at a cafe.', ['I met her at a café.']), '重音字母不算錯')
  assert.ok(matchesReference('Could you take a picture of me?', sentences.find(s => s.id === 's-053')!.reference), '拍我、替我拍兩種都收')
  const u47 = curriculum.units[46].backup.find(s => s.id === 'u47-r1')!
  assert.match(u47.zh, /你的照片/)
  assert.ok(matchesReference("I'll take a photo of you.", u47.reference))
})

test('複習卡：自評的「對了」先停在原地，確認過才往上升；錯或看答案往下', () => {
  const card = { ...newCard('u1-d1', '2026-11-01'), box: 2 as const, due: '2026-11-20' }
  const held = applyAnswer(card, '2026-11-22', { rating: 'correct', revealed: false })
  assert.equal(held.card.box, 2)
  assert.equal(held.event, null)
  assert.equal(held.card.lastDay, '2026-11-22')
  assert.ok(held.card.due > '2026-11-22')
  assert.equal(applyAnswer(card, '2026-11-22', { rating: 'correct', revealed: false, verified: true }).card.box, 3)
  assert.equal(applyAnswer(card, '2026-11-22', { rating: 'again', revealed: false }).card.box, 1)
  assert.equal(applyAnswer(card, '2026-11-22', { rating: 'correct', revealed: true, verified: true }).card.box, 1)
})

test('雲端同步：雲端比出發點新，本機也改過就是衝突，不會互蓋', () => {
  assert.equal(syncDecision(null, 0, 100), 'push', '雲端還沒有')
  assert.equal(syncDecision(200, 100, 100), 'pull', '別台改過，這台沒改')
  assert.equal(syncDecision(200, 100, 150), 'conflict', '兩邊都改過')
  assert.equal(syncDecision(100, 100, 150), 'push', '只有這台改過')
  assert.equal(syncDecision(100, 100, 100), 'none')
})

test('記憶：刪掉的會記成墓碑，雲端舊資料合併回來也不會復活', () => {
  let notes = writeMemory({}, ['喜歡貓', '怕打針'])
  notes = replaceMemory(notes, ['喜歡貓'])
  assert.deepEqual(readMemory(notes), ['喜歡貓'])
  assert.deepEqual(readDeleted(notes), ['怕打針'])
  const merged = mergeMemory(readMemory(notes), readDeleted(notes), ['喜歡貓', '怕打針', '住台中'], [])
  assert.deepEqual(merged.notes.sort(), ['住台中', '喜歡貓'].sort())
  assert.deepEqual(merged.deleted, ['怕打針'])
  // 又寫回來就不再算刪掉。
  assert.deepEqual(readDeleted(replaceMemory(notes, ['喜歡貓', '怕打針'])), [])
})

test('閱讀：同一天重做是練習，不會蓋掉第一次；之後分數比較低也不會抹掉過關', () => {
  let notes = saveRead({}, 'a1-x', { day: '2026-11-20', picks: [0, 0, 1], correct: 1, total: 3 })
  notes = saveRead(notes, 'a1-x', { day: '2026-11-20', picks: [1, 1, 1], correct: 3, total: 3 })
  let r = readRecord(notes, 'a1-x')!
  assert.equal(r.practice, true)
  assert.equal(passed(r), false, '剛看過答案重做的滿分不算')
  notes = saveRead(notes, 'a1-x', { day: '2026-11-22', picks: [1, 1, 1], correct: 3, total: 3 })
  r = readRecord(notes, 'a1-x')!
  assert.equal(passed(r), true)
  notes = saveRead(notes, 'a1-x', { day: '2026-11-25', picks: [0, 0, 0], correct: 0, total: 3 })
  assert.equal(passed(readRecord(notes, 'a1-x')), true, '最好的那次還在')
  assert.equal(readRecord(notes, 'a1-x')!.tries, 4)
})

test('日曆：生活主題跟文法課輪流排，C 至少在 B 後三天', () => {
  const days = projectCalendar({
    today: '2026-12-01', from: '2026-12-01', to: '2026-12-20', cursor: 6 * 2, sessions: [], ranges: [],
    topics: [{ n: 1, title: '自我介紹', after: 1, done: {} }],
  })
  const topicDays = days.filter(d => d.topic)
  assert.deepEqual(topicDays.map(d => d.topic!.part), ['A', 'B', 'C'])
  const lessons = days.filter(d => d.kind === 'lesson')
  for (let i = 1; i < lessons.length; i++) assert.ok(!(lessons[i].topic && lessons[i - 1].topic), '兩天主題不會連著排')
  const b = topicDays[1].day, c = topicDays[2].day
  assert.ok((Date.parse(c) - Date.parse(b)) / 864e5 >= 3)
})

test('回測：沒作答的部分是缺測（null），不是 0 分；全部略過不存', () => {
  const qs = [{ q: '', options: ['a', 'b'], answer: 1 }, { q: '', options: ['a', 'b'], answer: 0 }]
  assert.equal(sectionScore(qs, [undefined, undefined]), null)
  assert.equal(sectionScore(qs, [0, undefined]), 0)
  assert.equal(sectionScore(qs, [1, 0]), 2)
  assert.equal(emptyCheck({ listening: null, reading: null, writing: { text: ' ', feedback: '' }, speaking: { transcript: '', feedback: '', seconds: 0 } }), true)
  assert.equal(emptyCheck({ listening: 0, reading: null, writing: { text: '', feedback: '' }, speaking: { transcript: '', feedback: '', seconds: 0 } }), false)
})

test('拼字：只去掉縮寫的點（a.m.、Mr.），字中間多一個點算拼錯', () => {
  assert.ok(spellingMatches('a.m.', 'am/a.m.'))
  assert.ok(spellingMatches('am', 'am/a.m.'))
  assert.ok(spellingMatches('Mr.', 'mr./mister'))
  assert.ok(spellingMatches('nurse.', 'nurse'))
  assert.ok(!spellingMatches('nur.se', 'nurse'))
})

test('今天多久：首頁選項、清單分鐘和待辦用同一套；平常 1.5 小時、寒假 3 小時，沒排課的日子是選做', () => {
  const settings = { periods: [
    { type: 'exam' as const, start: '2026-11-13', end: '2026-11-19' },
    { type: 'vacation' as const, start: '2027-01-17', end: '2027-02-20' },
    { type: 'internship' as const, start: '2028-02-01', end: '2029-01-31' },
    { type: 'exam' as const, start: '2029-02-01', end: '2029-07-31' },
    { type: 'vacation' as const, start: '2029-08-01', end: '2029-08-31' },
  ], regularDays: [1, 2, 3, 4, 5, 6], restDays: [0] }
  const b = (day: string) => dayBudget(day, settings)
  // 一般學期週一到週六：預設 1.5 小時，有電 2 小時，累爆 15 分鐘；週日休息，15 分鐘是選做。
  assert.deepEqual([b('2026-11-30').kind, b('2026-11-30').defaultEnergy, b('2026-11-30').minutes.normal, b('2026-11-30').labels.normal], ['regular', 'normal', 90, '1.5 小時'])
  assert.deepEqual(b('2026-11-30').minutes, { low: 15, normal: 90, high: 120 })
  assert.deepEqual([b('2026-11-29').kind, b('2026-11-29').optional, b('2026-11-29').labels.low], ['rest', true, '15 分鐘'])
  // 寒假（週一到六）3 小時、有電 4 小時；週日和過年休息。
  assert.deepEqual([b('2027-01-18').kind, b('2027-01-18').minutes.normal, b('2027-01-18').minutes.high, b('2027-01-18').labels.normal], ['winter', 180, 240, '3 小時'])
  assert.equal(b('2027-01-24').kind, 'rest')
  assert.equal(b('2027-02-08').kind, 'rest')
  // 暑假和其他假期 1.5 小時（暑假可能有實習）。
  assert.deepEqual([b('2029-08-06').kind, b('2029-08-06').minutes.normal], ['holiday', 90])
  // 段考週 15 分鐘選做；實習 20–30 分鐘、國考衝刺 15 分鐘護理英文，沒有「有電」。
  assert.deepEqual([b('2026-11-16').kind, b('2026-11-16').defaultEnergy, b('2026-11-16').minutes.low], ['exam', 'low', 15])
  assert.deepEqual([b('2028-03-01').kind, b('2028-03-01').defaultEnergy, b('2028-03-01').labels.normal, b('2028-03-01').minutes.low], ['internship', 'normal', '20–30 分鐘', 10])
  assert.deepEqual([b('2029-03-01').kind, b('2029-03-01').minutes.normal, b('2029-03-01').minutes.low], ['sprint', 15, 5])
  assert.equal(b('2028-03-01').minutes.high, null)
  // 清單加起來就是畫面上的分鐘；今天要「先補強」時從複習撥出來，複習至少留 5 分鐘。
  for (const total of [5, 10, 15, 30, 90, 120, 180, 240]) {
    for (const focus of [0, 5]) {
      const blocks = planBlocks(total, focus)
      assert.equal(blocks.reduce((n, x) => n + x.min, 0), total, total + ' 分鐘（補強 ' + focus + '）')
      assert.ok(blocks.every(x => x.min > 0))
    }
  }
  assert.deepEqual(planBlocks(90).map(x => [x.id, x.min]), [['review', 15], ['lesson', 30], ['words', 10], ['input', 20], ['output', 15]])
  assert.deepEqual(planBlocks(180).map(x => x.id), ['review', 'lesson', 'words', 'listen', 'read', 'write', 'speak', 'cert'])
  assert.deepEqual(planBlocks(240).at(-1), { id: 'extra', min: 60 })
  assert.deepEqual(planBlocks(90, 5).slice(0, 2), [{ id: 'focus', min: 5 }, { id: 'review', min: 10 }])
  // 寒假文法課還是一天一堂：清單裡只有一個「今天這一堂」。
  assert.equal(planBlocks(240).filter(x => x.id === 'lesson').length, 1)
})
