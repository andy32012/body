import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeNote, mergeStates } from '../src/lib/merge.ts'
import { createInitialState, importBackup } from '../src/lib/store.ts'
import { newCard } from '../src/lib/progress.ts'

const session = (id: string, day: string, extra = {}) => ({ id, day, energy: 'normal' as const, period: 'semester' as const, sentenceId: '', words: [], translations: [], spokenIds: [], ...extra })

test('兩份合併：電腦上了第 2 天、iPad 今天做了別的，合起來兩邊都在，課表接在比較後面那一天', () => {
  const base = createInitialState('2026-11-13')
  base.curriculum = { unit: 1, day: 2, retry: 0, stableUnits: [] }
  base.sessions = [session('s-23', '2026-11-23', { sentenceId: 'u1-d1', translations: [{ sentenceId: 'u1-d1', rating: 'minor' as const, grammar: [], revealed: false }] })]
  base.notes = { ...base.notes, 'gram.1': JSON.stringify({ marks: { 0: 1, 1: 1, 2: 1, 3: 1 } }), 'ai.memory': JSON.stringify(['喜歡貓']) }
  // The computer: day 2 finished last night.
  const computer = structuredClone(base)
  computer.curriculum = { unit: 1, day: 3, retry: 0, stableUnits: [] }
  computer.sessions.push(session('s-24', '2026-11-24', { sentenceId: 'u1-d2', translations: [{ sentenceId: 'u1-d2', rating: 'correct' as const, grammar: [], revealed: false, verified: true }] }))
  computer.cards.push(newCard('u1-d2', '2026-11-24'))
  computer.notes['lesson.2026-11-24'] = JSON.stringify({ unit: 1, day: 2, phase: 'done' })
  computer.notes['gram.1'] = JSON.stringify({ marks: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 0, 5: 1 }, day: '2026-11-24' })
  computer.notes['weak.v1'] = JSON.stringify([{ k: 'be 動詞現在式', n: 2, first: '2026-11-23', last: '2026-11-24', ex: [{ w: 'I is', r: 'I am', src: 'tutor' }] }])
  computer.notes['review.sentences.2026-11-24'] = '1'
  computer.settings.theme = 'light'
  // The iPad, later: today's words and a dark theme, still at day 2.
  const ipad = structuredClone(base)
  ipad.sessions.push(session('s-25', '2026-11-25', { words: ['student'] }))
  ipad.cards.push(newCard('word:student', '2026-11-25'))
  ipad.notes['daily-word.seen.2026-11-25'] = '1'
  ipad.notes['weak.v1'] = JSON.stringify([{ k: 'be 動詞現在式', n: 1, first: '2026-11-25', last: '2026-11-25', ex: [{ w: 'he are', r: 'he is', src: 'self' }] }, { k: '拼字', n: 1, first: '2026-11-25', last: '2026-11-25', ex: [] }])
  ipad.notes['ai.memory'] = JSON.stringify(['喜歡貓', '想去美國'])
  ipad.settings.theme = 'dark'

  const merged = mergeStates(computer, ipad, false)
  assert.deepEqual(merged.curriculum, { unit: 1, day: 3, retry: 0, stableUnits: [] }, '接在第 3 天')
  assert.deepEqual(merged.sessions.map(s => s.id), ['s-23', 's-24', 's-25'])
  assert.deepEqual(merged.cards.map(c => c.id).sort(), ['u1-d2', 'word:student'])
  assert.ok(merged.notes['lesson.2026-11-24'] && merged.notes['daily-word.seen.2026-11-25'], '兩邊的紀錄都在')
  assert.deepEqual(JSON.parse(merged.notes['gram.1']).marks, { 0: 1, 1: 1, 2: 1, 3: 1, 4: 0, 5: 1 }, '第 2 天的文法小練習留著')
  const weak = JSON.parse(merged.notes['weak.v1'])
  assert.equal(weak.find((w: { k: string }) => w.k === 'be 動詞現在式').n, 2)
  assert.equal(weak.find((w: { k: string }) => w.k === 'be 動詞現在式').ex.length, 2, '兩邊的錯誤例子都留著')
  assert.ok(weak.some((w: { k: string }) => w.k === '拼字'))
  assert.deepEqual(JSON.parse(merged.notes['ai.memory']).sort(), ['喜歡貓', '想去美國'].sort())
  assert.equal(merged.settings.theme, 'dark', '設定跟最後改的那一份')
  assert.equal(mergeStates(computer, ipad, true).settings.theme, 'light')
  assert.deepEqual(mergeStates(computer, ipad, true).curriculum.day, 3, '哪一邊比較新都一樣接在後面那一天')
  // The merged copy is a valid progress file.
  assert.equal(importBackup(JSON.stringify(merged)).curriculum.day, 3)
})

test('同一張卡、同一筆紀錄兩邊都有：留比較新的，不重複', () => {
  assert.equal(mergeNote('review.sentences.2026-11-25', '2', '1'), '2', '次數取大的')
  assert.equal(mergeNote('evidence.1', JSON.stringify([{ a: 1 }]), JSON.stringify([{ a: 1 }, { a: 2 }])), JSON.stringify([{ a: 1 }, { a: 2 }]))
  assert.equal(mergeNote('x', 'old', 'new'), 'new')
  const a = createInitialState('2026-11-13'), b = structuredClone(a)
  a.cards = [{ ...newCard('word:cat', '2026-11-20'), due: '2026-11-22' }]
  b.cards = [{ ...newCard('word:cat', '2026-11-20'), lastDay: '2026-11-24', due: '2026-11-30' }]
  a.reviewEvents = [{ id: 'word:cat', day: '2026-11-22', gap: 2, remembered: true, shownAnswer: false }]
  b.reviewEvents = [...a.reviewEvents, { id: 'word:cat', day: '2026-11-24', gap: 2, remembered: true, shownAnswer: false }]
  const m = mergeStates(a, b, true)
  assert.equal(m.cards.length, 1)
  assert.equal(m.cards[0].due, '2026-11-30', '複習過的那張比較新')
  assert.equal(m.reviewEvents.length, 2, '複習紀錄不重複')
})
