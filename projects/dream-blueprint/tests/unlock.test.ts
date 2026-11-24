import test from 'node:test'
import assert from 'node:assert/strict'
import { levelDone, levelTarget, openAt, openSteps, reached } from '../src/lib/unlock.ts'
import { readKey, readLevelsOpen, type ReadPassage } from '../src/lib/reading.ts'
import { readWrite, stagesOpen, writeTaskOpen, writeKey, type WriteStage } from '../src/lib/writing.ts'
import { pronKey, pronLessons, pronOpen } from '../src/lib/pronunciation.ts'
import { geptKey, geptLevelsOpen } from '../src/lib/gept.ts'
import { listenPassed, nurseListenKey, nurseLevelsOpen } from '../src/lib/nursing.ts'
import { storyKey, storyLevelsOpen } from '../src/lib/story.ts'
import { doneKey, passageLevelsOpen, type Passage } from '../src/lib/passages.ts'
import { packUnits } from '../src/lib/bridge.ts'
import writing from '../src/data/writing.json' with { type: 'json' }

test('一級一級打開：第一級一定開，前面每一級都完成，下一級才開', () => {
  assert.deepEqual(openSteps([false, false, false]), [true, false, false])
  assert.deepEqual(openSteps([true, false, true]), [true, true, false], '中間沒完成，後面全部鎖住')
  assert.deepEqual(openSteps([true, true, true]), [true, true, true])
  assert.deepEqual([3, 5, 6, 15, 235].map(levelTarget), [3, 3, 5, 12, 188], '超過五個要八成，五個以下三個')
  assert.equal(levelDone(11, 15), false)
  assert.equal(levelDone(12, 15), true)
  assert.equal(openAt([true, true, false, false], 3), 1, '存起來的級別被鎖住，退回最高一個打開的')
  assert.equal(openAt([true, false], 0), 0)
  assert.equal(reached(5, 5), true)
  assert.equal(reached(6, 5), false)
})

const reading = (level: ReadPassage['level'], n: number): ReadPassage[] => Array.from({ length: n }, (_, i) => ({ id: level.toLowerCase() + '-' + i, level, title: '', topic: '', words: 0, paras: [], zh: '', qs: [] }))
const pass = (ids: string[]) => Object.fromEntries(ids.map(id => [readKey(id), JSON.stringify({ day: '2026-11-24', picks: [], correct: 4, total: 4, tries: 1 })]))

test('閱讀理解：A1 過關 12 篇才開 A2，A2 達成才開 B1，B1 達成才開 B2', () => {
  const all = [...reading('A1', 15), ...reading('A2', 15), ...reading('B1', 4), ...reading('B2', 15)]
  assert.deepEqual(readLevelsOpen(all, {}), { A1: true, A2: false, B1: false, B2: false })
  const eleven = pass(all.filter(p => p.level === 'A1').slice(0, 11).map(p => p.id))
  assert.equal(readLevelsOpen(all, eleven).A2, false)
  const twelve = pass(all.filter(p => p.level === 'A1').slice(0, 12).map(p => p.id))
  assert.deepEqual(readLevelsOpen(all, twelve), { A1: true, A2: true, B1: false, B2: false })
  const zhOnly = Object.fromEntries(all.filter(p => p.level === 'A1').map(p => [readKey(p.id), JSON.stringify({ day: '2026-11-24', picks: [], correct: 4, total: 4, zh: true, tries: 1 })]))
  assert.equal(readLevelsOpen(all, zhOnly).A2, false, '看過中文不算過關')
  const nursing = [...reading('A2', 8), ...reading('B1', 15)]
  assert.deepEqual(readLevelsOpen(nursing, {}), { A1: true, A2: true, B1: false, B2: false }, '護理閱讀沒有 A1，從 A2 開始')
})

test('寫作階梯：前一階做完兩題才打開下一階；橋接段落跟著單元開', () => {
  const stages = writing.stages as WriteStage[]
  const done = (ids: string[], best = 5) => Object.fromEntries(ids.map(id => [writeKey(id), JSON.stringify({ day: '2026-11-24', words: 40, tries: 1, best })]))
  const start = stagesOpen(stages, {}, 1)
  assert.deepEqual(stages.map(s => start[s.id]), [true, false, false, false, false, false, false, false, false, false, false, false, false, false])
  const one = stagesOpen(stages, done(['b1']), 1)
  assert.equal(one.longer, false, '只做完一題')
  const two = stagesOpen(stages, done(['b1', 'b2']), 1)
  assert.equal(two.longer, true)
  assert.equal(two.negq, false)
  assert.equal(stagesOpen(stages, done(['b1', 'b2'], 3), 1).longer, false, '分數沒到不算做完')
  assert.equal(readWrite(done(['s1']), 's1')?.best, 5)
  assert.equal(stagesOpen(stages, {}, packUnits[0]).bridge, true, '上到橋接單元就打開')
  const bridge = stages.find(s => s.pack)!
  assert.equal(writeTaskOpen(bridge.tasks[0], packUnits[0]), true)
  assert.equal(writeTaskOpen(bridge.tasks.at(-1)!, packUnits[0]), false, '後面單元的題目還鎖著')
  assert.equal(writeTaskOpen(stages[0].tasks[3], 1), true, '一般階段的題目跟著階段開')
})

test('發音課照順序：前一堂過關才打開下一堂', () => {
  const open = pronOpen({})
  assert.equal(open[0], true)
  assert.ok(open.slice(1).every(o => !o))
  const first = pronLessons[0], second = pronLessons[1]
  const notes = { [pronKey(first.id)]: JSON.stringify({ d: '2026-11-24', q: [5, 5] }) }
  assert.equal(pronOpen(notes)[1], true, first.title + ' 過關後打開 ' + second.title)
  assert.equal(pronOpen(notes)[2], false)
})

test('全民英檢口說：初級回答問題拿到 4 級分才打開中級', () => {
  assert.deepEqual(geptLevelsOpen({}, ['e1', 'e2']), { elementary: true, intermediate: false })
  assert.equal(geptLevelsOpen({ [geptKey('elementary', 'e2')]: JSON.stringify({ q: 3.5 }) }, ['e1', 'e2']).intermediate, false)
  assert.equal(geptLevelsOpen({ [geptKey('elementary', 'e2')]: JSON.stringify({ q: 4 }) }, ['e1', 'e2']).intermediate, true)
})

test('護理聽力：A2 只聽就答對七成以上的對話達標，才打開 B1', () => {
  const list = [...Array.from({ length: 7 }, (_, i) => ({ id: 'a' + i, level: 'A2' })), ...Array.from({ length: 21 }, (_, i) => ({ id: 'b' + i, level: 'B1' })), { id: 'c0', level: 'B2' }]
  const heard = (ids: string[], r = { correct: 3, total: 4, heard: true }) => Object.fromEntries(ids.map(id => [nurseListenKey(id), JSON.stringify({ day: '2026-11-24', plays: 1, ...r })]))
  assert.deepEqual(nurseLevelsOpen(list, {}), { A2: true, B1: false, B2: false })
  assert.equal(nurseLevelsOpen(list, heard(['a0', 'a1', 'a2', 'a3', 'a4'])).B1, false, '7 段要 6 段')
  assert.equal(nurseLevelsOpen(list, heard(['a0', 'a1', 'a2', 'a3', 'a4', 'a5'])).B1, true)
  assert.equal(listenPassed({ day: '', correct: 4, total: 4, heard: false, plays: 1 }), false, '看過字不算')
  assert.equal(listenPassed({ day: '', correct: 2, total: 4, heard: true, plays: 1 }), false, '答對一半不算')
})

const passages = (level: number, n: number): Passage[] => Array.from({ length: n }, (_, i) => ({ id: 'L' + level + '-' + i, level, letter: 'A', n: i, zh: '中文', en: 'English.' }) as Passage)

test('短文讀聽和 7000 單短文：前一級完成八成才打開下一級；讀、聽、聽寫各自算', () => {
  const all = [...passages(1, 10), ...passages(2, 10), ...passages(3, 10), ...passages(4, 5), ...passages(5, 5), ...passages(6, 5)]
  const read = (n: number, field = 'r') => Object.fromEntries(all.filter(p => p.level === 1).slice(0, n).map(p => [storyKey(p.id), JSON.stringify({ [field]: '2026-11-24' })]))
  assert.deepEqual(storyLevelsOpen(all, {}, 'read'), [true, false, false, false, false, false])
  assert.equal(storyLevelsOpen(all, read(7), 'read')[1], false, '10 段要 8 段')
  assert.equal(storyLevelsOpen(all, read(8), 'read')[1], true)
  assert.equal(storyLevelsOpen(all, read(8), 'listen')[1], false, '讀完不算聽完')
  assert.equal(storyLevelsOpen(all, read(8, 'l'), 'listen')[1], true)
  const checks = (n: number) => Object.fromEntries(all.filter(p => p.level === 1).slice(0, n).map(p => [doneKey(p.id), true]))
  assert.deepEqual(passageLevelsOpen(all, {}), [true, false, false, false, false, false])
  assert.equal(passageLevelsOpen(all, checks(7))[1], false)
  assert.equal(passageLevelsOpen(all, checks(8))[1], true)
  assert.equal(passageLevelsOpen(all, checks(8))[2], false)
})
