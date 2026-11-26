import test from 'node:test'
import assert from 'node:assert/strict'
import { PARTS_A_DAY, allowance, dayCountKey, guessQuiz, learnedKey, learnedParts, meaningQuiz, moreKey, partsForToday, reviewRound, wordParts } from '../src/lib/wordParts.ts'
import medical from '../src/data/medical-parts.json'

test('日常字根字首：三種都有，每個有意思、三個以上例字和一個猜猜看', () => {
  assert.ok(wordParts.length >= 120, String(wordParts.length))
  for (const kind of ['字首', '字根', '字尾']) assert.ok(wordParts.filter(p => p.type === kind).length >= 25, kind)
  assert.equal(new Set(wordParts.map(p => p.id)).size, wordParts.length)
  assert.equal(new Set(wordParts.map(p => p.part)).size, wordParts.length)
  for (const p of wordParts) {
    assert.ok(p.meaning && /[一-鿿]/.test(p.meaning), p.part)
    assert.ok(p.examples.length >= 3, p.part)
    for (const e of p.examples) assert.ok(/^[A-Za-z][A-Za-z -]*$/.test(e.en) && /[一-鿿]/.test(e.zh), p.part + ' ' + e.en)
    assert.ok(/^[A-Za-z][A-Za-z-]*$/.test(p.guess.en) && p.guess.zh, p.part)
    assert.ok(!p.examples.some(e => e.en.toLowerCase() === p.guess.en.toLowerCase()), p.part + '：猜猜看的字不能是例字')
  }
})

test('日常的字根字首不重複醫護那一份已經有的寫法', () => {
  const med = new Set(medical.map(m => m.part))
  // 兩邊都有的幾個（anti-、pre-、post-、sub-、inter-、bi-、trans-）在日常這邊用的是生活例字
  for (const p of wordParts.filter(p => med.has(p.part))) assert.ok(!p.examples.some(e => medical.some(m => m.example === e.en)), p.part)
})

test('最前面學的是最常見的：un-、re-、-er、-ful、-less', () => {
  assert.deepEqual(wordParts.slice(0, 5).map(p => p.part), ['un-', 're-', '-er／-or', '-ful', '-less'])
})

test('一天三個；按「再學三個」多三個；學過的不再出現', () => {
  const day = '2026-11-24'
  let checks: Record<string, boolean> = {}, notes: Record<string, string> = {}
  assert.deepEqual(partsForToday(checks, notes, day).map(p => p.id), wordParts.slice(0, PARTS_A_DAY).map(p => p.id))
  checks = { [learnedKey(wordParts[0].id)]: true }; notes = { [dayCountKey(day)]: '1' }
  assert.deepEqual(partsForToday(checks, notes, day).map(p => p.id), [wordParts[1].id, wordParts[2].id])
  checks = Object.fromEntries(wordParts.slice(0, 3).map(p => [learnedKey(p.id), true])); notes = { [dayCountKey(day)]: '3' }
  assert.equal(partsForToday(checks, notes, day).length, 0, '今天的學完了')
  notes = { ...notes, [moreKey(day)]: '1' }
  assert.equal(allowance(notes, day), 6)
  assert.deepEqual(partsForToday(checks, notes, day).map(p => p.id), wordParts.slice(3, 6).map(p => p.id))
  assert.equal(partsForToday(checks, {}, '2026-11-25').length, 3, '隔天重新算')
  assert.equal(learnedParts(checks).length, 3)
  const all = Object.fromEntries(wordParts.map(p => [learnedKey(p.id), true]))
  assert.equal(partsForToday(all, {}, day).length, 0)
})

test('猜猜看：三個選項、剛好一個對、每次順序一樣', () => {
  for (const p of wordParts) {
    const q = guessQuiz(p)
    assert.equal(q.options.length, 3, p.part)
    assert.equal(new Set(q.options).size, 3, p.part)
    assert.equal(q.options[q.answer], p.guess.zh, p.part)
    assert.deepEqual(guessQuiz(p), q)
  }
  const spots = wordParts.map(p => guessQuiz(p).answer)
  for (const i of [0, 1, 2]) assert.ok(spots.filter(s => s === i).length > wordParts.length / 5, '答案不會老是同一個位置')
})

test('複習：問「這個字根是什麼意思」，選項不會有兩個一樣的意思', () => {
  for (const p of wordParts) for (const round of [0, 1, 2]) {
    const q = meaningQuiz(p, round)
    assert.equal(new Set(q.options).size, 3, p.part)
    assert.equal(q.options[q.answer], p.meaning)
  }
  const checks = Object.fromEntries(wordParts.slice(0, 8).map(p => [learnedKey(p.id), true]))
  assert.equal(reviewRound(checks, 0).length, 5)
  assert.notDeepEqual(reviewRound(checks, 0).map(p => p.id), reviewRound(checks, 1).map(p => p.id))
  assert.equal(reviewRound({}, 0).length, 0)
})

test('字根的 ID 跟著意思走：重排或插入新的字根，學過的紀錄不會指到別的字根（稽核 R-10）', async () => {
  const { readFileSync } = await import('node:fs')
  const recorded = JSON.parse(readFileSync(new URL('./fixtures/word-part-ids.json', import.meta.url), 'utf8')) as Record<string, string>
  const parts = (await import('../src/data/word-parts.json', { with: { type: 'json' } })).default as { id: string; part: string }[]
  const now = new Map(parts.map(p => [p.id, p.part]))
  const moved = Object.entries(recorded).filter(([id, part]) => now.get(id) !== part).map(([id, part]) => id + ' 原本是 ' + part + '，現在是 ' + (now.get(id) ?? '（不見了）'))
  assert.deepEqual(moved, [], '\n' + moved.join('\n'))
  assert.equal(new Set(parts.map(p => p.id)).size, parts.length, 'ID 不重複')
})
