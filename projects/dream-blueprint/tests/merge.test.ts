import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeNote, mergeStates } from '../src/lib/merge.ts'
import { createInitialState, importBackup } from '../src/lib/store.ts'
import { newCard } from '../src/lib/progress.ts'
import { removeWeak } from '../src/lib/weakPoints.ts'

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

test('打開或切回來時自己處理：只有雲端變了就拿雲端的，兩邊都變了就自己合併，不用按按鈕', async () => {
  const { settleAction } = await import('../src/lib/cloudSync.ts')
  assert.equal(settleAction('pull', false), 'pull')
  assert.equal(settleAction('push', false), 'push')
  assert.equal(settleAction('none', false), 'none')
  assert.equal(settleAction('conflict', false), 'merge', '兩邊都改了：合併，不再暫停')
  assert.equal(settleAction('none', true), 'merge', '以前留下的暫停也一起合併掉')
})

test('兩台同一天都練習：同一天的練習紀錄、技能紀錄、單字四技都合起來，不會只留一台的', () => {
  const day = '2026-11-26'
  const a = createInitialState('2026-11-13'), b = structuredClone(a)
  const t = (id: string) => ({ sentenceId: id, rating: 'correct' as const, grammar: [], revealed: false })
  a.sessions = [session('library-' + day, day, { translations: [t('u1-r1')], words: ['cat'] })]
  b.sessions = [session('library-' + day, day, { translations: [t('u2-r1')], words: ['dog'], spokenIds: ['say-1'] })]
  a.notes['skills.log'] = JSON.stringify({ read: ['2026-11-25'], listen: ['2026-11-26'] })
  b.notes['skills.log'] = JSON.stringify({ read: ['2026-11-26'], write: ['2026-11-26'] })
  a.notes['skill.cat'] = JSON.stringify({ read: '2026-11-26', listen: '2026-11-20' })
  b.notes['skill.cat'] = JSON.stringify({ listen: '2026-11-24', write: '2026-11-26' })
  const m = mergeStates(a, b, false)
  assert.equal(m.sessions.length, 1)
  assert.deepEqual(m.sessions[0].translations?.map(x => x.sentenceId), ['u1-r1', 'u2-r1'], '兩台寫的句子都在')
  assert.deepEqual(m.sessions[0].words, ['cat', 'dog'])
  assert.deepEqual(m.sessions[0].spokenIds, ['say-1'])
  assert.deepEqual(JSON.parse(m.notes['skills.log']), { read: ['2026-11-25', '2026-11-26'], listen: ['2026-11-26'], write: ['2026-11-26'] })
  assert.deepEqual(JSON.parse(m.notes['skill.cat']), { read: '2026-11-26', listen: '2026-11-24', write: '2026-11-26' })
})

test('刪掉的、取消的、改過的設定，合併後不會跑回來', () => {
  const a = createInitialState('2026-11-13')
  a.notes['weak.v1'] = JSON.stringify([{ k: '冠詞', n: 3, first: '2026-11-20', last: '2026-11-24', ex: [] }, { k: '拼字', n: 1, first: '2026-11-24', last: '2026-11-24', ex: [] }])
  a.notes['daily-word.count'] = '25'
  a.checks = { 'roadmap.toefl': true, 'roadmap.ielts': true }
  a.flagged = ['u3-d1', 'u4-d2']
  const b = structuredClone(a)
  // On the iPad, later: removed 冠詞 from 我的弱點, five words a day, unticked one box, cleared one flag.
  b.notes = { ...b.notes, ...removeWeak(b.notes, '冠詞', '2026-11-25'), 'daily-word.count': '5' }
  b.checks = { 'roadmap.toefl': false, 'roadmap.ielts': true }
  b.flagged = ['u4-d2']
  const m = mergeStates(a, b, false)
  assert.deepEqual(JSON.parse(m.notes['weak.v1']).map((w: { k: string }) => w.k), ['拼字'], '刪掉的弱點不回來')
  assert.equal(m.notes['daily-word.count'], '5', '一天幾個新字跟最後改的')
  assert.equal(m.checks['roadmap.toefl'], false, '取消打勾的維持取消')
  assert.deepEqual(m.flagged, ['u4-d2'])
  assert.deepEqual(mergeStates(b, a, true).flagged, ['u4-d2'], '哪一邊叫 mine 都一樣')
  // The same mistake made again after the removal comes back as a weak point.
  const c = structuredClone(a)
  c.notes['weak.v1'] = JSON.stringify([{ k: '冠詞', n: 4, first: '2026-11-20', last: '2026-11-26', ex: [] }])
  const m2 = mergeStates(b, c, false)
  assert.ok(JSON.parse(m2.notes['weak.v1']).some((w: { k: string }) => w.k === '冠詞'), '刪掉以後又錯了，才會回來')
  assert.equal(mergeNote('review.sentences.2026-11-25', '2', '1'), '2', '某一天的次數還是取大的')
})

test('一台已經把舊的複習紀錄收進封存：合併後不會重複算', () => {
  const a = createInitialState('2026-11-13')
  const ev = (day: string) => ({ id: 'word:cat', day, gap: 2, remembered: true, shownAnswer: false })
  a.reviewEvents = [ev('2026-08-01'), ev('2026-09-01'), ev('2026-11-20')]
  const b = structuredClone(a)
  // The iPad folded the lines before 2026-09-15 into its archive.
  b.reviewEvents = [ev('2026-11-20'), ev('2026-11-25')]
  b.notes['review.archive'] = JSON.stringify({ before: '2026-09-15', total: 2, delayed: 2, recalled: 2, bonus: 0 })
  for (const m of [mergeStates(a, b, false), mergeStates(b, a, false)]) {
    assert.deepEqual(m.reviewEvents.map(e => e.day), ['2026-11-20', '2026-11-25'], '收進封存的不再算一次')
    assert.equal(JSON.parse(m.notes['review.archive']).before, '2026-09-15')
  }
  const older = JSON.stringify({ before: '2026-08-15', total: 1, delayed: 1, recalled: 1, bonus: 0 })
  assert.equal(JSON.parse(mergeNote('review.archive', b.notes['review.archive'], older)).before, '2026-09-15', '留收得比較多的那份')
})
