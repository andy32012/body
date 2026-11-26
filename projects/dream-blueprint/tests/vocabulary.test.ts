import assert from 'node:assert/strict'
import test from 'node:test'
import { getScreeningQueue, isKnownWord, officialWords, wordKey } from '../src/lib/vocab'
import { changeSorted, dailyQueue, dailyTarget, dailyWordPhoto, readSorted, recordSorted, spotCheck } from '../src/lib/dailyWords'
import { photos } from '../src/lib/cosmos'
import passages from '../src/data/passages.json'
import { doneKey, levelProgress, nextPassage, redoKey } from '../src/lib/passages'
import wordParts from '../src/data/medical-parts.json'

test('六級條目和醫護構詞都有可離線的中文釋義', () => {
  assert.deepEqual([1,2,3,4,5,6].map(level => officialWords.filter(w => w.level === level).length),
    [1002,1002,1002,1002,1002,1002])
  assert.ok(officialWords.every(w => w.zh.trim()))
  assert.equal(new Set(wordParts.map(entry => entry.part)).size, 60)
})

test('認得、待學及同義表記都從新字快篩排除', () => {
  assert.ok(isKnownWord(' Gloves ', ['glove(s)']))
  assert.ok(isKnownWord('a/an', ['AN']))
  assert.ok(isKnownWord('argument',['argue(argument)']))
  const imported = [{en:'gloves', zh:'手套'},{en:'contrast agent',zh:'顯影劑'}]
  const queue = getScreeningQueue(['glove'], ['contrast agent'], imported)
  assert.ok(queue.every(w => w.level === 1 || w.level === 2))
  assert.ok(!queue.some(w => wordKey(w.en) === wordKey('gloves')))
  assert.ok(!queue.some(w => w.en === 'contrast agent'))
  assert.equal(getScreeningQueue([],[],[{en:'glove',zh:'手套'}]).filter(w => wordKey(w.en) === wordKey('gloves')).length,1)
})

test('相同進度保留快篩順序；做完一個就接下一個', () => {
  const initial = getScreeningQueue([],[],[])
  const next = getScreeningQueue([initial[0].en],[],[])
  assert.equal(initial.length,2004)
  assert.equal(initial[1].en,next[0].en)
  assert.equal(next.length,2003)
})

test('今日單字從最低級開始，分過類的字不再出現；考週預設只排一個', () => {
  const first = dailyQueue([],[])
  assert.equal(first[0].level,1)
  assert.equal(first.length,6012)
  const next = dailyQueue([first[0].en],[first[1].en])
  assert.equal(next[0].en,first[2].en)
  assert.equal(dailyTarget({},false,'2026-11-24'),20)
  assert.equal(dailyTarget({'daily-word.count':'30'},false,'2026-11-24'),30)
  assert.equal(dailyTarget({'daily-word.count':'15'},false,'2026-11-24'),15)
  assert.equal(dailyTarget({'daily-word.count':'15'},true,'2026-11-14'),1)
  assert.equal(dailyTarget({'daily-word.more.2026-11-14':'1'},true,'2026-11-14'),20)
})

test('今日單字每 56 個字看完整組實拍照，回頭看同一個字會配回同一張', () => {
  const catalogue = new Set(photos.map(photo => photo.id))
  const sequence = officialWords.map(word => dailyWordPhoto(word.en).id)
  for (let i = 0; i + photos.length <= sequence.length; i += photos.length) {
    assert.deepEqual(new Set(sequence.slice(i, i + photos.length)), catalogue)
  }
  assert.equal(dailyWordPhoto(officialWords[38].en).id, sequence[38])
})

test('7000 單短文：六級共 1,476 段，六級每段都有參考翻譯；做完的不再出現，標記不會的隔天才回來', () => {
  assert.equal(passages.length,1476)
  assert.equal(new Set(passages.map(p=>p.id)).size,1476)
  const first = passages.filter(p=>p.level===1)
  assert.equal(first.length,235)
  assert.ok(first.every(p=>p.en && p.en.length>20 && p.words))
  assert.ok(passages.every(p=>p.en && p.en.length>40 && p.words), '六級每段都要有參考翻譯')
  assert.equal(nextPassage(passages,1,{},{})?.id,'L1-A01')
  assert.equal(nextPassage(passages,1,{[doneKey('L1-A01')]:true},{})?.id,'L1-A02')
  assert.equal(nextPassage(passages,1,{},{[redoKey('L1-A01')]:'2026-11-21'},[],'','2026-11-21')?.id,'L1-A02')
  assert.equal(nextPassage(passages,1,{},{[redoKey('L1-A01')]:'2026-11-21'},[],'','2026-11-22')?.id,'L1-A01')
  assert.equal(nextPassage(passages,1,{},{},[],'Z')?.id,'L1-Z01')
  assert.deepEqual(levelProgress(passages,1,{[doneKey('L1-A01')]:true}),{done:1,total:235})
})

test('交接內容：寫出目前單元、今天這句與教法；沒有紀錄時也能產生', async () => {
  const { createInitialState } = await import('../src/lib/store')
  const { handoffText } = await import('../src/lib/handoff')
  const state = createInitialState('2026-11-20')
  state.curriculum = { ...state.curriculum, unit: 1, day: 4 }
  const text = handoffText(state, '2026-11-20')
  assert.ok(text.includes('單元 1（be 動詞現在式）第 4 天'))
  assert.ok(text.includes('她的血壓很高'))
  assert.ok(text.includes('不要先給答案'))
  assert.ok(text.includes('還沒有作答紀錄'))
})

test('今日單字往回看：記下今天的順序，改選擇時單字表和複習卡跟著改，看過的個數不變', () => {
  const day = '2026-11-22'
  let notes: Record<string, string> = { 'daily-word.done.2026-11-22': '2' }
  notes = recordSorted(notes, day, 'apple', true)
  notes = recordSorted(notes, day, 'green', false)
  assert.deepEqual(readSorted(notes, day), [{ k: 'apple', known: true }, { k: 'green', known: false }])
  assert.deepEqual(readSorted({ 'daily-word.sorted.2026-11-22': 'not json' }, day), [], '壞掉的紀錄當成空的')
  // 還不熟 → 認得: the new card made today goes away; the count stays 2.
  const start = { knownWords: ['apple'], learningWords: ['green'], notes,
    cards: [{ id: 'word:green', box: 1 as const, lastDay: day, due: '2026-11-23', mastered: false }] }
  const known = changeSorted(start, 'green', true, day)
  assert.deepEqual(known.learningWords, [])
  assert.ok(known.knownWords.includes('green'))
  assert.equal(known.cards.some(c => c.id === 'word:green' && c.box === 1), false)
  assert.equal(known.cards.some(c => c.id === 'word:green'), spotCheck('green'), '跟一般的「認得」一樣，四分之一兩週後抽查')
  assert.equal(known.notes['daily-word.done.2026-11-22'], '2')
  assert.deepEqual(readSorted(known.notes, day)[1], { k: 'green', known: true })
  // 認得 → 還不熟: becomes a new card due tomorrow.
  const back = changeSorted(known, 'apple', false, day)
  assert.ok(back.learningWords.includes('apple') && !back.knownWords.includes('apple'))
  const card = back.cards.find(c => c.id === 'word:apple')!
  assert.equal(card.box, 1)
  assert.equal(card.due, '2026-11-23')
  assert.deepEqual(readSorted(back.notes, day).map(e => e.k), ['apple', 'green'], '順序不變')
})

test('分級找字：打完整的字，那個字一定在結果裡、而且排第一（in 不會只找到 win、meeting）', async () => {
  const { lookupWords, officialWords } = await import('../src/lib/vocab.ts')
  for (const w of ['at', 'in', 'or', 'the']) {
    const found = lookupWords(officialWords, 1, w)
    assert.equal(found[0]?.en.toLowerCase(), w, w + ' 排第一')
  }
  // Every word of every level is found by typing it.
  for (const w of officialWords) assert.ok(lookupWords(officialWords, w.level, w.en).some(x => x.en === w.en), w.en + ' 找得到自己')
  assert.ok(lookupWords(officialWords, 1, 'in').length <= 12)
})
