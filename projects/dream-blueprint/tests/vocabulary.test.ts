import assert from 'node:assert/strict'
import test from 'node:test'
import { getScreeningQueue, isKnownWord, officialWords, wordKey } from '../src/lib/vocab'
import { dailyQueue, dailyTarget } from '../src/lib/dailyWords'
import { seedOf, skyCount } from '../src/lib/starfield'
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
  assert.equal(dailyTarget({},false,'2026-11-24'),8)
  assert.equal(dailyTarget({'daily-word.count':'15'},false,'2026-11-24'),15)
  assert.equal(dailyTarget({'daily-word.count':'15'},true,'2026-11-14'),1)
  assert.equal(dailyTarget({'daily-word.more.2026-11-14':'1'},true,'2026-11-14'),8)
})

test('單字卡背景：前 300 個單字至少有 100 種不同的星圖或照片', () => {
  const kinds = new Set(officialWords.slice(0,300).map(w => {
    const seed = seedOf(w.en)
    return seed % 3 === 0 ? 'photo' + (Math.floor(seed / 3) % 56) : 'sky' + (seed % skyCount)
  }))
  assert.ok(kinds.size >= 100, String(kinds.size))
})
