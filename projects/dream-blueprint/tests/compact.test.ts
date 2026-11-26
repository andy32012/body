import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBatch, archiveKey, archiveOld, bonusOn, compactState, delayedRecall, lastArchiveKey, oldDetails, readArchive, windows } from '../src/lib/compact.ts'
import { addDays, dayKey, newCard, reviewBonus, reviewCard, type ReviewCard, type ReviewEvent } from '../src/lib/progress.ts'
import { createInitialState, exportBackup, importBackup, type AppState } from '../src/lib/store.ts'
import { seasonHistory } from '../src/lib/rivals.ts'

const today = '2027-06-01'
const ev = (id: string, day: string, gap: number, remembered: boolean, shownAnswer = false): ReviewEvent => ({ id, day, gap, remembered, shownAnswer })

test('舊的複習紀錄整理成統計：紀錄頁的「隔幾天還記得」和每週比賽的加分都不變', () => {
  const events = [
    ev('word:a', '2027-01-10', 5, true), ev('word:b', '2027-01-10', 6, true), ev('word:c', '2027-01-10', 4, false),
    ev('word:d', '2027-02-02', 1, true), ev('word:e', '2027-03-20', 8, true, true),
    ev('word:f', '2027-05-20', 9, true), ev('word:g', '2027-05-31', 4, false),
  ]
  const s = { reviewEvents: events, notes: {} as Record<string, string> }
  const before = delayedRecall(s)
  const c = compactState(s, today)
  assert.deepEqual(c.reviewEvents.map(e => e.id), ['word:f', 'word:g'], '最近 60 天的留著')
  const a = readArchive(c.notes)
  assert.deepEqual([a.before, a.total, a.delayed, a.recalled], ['2027-04-02', 5, 3, 2])
  assert.deepEqual(a.bonus, { '2027-01-10': 4 }, '只記有加分的日子')
  assert.deepEqual(delayedRecall(c), before, '紀錄頁的總數一樣')
  for (const day of ['2027-01-10', '2027-02-02', '2027-05-20']) assert.equal(bonusOn(c, day), reviewBonus(events, day), day)
  assert.equal(compactState(c, today), c, '再整理一次什麼都不變')
  // A later run folds the next lines into the same totals.
  const later = compactState(c, '2027-07-25')
  assert.deepEqual([readArchive(later.notes).total, later.reviewEvents.length], [6, 1])
  assert.deepEqual(delayedRecall(later), before)
})

test('進度已經很大（超過 3 MB）時，整理得更勤快', () => {
  assert.deepEqual(windows(1_000_000), { events: 60, dayNotes: 45, lessons: 120 })
  assert.deepEqual(windows(3_500_000), { events: 30, dayNotes: 21, lessons: 45 })
  const c = compactState({ reviewEvents: [ev('word:a', '2027-04-20', 5, true), ev('word:b', '2027-05-10', 5, true)], notes: { 'hints.2027-05-01': '{}' } }, today, 3_500_000)
  assert.deepEqual(c.reviewEvents.map(e => e.id), ['word:b'])
  assert.deepEqual(Object.keys(c.notes), [archiveKey])
  assert.equal(readArchive({ [archiveKey]: 'not json' }).total, 0, '壞掉的統計不會讓網站打不開')
})

test('只在當天有用的小紀錄幾週後清掉，其他紀錄一個都不動', () => {
  const notes: Record<string, string> = {
    'daily-word.sorted.2027-03-01': '[]', 'daily-word.done.2027-03-01': '20', 'daily-word.seen.2027-05-30': '1',
    'plan.2027-03-01.words': '1', 'plan.2027-05-30.lesson': '1', 'hints.2027-03-01': '{}', 'review.sentences.2027-03-01': '5',
    'topic.skip.2027-02-01': '1', 'nurse.words.2027-02-01': '3', 'word-part.day.2027-02-01': '2', 'vocab-screen.2027-02-01': '{}',
    'progress.2027-02-01': '{"unit":3,"day":6,"pos":1,"records":[],"levels":[]}',
    'say.say-abc': '{"zh":"x","en":"y"}', 'evidence.3': '[]', 'read.a1-1': '{"day":"2027-01-01"}', 'weak.v1': '[]', 'ai.memory': '[]',
  }
  const c = compactState({ reviewEvents: [], notes }, today)
  assert.deepEqual(Object.keys(c.notes).sort(), ['ai.memory', 'daily-word.seen.2027-05-30', 'evidence.3', 'plan.2027-05-30.lesson', 'read.a1-1', 'say.say-abc', 'weak.v1'])
})

test('很久以前上完的課：留下自己寫的句子，拿掉長長的批改全文；沒上完的、正在上的、最近的不動', () => {
  const big = { corrected: 'x'.repeat(2000), fixes: [{ wrong: 'a', right: 'b', why: 'c' }] }
  const done = { unit: 3, day: 2, steps: ['recall', 'listen', 'write', 'express', 'done'], hints: { 'u3-d2': { h: 2, r: false } }, records: [{ sentenceId: 'u3-d2' }],
    express: { first: 'I go to school yesterday.', firstResult: big, lastAnswer: 'I went to school yesterday.', last: big, corrections: 1, help: ['frame'], fixed: true } }
  const open = { unit: 3, day: 3, steps: ['recall', 'listen', 'write'], express: { first: 'x', firstResult: big, corrections: 0, help: [] } }
  const notes = {
    'lesson.2027-01-05': JSON.stringify(done), 'lesson.2027-01-06': JSON.stringify(open),
    'lesson.2027-01-07': JSON.stringify(done), 'lesson.active': '2027-01-07', 'lesson.2027-05-30': JSON.stringify(done),
  }
  const c = compactState({ reviewEvents: [], notes }, today)
  const slim = JSON.parse(c.notes['lesson.2027-01-05'])
  assert.deepEqual(slim.express, { first: 'I go to school yesterday.', lastAnswer: 'I went to school yesterday.', corrections: 1, help: ['frame'], fixed: true })
  assert.deepEqual([slim.unit, slim.day, slim.steps.at(-1), slim.slim, slim.hints, slim.records], [3, 2, 'done', true, undefined, undefined])
  assert.ok(c.notes['lesson.2027-01-05'].length < 300)
  assert.equal(c.notes['lesson.2027-01-06'], notes['lesson.2027-01-06'], '沒上完的還要能接著上')
  assert.equal(c.notes['lesson.2027-01-07'], notes['lesson.2027-01-07'], '正在上的那一課不動')
  assert.equal(c.notes['lesson.2027-05-30'], notes['lesson.2027-05-30'], '最近的不動')
})

test('打開網站讀進度時就整理；匯出再匯入一樣；每週比賽的過去賽季名次不變', () => {
  const now = new Date()
  const first = addDays(dayKey(now), -199)
  const s: AppState = createInitialState(addDays(first, -1))
  const events: ReviewEvent[] = []
  for (let d = 0; d < 200; d++) {
    const day = addDays(first, d)
    s.sessions.push({ id: 's' + d, day, energy: d % 2 ? 'low' : 'normal', period: 'semester', sentenceId: '', words: [], advanced: false })
    for (let i = 0; i < (d % 3 === 0 ? 5 : 1); i++) events.push(ev('word:w' + i, day, 4 + (d % 3), (d + i) % 4 !== 0))
  }
  s.reviewEvents = events
  const seasons = seasonHistory(s, now)
  assert.ok(seasons[0].weeks > 10, '過去的賽季有好幾週')
  assert.notDeepEqual(seasonHistory({ ...s, reviewEvents: [] }, now), seasons, '複習加分會影響名次（所以這個測試真的有在檢查）')
  assert.deepEqual(seasonHistory(compactState(s, dayKey(now)), now), seasons, '過去賽季的名次一模一樣')
  const loaded = importBackup(JSON.stringify(s))
  assert.ok(loaded.reviewEvents.length < events.length, '舊的複習紀錄在讀進來時就整理了')
  assert.ok(loaded.reviewEvents.length > 0, '最近的留著')
  assert.ok(readArchive(loaded.notes).total > 0)
  assert.deepEqual(delayedRecall(loaded), delayedRecall(s))
  assert.deepEqual(seasonHistory(loaded, now), seasons)
  assert.deepEqual(importBackup(exportBackup(loaded)), loaded)
  assert.ok(loaded.notes[archiveKey])
})

test('用很多年：每天 20 個新字、上一課、複習到上限，三年後進度檔還是遠小於瀏覽器的 5 MB', t => {
  let s = { ...createInitialState('2026-11-24') }
  let cards: ReviewCard[] = []
  let events: ReviewEvent[] = []
  let notes: Record<string, string> = { ...s.notes }
  const sessions: AppState['sessions'] = []
  let seed = 11
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const big = JSON.stringify({ corrected: 'I went to the night market with my family last Sunday. '.repeat(10), fixes: [{ wrong: 'go', right: 'went', why: '過去的事用過去式' }] })
  const sizes: number[] = []
  let day = '2026-11-24'
  for (let d = 1; d <= 3 * 365; d++) {
    let reviewed = 0
    cards = cards.map(c => {
      if (c.due > day || c.lastDay >= day || reviewed >= 105) return c
      reviewed++
      const r = reviewCard(c, day, rand() < 0.85)
      if (r.event) events.push(r.event)
      return r.card
    })
    if (cards.length < 6500) for (let i = 0; i < 9; i++) cards.push(newCard('word:w' + d + '-' + i, day))
    for (let i = 0; i < 2; i++) cards.push(newCard('u' + (d % 53 + 1) + '-x' + d + '-' + i, day))
    sessions.push({ id: 's' + d, day, energy: 'normal', period: 'semester', sentenceId: 'u1-d1', words: ['word', 'nurse'], advanced: true, rating: 'correct',
      translations: [0, 1, 2].map(i => ({ sentenceId: 'u1-d' + (i + 1), rating: 'correct' as const, grammar: ['be 動詞現在式'], revealed: false, verified: true })) })
    notes = { ...notes,
      ['daily-word.sorted.' + day]: JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ k: 'word' + i, known: i % 2 === 0 }))),
      ['daily-word.done.' + day]: '20', ['daily-word.seen.' + day]: '1', ['review.sentences.' + day]: '5',
      ['plan.' + day + '.words']: '1', ['plan.' + day + '.lesson']: '1', ['hints.' + day]: JSON.stringify({ 'u1-d1': { h: 1, r: false } }),
      ['lesson.' + day]: JSON.stringify({ unit: 1, day: 1, steps: ['recall', 'listen', 'write', 'express', 'done'], express: { first: 'I am a nurse.', firstResult: JSON.parse(big), lastAnswer: 'I am a nurse.', last: JSON.parse(big), corrections: 1, help: [] } }),
    }
    // Opening the app compacts what was loaded. Once a week here (the size is then checked at its biggest), to keep the test quick.
    if (d % 7 === 0 || d % 365 === 0) {
      const next = compactState({ ...s, cards, reviewEvents: events, notes, sessions }, day)
      events = next.reviewEvents
      notes = next.notes
      if (d % 365 === 0) sizes.push(JSON.stringify(next).length)
    }
    day = addDays(day, 1)
  }
  const mb = sizes.map(n => +(n / 1e6).toFixed(2))
  t.diagnostic('進度檔大小（第 1、2、3 年）：' + mb.join(' → ') + ' MB')
  assert.ok(mb[2] < 2.5, '三年後 ' + mb.join(' → ') + ' MB')
  assert.ok(mb[2] - mb[1] < 0.6, '每年只多一點點：' + mb.join(' → ') + ' MB')
})

// ── With Google Drive connected: nothing is thrown away. Old details go to the Drive archive first.
const sample = () => ({
  reviewEvents: [ev('word:a', '2027-01-10', 5, true), ev('word:b', '2027-01-10', 6, false), ev('word:c', '2027-05-20', 9, true)],
  notes: {
    'hints.2027-03-01': '{}', 'daily-word.done.2027-05-30': '20', 'say.say-1': '{"zh":"x","en":"y"}',
    'lesson.2027-01-05': JSON.stringify({ unit: 3, day: 2, steps: ['write', 'done'], express: { first: 'I go.', last: { corrected: 'x'.repeat(500) }, corrections: 1, help: [] } }),
  } as Record<string, string>,
})

test('連著雲端硬碟：舊紀錄先留在手機等封存；超過 3.5 MB 才不等', () => {
  const s = sample()
  assert.equal(compactState(s, today, 100_000, true), s, '一筆都沒拿掉')
  const tidy = compactState(s, today, 3_600_000, true)
  assert.notEqual(tidy, s)
  assert.deepEqual(tidy.reviewEvents.map(e => e.id), ['word:c'], '太大了就先整理，讓存檔不會失敗')
})

test('封存的內容就是會從手機拿掉的那些；存好之後只拿掉一模一樣的', () => {
  const s = sample()
  const batch = oldDetails(s, today)
  assert.deepEqual(batch.events.map(e => e.id), ['word:a', 'word:b'])
  assert.deepEqual(Object.keys(batch.notes), ['hints.2027-03-01'])
  assert.deepEqual(Object.keys(batch.lessons), ['lesson.2027-01-05'])
  assert.equal(batch.lessons['lesson.2027-01-05'], s.notes['lesson.2027-01-05'], '封存的是整份，含批改全文')
  assert.deepEqual(applyBatch(s, batch), compactState(s, today), '跟直接整理的結果一樣')
  // Something changed after the batch was taken: that one stays.
  const later = { ...s, notes: { ...s.notes, 'hints.2027-03-01': '{"changed":1}' } }
  const after = applyBatch(later, batch, today)
  assert.equal(after.notes['hints.2027-03-01'], '{"changed":1}')
  assert.equal(after.notes[lastArchiveKey], today)
  assert.deepEqual(delayedRecall(after), delayedRecall(s), '紀錄頁的數字一樣')
  assert.equal(bonusOn(after, '2027-01-10'), bonusOn(s, '2027-01-10'))
})

test('大約一週封存一次：雲端確認收到才從手機拿掉；沒收到就留著下次再試', async () => {
  const s = sample()
  const sent: string[] = []
  const ok = async (file: string) => { sent.push(file); return true }
  const batch = await archiveOld(s, today, ok)
  assert.ok(batch)
  const file = JSON.parse(sent[0])
  assert.deepEqual([file.app, file.kind, file.savedOn, file.events.length, Object.keys(file.lessons)], ['夢想藍圖', '舊紀錄', today, 2, ['lesson.2027-01-05']])
  const done = applyBatch(s, batch!, today)
  assert.equal(await archiveOld(done, addDays(today, 3), ok), null, '三天後不用再封存')
  assert.equal(sent.length, 1)
  assert.equal(await archiveOld(done, addDays(today, 8), ok), null, '一週後也沒有新的舊紀錄就不送')
  assert.equal(await archiveOld(s, today, async () => false), null, '雲端沒說收到：不拿掉')
  assert.equal(await archiveOld({ ...s, notes: { ...s.notes, [lastArchiveKey]: addDays(today, -2) } }, today, ok, 3_200_000) !== null, true, '進度很大時不等一週')
})
