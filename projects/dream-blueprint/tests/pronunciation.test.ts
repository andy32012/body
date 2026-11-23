import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { clipSlug, hasQuiz, lessonTexts, nextPron, packFile, pronLessons, pronPassed, pronProgress, pronVoices, quizFor, readPron, readVoice, savePron, stressParts,
  voiceKey } from '../src/lib/pronunciation.ts'
import { unpack } from '../src/lib/pronAudio.ts'

const chinese = /[一-鿿]/
const root = new URL('../public/', import.meta.url)

test('發音課內容：每一堂有講解、可以點來聽的字，句子有中文；id 照順序不重複', () => {
  assert.ok(pronLessons.length >= 12)
  assert.deepEqual(pronLessons.map(l => l.id), pronLessons.map((_, i) => 'p' + String(i).padStart(2, '0')))
  for (const l of pronLessons) {
    assert.ok(l.title && l.tag, l.id)
    assert.ok(l.explain.length >= 2 && l.explain.every(p => chinese.test(p) && p.length > 20), l.id + ' 講解至少兩段')
    assert.ok((l.pairs?.length ?? 0) + (l.items?.length ?? 0) >= 6, l.id + ' 至少六個可以聽的字')
    for (const [a, b] of l.pairs ?? []) assert.notEqual(clipSlug(a), clipSlug(b), l.id + ' 一組對比的兩個字不能一樣：' + a)
    for (const item of l.items ?? []) assert.ok(item.label && item.text && chinese.test(item.note), l.id + ' ' + item.text)
    if (l.kind !== 'table') {
      assert.ok(l.tip && chinese.test(l.tip), l.id + ' 有「容易錯的地方」')
      assert.equal(l.sentences?.length, 3, l.id + ' 三句跟讀')
      for (const s of l.sentences ?? []) assert.ok(/[.?!]$/.test(s.en) && chinese.test(s.zh), l.id + ' ' + s.en)
      assert.ok(hasQuiz(l), l.id + ' 有聽辨測驗')
    }
    // Different words must never share a clip file.
    const texts = lessonTexts(l)
    assert.equal(new Set(texts.map(clipSlug)).size, texts.length)
    for (const t of texts) assert.ok(clipSlug(t).length > 0 && /^[a-z0-9-]+$/.test(clipSlug(t)), t)
  }
  assert.notEqual(clipSlug('I can swim.'), clipSlug("I can't swim."))
  assert.equal(clipSlug("What is it?"), 'what-is-it')
})

test('字尾和重音兩堂：標的念法在三種裡面；重音標示剛好一個大寫音節，拼起來就是那個字', () => {
  const endings = pronLessons.find(l => l.kind === 'endings')!
  const ed = ['[t]', '[d]', '[ɪd]'], s = ['[s]', '[z]', '[ɪz]']
  for (const item of endings.items!) {
    assert.ok(/ed$/.test(item.text) ? ed.includes(item.label) : s.includes(item.label), item.text + ' ' + item.label)
  }
  for (const label of [...ed, ...s]) assert.ok(endings.items!.filter(i => i.label === label).length >= 3, label + ' 至少三個例字')
  const stress = pronLessons.find(l => l.kind === 'stress')!
  for (const item of stress.items!) {
    const { parts, stressed } = stressParts(item.label)
    assert.ok(stressed >= 0 && parts.length >= 2, item.label)
    assert.equal(item.label.split('·').filter(p => p === p.toUpperCase()).length, 1, item.label + ' 只有一個重音')
    assert.equal(parts.join(''), item.text.toLowerCase(), item.label)
  }
  assert.deepEqual(stressParts('in·for·MA·tion'), { parts: ['in', 'for', 'ma', 'tion'], stressed: 2 })
})

test('聽辨測驗：同一個種子出同一份題目；答案對得上要播的那個字', () => {
  for (const l of pronLessons) {
    const quiz = quizFor(l, 7)
    assert.deepEqual(quizFor(l, 7), quiz, l.id + ' 題目固定')
    if (l.kind === 'table') { assert.equal(quiz.length, 0); continue }
    assert.ok(quiz.length >= 5 && quiz.length <= 8, l.id + ' 題數 ' + quiz.length)
    const texts = new Set(lessonTexts(l).map(clipSlug))
    for (const q of quiz) {
      assert.ok(texts.has(clipSlug(q.audio)), l.id + ' 要播的字有錄音：' + q.audio)
      assert.ok(q.answer >= 0 && q.answer < q.options.length && new Set(q.options).size === q.options.length, l.id + ' ' + q.audio)
      if (l.kind === 'pairs') { assert.equal(q.options[q.answer], q.audio); assert.equal(q.options.length, 2) }
      if (l.kind === 'endings') assert.equal(q.options[q.answer], l.items!.find(i => i.text === q.audio)!.label)
      if (l.kind === 'stress') assert.equal(q.answer, stressParts(l.items!.find(i => i.text === q.audio)!.label).stressed)
      if (l.kind !== 'pairs') assert.ok(q.why.length > 5, l.id + ' 有解說')
    }
    if (l.kind === 'pairs') {
      // No pair is asked twice with the same answer, so a guess cannot be reused.
      assert.equal(new Set(quiz.map(q => q.audio + '|' + q.options.join('/'))).size, quiz.length, l.id)
      if (l.pairs!.length < 6) assert.equal(quiz.length, Math.min(8, l.pairs!.length * 2), l.id + ' 組數少的課，兩個字都會考到')
    }
    if (l.kind === 'endings') {
      assert.equal(quiz.filter(q => q.options.includes('[t]')).length, 4)
      assert.equal(quiz.filter(q => q.options.includes('[s]')).length, 4)
    }
  }
  const pairs = pronLessons.find(l => l.kind === 'pairs')!
  const picks = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed => quizFor(pairs, seed).map(q => q.audio).join()))
  assert.ok(picks.size > 4, '不同次的題目不一樣')
  // The answer is not always the first (or the second) word of a pair.
  const sides = [1, 2, 3, 4, 5, 6].flatMap(seed => quizFor(pairs, seed).map(q => q.answer))
  assert.ok(sides.includes(0) && sides.includes(1))
})

test('過關：測驗八成過關，留最好的一次；沒有測驗的音標表按了完成就算', () => {
  const [table, first] = pronLessons
  assert.equal(nextPron({})?.id, table.id)
  assert.deepEqual(pronProgress({}), { done: 0, total: pronLessons.length })
  let notes = savePron({}, table.id, { d: '2026-11-23', s: '2026-11-23' })
  assert.ok(pronPassed(table, readPron(notes, table.id)))
  assert.equal(nextPron(notes)?.id, first.id)
  notes = savePron(notes, first.id, { d: '2026-11-23', q: [4, 6] })
  assert.ok(!pronPassed(first, readPron(notes, first.id)), '6 題對 4 題還沒過')
  assert.equal(nextPron(notes)?.id, first.id)
  notes = savePron(notes, first.id, { d: '2026-11-24', q: [5, 6] })
  assert.ok(pronPassed(first, readPron(notes, first.id)), '6 題對 5 題過關')
  notes = savePron(notes, first.id, { d: '2026-11-25', q: [2, 6] })
  assert.deepEqual(readPron(notes, first.id), { d: '2026-11-25', q: [5, 6] }, '後來考差了，過關不會被收回')
  notes = savePron(notes, first.id, { s: '2026-11-25' })
  assert.deepEqual(readPron(notes, first.id), { d: '2026-11-25', q: [5, 6], s: '2026-11-25' }, '念句子的紀錄和測驗並存')
  assert.ok(!pronPassed(first, { q: [6, 8] }) && pronPassed(first, { q: [7, 8] }))
  assert.deepEqual(pronProgress(notes), { done: 2, total: pronLessons.length })
  for (const l of pronLessons) notes = savePron(notes, l.id, { d: '2026-12-01', q: [8, 8] })
  assert.equal(nextPron(notes), null)
  assert.equal(readVoice({}), 'both', '沒選過就是女聲、男聲都聽')
  assert.equal(readVoice({ [voiceKey]: 'm' }), 'm')
  assert.equal(readVoice({ [voiceKey]: 'f' }), 'f')
  assert.equal(readVoice({ [voiceKey]: 'x' }), 'both')
})

test('發音包：每一堂女聲、男聲各一包，課裡每個字和句子都有錄音', async () => {
  let bytes = 0
  for (const l of pronLessons) for (const v of pronVoices) {
    const file = new URL(packFile(l.id, v), root)
    assert.ok(existsSync(file), packFile(l.id, v) + ' 存在')
    const raw = readFileSync(file)
    bytes += raw.length
    const clips = unpack(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length) as ArrayBuffer)
    const wanted = lessonTexts(l).map(clipSlug)
    assert.deepEqual([...clips.keys()].sort(), [...wanted].sort(), packFile(l.id, v) + ' 剛好是這一堂的字')
    for (const [name, blob] of clips) {
      assert.equal(blob.type, 'audio/mpeg')
      assert.ok(blob.size > 1500, name + ' 不是空的')
      const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
      assert.ok(head[0] === 0xff && (head[1] & 0xe0) === 0xe0, name + ' 是 mp3')
    }
  }
  assert.equal(readdirSync(new URL('pron/', root)).length, pronLessons.length * pronVoices.length, 'pron 資料夾沒有多餘的檔案')
  assert.ok(bytes < 7_000_000, '全部發音包不超過 7 MB：' + bytes)
})
