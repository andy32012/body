import test from 'node:test'
import assert from 'node:assert/strict'
import { newCard, reviewEnergy, reviewLoad, sentenceReviewKey, SENTENCE_QUOTA, type ReviewCard, type ReviewEvent } from '../src/lib/progress.ts'
import { dailyTarget } from '../src/lib/dailyWords.ts'
import { planBlocks } from '../src/lib/dailyPlan.ts'
import { createInitialState, exportBackup, importBackup } from '../src/lib/store.ts'

const day = '2027-03-10'
const due = (id: string): ReviewCard => ({ ...newCard(id, '2027-03-01'), due: '2027-03-09' })
const words = (n: number, from = 0) => Array.from({ length: n }, (_, i) => due('word:w' + (from + i)))
const sentences = (n: number) => Array.from({ length: n }, (_, i) => due('u' + i + '-d1'))
const state = (cards: ReviewCard[], reviewEvents: ReviewEvent[] = [], notes: Record<string, string> = {}) => ({ cards, reviewEvents, notes })

test('今天的複習：單字卡到上限、句子卡一天 5 句，其餘排隊', () => {
  const load = reviewLoad(state([...words(130), ...sentences(40)]), day, 'normal')
  assert.equal(load.words, 100)
  assert.equal(load.backlog, 30, '超過一天上限的單字卡才算積壓')
  assert.equal(load.sentences, SENTENCE_QUOTA)
  assert.equal(load.queued, 35)
  assert.equal(load.minutes, 20 + 5, '五張單字卡一分鐘，一句一分鐘')
  // Reviewing uses up today's cap and quota.
  const done = Array.from({ length: 60 }, (_, i): ReviewEvent => ({ id: 'word:w' + i, day, gap: 1, remembered: true, shownAnswer: false }))
  const later = reviewLoad(state(words(70, 60), done, { [sentenceReviewKey(day)]: '3' }), day, 'normal')
  assert.equal(later.words, 40)
  assert.equal(later.backlog, 30)
  assert.equal(later.sentences, 0, '句子卡今天都沒有到期的了')
  assert.equal(reviewLoad(state([...sentences(9)], [], { [sentenceReviewKey(day)]: '3' }), day, 'normal').sentences, 2)
  // Exam and internship periods keep the short cap.
  const periods = [{ type: 'internship' as const, start: '2028-02-01', end: '2029-07-31' }]
  assert.equal(reviewEnergy('2028-03-01', periods), 'low')
  assert.equal(reviewEnergy('2027-03-01', periods), 'normal')
  assert.equal(reviewLoad(state(words(80)), day, 'low').backlog, 30)
})

test('新字煞車：只有今天複習不完的單字卡會擋新字，排隊的句子卡不會', () => {
  const backlog = (cards: ReviewCard[]) => reviewLoad(state(cards), day, 'normal').backlog
  assert.equal(dailyTarget({}, false, day, backlog([...words(90), ...sentences(300)])), 20, '句子卡排再多都不擋新字')
  assert.equal(dailyTarget({}, false, day, backlog(words(100))), 20, '今天清得完的卡不擋新字')
  assert.equal(dailyTarget({}, false, day, backlog(words(160))), 6, '積 60 張：新字減少')
  assert.equal(dailyTarget({}, false, day, backlog(words(180))), 0, '積 80 張：先暫停')
})

test('一天的計畫：複習多的日子，複習時間最多多 10 分鐘，從今日單字和說或寫挪，總時數不變', () => {
  const sum = (b: { min: number }[]) => b.reduce((n, x) => n + x.min, 0)
  assert.deepEqual(planBlocks(90, 0, 8).map(b => [b.id, b.min]), [['review', 15], ['lesson', 30], ['words', 10], ['input', 20], ['output', 15]])
  assert.deepEqual(planBlocks(90, 0, 18).map(b => [b.id, b.min]), [['review', 20], ['lesson', 30], ['words', 5], ['input', 20], ['output', 15]])
  assert.deepEqual(planBlocks(90, 0, 25).map(b => [b.id, b.min]), [['review', 25], ['lesson', 30], ['words', 5], ['input', 20], ['output', 10]])
  assert.equal(planBlocks(90, 0, 60).find(b => b.id === 'review')!.min, 25, '最多多 10 分鐘')
  assert.equal(sum(planBlocks(90, 0, 60)), 90)
  // A focus still comes out of review first; review then grows back toward what the cards need.
  const focused = planBlocks(90, 5, 25)
  assert.deepEqual(focused.slice(0, 2).map(b => [b.id, b.min]), [['focus', 5], ['review', 20]])
  assert.equal(sum(focused), 90)
  // 有電 (2 hours): the extra block gives first.
  const high = planBlocks(120, 0, 25)
  assert.equal(high.find(b => b.id === 'review')!.min, 25)
  assert.equal(high.find(b => b.id === 'extra')!.min, 20)
  assert.equal(high.find(b => b.id === 'words')!.min, 10)
  // Winter: review 20 → 30, out of 今日單字.
  const winter = planBlocks(180, 0, 30)
  assert.equal(winter.find(b => b.id === 'review')!.min, 30)
  assert.equal(winter.find(b => b.id === 'words')!.min, 10)
  assert.equal(sum(winter), 180)
  // Short days keep their shape.
  assert.deepEqual(planBlocks(15, 0, 25).map(b => [b.id, b.min]), [['review', 10], ['words', 5]])
})

test('存檔：240 天和 365 天格的卡片能存也能讀回來', () => {
  const s = createInitialState('2027-03-01')
  s.cards = [{ id: 'word:apple', box: 10, lastDay: '2027-03-01', due: '2028-02-29', mastered: true }]
  assert.equal(importBackup(exportBackup(s)).cards[0].box, 10)
})

test('等級階梯：每一段的 7000 單都寫了照計畫算得到的日期', async () => {
  const { steps } = await import('../src/lib/cefr.ts')
  for (const s of steps) if (s.words) assert.ok(s.wordsBy, s.from + '→' + s.to + ' 要寫 7000 單預計日期')
  // At 20 new words a day (the default), level 4 is seen before the internship starts in 2028-02.
  assert.match(steps.find(s => s.to === 'B1')!.wordsBy!, /第 4 級約 2027 年 12 月看完，趕在實習之前/)
  const { DEFAULT_DAILY, DAILY_CHOICES } = await import('../src/lib/dailyWords.ts')
  assert.equal(DEFAULT_DAILY, 20)
  assert.ok((DAILY_CHOICES as readonly number[]).includes(DEFAULT_DAILY))
})
