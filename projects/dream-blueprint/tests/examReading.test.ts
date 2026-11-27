import test from 'node:test'
import assert from 'node:assert/strict'
import a1 from '../src/data/exam-reading-a1.json' with { type: 'json' }
import a2 from '../src/data/exam-reading-a2.json' with { type: 'json' }
import b1 from '../src/data/exam-reading-b1.json' with { type: 'json' }
import b2 from '../src/data/exam-reading-b2.json' with { type: 'json' }
import reading from '../src/data/reading.json' with { type: 'json' }
import {
  blankParts, examPassed, examWords, nextExamPassage, questionRange, readExamPlace, readExamRecord, saveExamRead, sameWord, examReadKey, examPlaceKey,
  type ExamPassage,
} from '../src/lib/examReading.ts'
import { addWordsToReview } from '../src/lib/dailyWords.ts'
import { wordCount } from '../src/lib/writing.ts'
import { readKey, type ReadPassage } from '../src/lib/reading.ts'

const files = { A1: a1, A2: a2, B1: b1, B2: b2 } as unknown as Record<string, ExamPassage[]>
const all = Object.values(files).flat()
const CJK = /[　-〿㐀-鿿＀-￯]/

test('歷屆考題閱讀：四百多篇，每篇放在自己程度的檔案，ID 不重複也不和閱讀理解撞', () => {
  assert.ok(all.length >= 400, '至少 400 篇')
  assert.ok(all.reduce((n, p) => n + p.qs.length, 0) >= 1700, '至少 1700 題')
  assert.equal(new Set(all.map(p => p.id)).size, all.length)
  const graded = new Set((reading as ReadPassage[]).map(p => p.id))
  for (const [level, list] of Object.entries(files)) for (const p of list) {
    assert.equal(p.level, level, p.id + ' 在 ' + level + ' 的檔案')
    assert.ok(/^ex-(cap|gsat|ast|civil)-\d{2,3}b?-[\da-f]+$/.test(p.id) && !graded.has(p.id), p.id)
    assert.ok(['easy', 'mid', 'hard'].includes(p.band), p.id)
    assert.ok(['cap', 'gsat', 'ast', 'civil'].includes(p.kind), p.id)
    assert.ok(p.source.trim() && p.exam.trim(), p.id + ' 有出處')
  }
  // Every kind of exam is there, and 會考 is the easy end.
  for (const k of ['cap', 'gsat', 'ast', 'civil']) assert.ok(all.filter(p => p.kind === k).length >= 50, k)
  assert.ok(!all.some(p => p.kind === 'cap' && p.level === 'B2'), '會考不會排到 B2')
  assert.ok(!all.some(p => p.kind !== 'cap' && p.kind !== 'civil' && (p.level === 'A1' || p.level === 'A2')), '學測、指考不會排到 A1、A2')
})

test('每一題都能作答：四個不同的選項、官方答案在選項裡、題號在題組範圍內；字數算對；沒有混進中文', () => {
  for (const p of all) {
    assert.ok(p.qs.length >= 2, p.id + ' 至少兩題')
    assert.equal(p.words, wordCount(p.paras.join(' ').replace(/\{\{\d+\}\}/g, ' ')), p.id + ' 字數')
    assert.ok(p.paras.length && p.paras.every(x => x.trim()), p.id + ' 有文章')
    assert.ok(!CJK.test(p.paras.join(' ')), p.id + ' 文章沒有中文')
    for (const q of p.qs) {
      const at = p.id + ' 第 ' + q.n + ' 題'
      assert.ok(q.n >= p.first && q.n <= p.last, at + ' 題號')
      assert.equal(q.options.length, 4, at)
      assert.equal(new Set(q.options.map(o => o.toLowerCase())).size, 4, at + ' 選項不重複')
      assert.ok(q.options.every(o => o.trim() && !CJK.test(o)), at + ' 選項')
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, at + ' 答案')
      assert.ok(q.blank ? q.q === '' : q.q.trim() && !CJK.test(q.q), at + ' 題目')
    }
    for (const g of p.gloss ?? []) assert.ok(g.en.trim() && CJK.test(g.zh), p.id + ' 附註 ' + g.en)
  }
})

test('文章裡的空格：每個要作答的空格都剛好出現一次；要看圖才能答的空格留在文章裡但不考', () => {
  for (const p of all) {
    const text = p.paras.join('\n')
    const marks = [...text.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]))
    for (const q of p.qs.filter(x => x.blank)) assert.equal(marks.filter(n => n === q.n).length, 1, p.id + ' 空格 ' + q.n)
    for (const n of p.skipped ?? []) {
      assert.equal(marks.filter(m => m === n).length, 1, p.id + ' 不考的空格 ' + n)
      assert.ok(!p.qs.some(q => q.n === n), p.id + ' 不考的空格沒有題目')
    }
    for (const n of marks) assert.ok(p.qs.some(q => q.n === n && q.blank) || p.skipped?.includes(n), p.id + ' 每個空格都有題目或標明不考：' + n)
  }
  assert.deepEqual(blankParts('social distancing {{40}}. In fact'), [{ text: 'social distancing ' }, { blank: 40 }, { text: '. In fact' }])
  assert.equal(questionRange({ first: 40, last: 43 }), '第 40–43 題')
  assert.equal(questionRange({ first: 7, last: 7 }), '第 7 題')
})

test('紀錄：同一天重做是練習，不蓋掉紀錄；之後考差了，以前的過關還在；和閱讀理解的紀錄分開', () => {
  let notes: Record<string, string> = {}
  notes = saveExamRead(notes, 'ex-cap-113-8', { day: '2026-11-26', picks: [0, 1, 3], correct: 3, total: 3 })
  assert.ok(examPassed(readExamRecord(notes, 'ex-cap-113-8')))
  assert.ok(notes[examReadKey('ex-cap-113-8')] && !notes[readKey('ex-cap-113-8')], '用自己的 exam.read. 紀錄')
  notes = saveExamRead(notes, 'ex-cap-113-8', { day: '2026-11-26', picks: [1, 1, 1], correct: 1, total: 3 })
  let r = readExamRecord(notes, 'ex-cap-113-8')!
  assert.deepEqual([r.correct, r.tries], [3, 2], '同一天重做只多算一次嘗試，第一次的作答原封不動')
  assert.equal(r.best?.correct, 3)
  notes = saveExamRead(notes, 'ex-cap-113-8', { day: '2026-12-01', picks: [1, 1, 1], correct: 1, total: 3 })
  r = readExamRecord(notes, 'ex-cap-113-8')!
  assert.equal(r.correct, 1, '最近一次照實記')
  assert.ok(examPassed(r), '以前的過關還在')
  assert.equal(r.tries, 3)
  assert.equal(readExamRecord({ [examReadKey('x')]: '{bad' }, 'x'), null)
  assert.equal(readExamPlace({ [examPlaceKey]: JSON.stringify({ level: 'B1', band: 'mid' }) })?.level, 'B1')
  assert.equal(readExamPlace({ [examPlaceKey]: JSON.stringify({ level: 'C2', band: 'mid' }) }), null)
})

test('下一篇：沒讀過的先，再來是還沒過關的（讀得最久以前的先）；這一輪略過的不再排', () => {
  const list = files.A2.slice(0, 4)
  const [a, b, c, d] = list
  assert.equal(nextExamPassage(list, {})!.id, a.id)
  let notes: Record<string, string> = {}
  notes = saveExamRead(notes, a.id, { day: '2026-11-20', picks: [], correct: 0, total: 3 })
  notes = saveExamRead(notes, b.id, { day: '2026-11-18', picks: [], correct: 0, total: 3 })
  assert.equal(nextExamPassage(list, notes)!.id, c.id)
  notes = saveExamRead(notes, c.id, { day: '2026-11-21', picks: [], correct: 3, total: 3 })
  notes = saveExamRead(notes, d.id, { day: '2026-11-22', picks: [], correct: 3, total: 3 })
  assert.equal(nextExamPassage(list, notes)!.id, b.id, 'b 比 a 更早讀')
  assert.equal(nextExamPassage(list, notes, [b.id])!.id, a.id)
  assert.equal(nextExamPassage(list, notes, [a.id, b.id]), null, '都過關或略過了')
})

test('這篇的單字：原卷附註先，再來是文章裡 4 級以上、還沒學過的字；只有字表裡的字能加進單字複習', () => {
  const p = { paras: ['During the pandemic, nurses were reluctant to rest. Fatigue made them vulnerable to infections in {{40}} hospitals.'], gloss: [{ en: 'pandemic', zh: '(疾病的)大流行' }, { en: 'leaf (leaves)', zh: '葉子' }] }
  const words = examWords(p, { known: [], learning: [], cards: [] })
  assert.equal(words[0].en, 'pandemic')
  assert.equal(words[0].note, true)
  assert.equal(words[1].en, 'leaf', '附註的括號拿掉')
  assert.ok(words[1].key, 'leaf 在字表裡，可以加進複習')
  const rest = words.filter(w => !w.note)
  assert.deepEqual(rest.map(w => w.en).sort(), ['fatigue', 'infection', 'reluctant', 'vulnerable'], '4 級以上的字（infections 找到原形），hospital 這種簡單字不列')
  assert.ok(rest.every(w => w.key && w.zh))
  const without = examWords(p, { known: ['reluctant'], learning: ['fatigue'], cards: ['word:infection'] })
  assert.deepEqual(without.filter(w => !w.note).map(w => w.en), ['vulnerable'], '認得、在學、已在複習的字不再列')
  assert.ok(sameWord(' Pandemic. ', 'pandemic') && sameWord('refer  to', 'refer to') && !sameWord('pandemics', 'pandemic'))
})

test('加進單字複習：變成待學單字，明天複習；已經在複習的字不重複，認得的字改成待學', () => {
  const prev = { knownWords: ['leaf'], learningWords: [], cards: [{ id: 'word:candle', box: 2 as const, lastDay: '2026-11-20', due: '2026-11-28', mastered: false }], notes: {} }
  const next = addWordsToReview(prev, ['leaf', 'candle', 'electricity'], '2026-11-26')
  assert.deepEqual(next.knownWords, [])
  assert.deepEqual(next.learningWords.sort(), ['electricity', 'leaf'])
  assert.equal(next.cards.length, 3)
  assert.equal(next.cards.find(c => c.id === 'word:candle')!.due, '2026-11-28', '已經在複習的字不動')
  assert.equal(next.cards.find(c => c.id === 'word:leaf')!.due, '2026-11-27')
  assert.equal(addWordsToReview(next, ['leaf'], '2026-11-26'), next, '沒有新字就不改')
})

test('答鍵改過的 94 學測兩篇：照官方作答拿滿分；存著選項的舊紀錄打開 App 時照新答鍵重算（審核 R038）', async () => {
  const { default: b2 } = await import('../src/data/exam-reading-b2.json', { with: { type: 'json' } })
  const keys = (id: string) => (b2 as { id: string; qs: { answer: number }[] }[]).find(x => x.id === id)!.qs.map(q => q.answer)
  assert.deepEqual(keys('ex-gsat-94-3'), [0, 3, 1, 0], '第 49–52 題：A、D、B、A')
  assert.deepEqual(keys('ex-gsat-94-4'), [1, 2, 3, 2], '第 53–56 題：B、C、D、C')
  const { createInitialState, exportBackup, importBackup } = await import('../src/lib/store.ts')
  const old = createInitialState('2026-11-20')
  old.notes['exam.read.ex-gsat-94-3'] = JSON.stringify({ day: '2026-11-20', correct: 0, total: 4, picks: [0, 3, 1, 0], tries: 1, best: { day: '2026-11-20', correct: 0, total: 4 } })
  old.notes['exam.read.ex-gsat-94-4'] = JSON.stringify({ day: '2026-11-21', correct: 2, total: 4, picks: [1, 2, 3, 2], tries: 2, best: { day: '2026-11-19', correct: 3, total: 4 } })
  delete old.notes['migrate.exam-keys-r038']
  const after = importBackup(exportBackup(old)).notes
  const r3 = JSON.parse(after['exam.read.ex-gsat-94-3']), r4 = JSON.parse(after['exam.read.ex-gsat-94-4'])
  assert.deepEqual([r3.correct, r3.best.correct], [4, 4], '最近一次照新答鍵重算，最佳也是它')
  assert.equal(r4.correct, 4)
  assert.equal(r4.best.correct, 4, '重算後比以前的最佳好，就換成這一次')
  assert.equal(after['migrate.exam-keys-r038'], '1', '只做一次')
})
