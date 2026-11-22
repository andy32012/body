import test from 'node:test'
import assert from 'node:assert/strict'
import listening from '../src/data/nursing-listening.json' with { type: 'json' }
import nursingReading from '../src/data/nursing-reading.json' with { type: 'json' }
import nursingWords from '../src/data/nursing-words.json' with { type: 'json' }
import reading from '../src/data/reading.json' with { type: 'json' }
import lessons from '../src/data/lessons.json' with { type: 'json' }
import topics from '../src/data/topics.json' with { type: 'json' }
import bridge from '../src/data/bridge.json' with { type: 'json' }
import curriculum from '../src/data/curriculum.json' with { type: 'json' }
import {
  countNurseWord, heardWell, lastNurseListening, nextNurseListening, nurseInstructions, nurseListenKey, nurseSlot, nurseWordsOn,
  readLastHeard, type NurseListening, type NurseWord,
} from '../src/lib/nursing.ts'
import { forms } from '../src/lib/baseline.ts'
import { wordCount } from '../src/lib/writing.ts'
import type { ReadPassage } from '../src/lib/reading.ts'

const dialogues = listening as NurseListening[]
const passages = nursingReading as ReadPassage[]
const words = nursingWords as NurseWord[]

test('護理聽力：每段都有完整聽力稿（每句英文配中文）、三題、重點字，角色對得上', () => {
  assert.ok(dialogues.length >= 30, '至少 30 段')
  assert.equal(new Set(dialogues.map(d => d.id)).size, dialogues.length, 'id 不重複')
  for (const d of dialogues) {
    assert.ok(['A2', 'B1', 'B2'].includes(d.level), d.id + ' 程度')
    assert.ok(['en-US', 'en-GB', 'en-AU'].includes(d.accent), d.id + ' 口音')
    assert.ok(d.title && d.scene, d.id + ' 標題和情境')
    assert.ok(d.dialogue.length >= 8, d.id + ' 至少 8 句')
    for (const line of d.dialogue) assert.ok(line.who && line.en.trim() && line.zh.trim(), d.id + ' 每句都要有英文和中文：' + line.en)
    const who = new Set(d.dialogue.map(l => l.who))
    assert.ok(who.has(d.you) && who.has(d.emma) && d.you !== d.emma, d.id + ' 他演的角色和 Emma 演的角色都在對話裡')
    assert.equal(d.questions.length, 3, d.id + ' 三題')
    for (const q of d.questions) {
      assert.equal(q.options.length, 3, d.id + ' 三個選項')
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 3, d.id + ' 答案在選項裡')
      assert.equal(new Set(q.options).size, 3, d.id + ' 選項不重複')
    }
    assert.ok(d.words.length >= 4 && d.words.every(w => w.en && w.zh), d.id + ' 重點字有中文')
  }
  // The right answer is not always in the same place.
  for (let i = 0; i < 3; i++) assert.ok(new Set(dialogues.map(d => d.questions[i].answer)).size === 3, '第 ' + (i + 1) + ' 題的答案位置有變化')
})

test('聽力稿：app 裡每一種聽力都有英文稿和中文，交卷或作答後看得到', () => {
  for (const f of Object.values(forms)) assert.ok(f.listen.trim() && f.listenZh.trim(), '起點測驗的聽力有中文')
  for (const l of lessons as { unit: number; dialogue: { en: string; zh: string }[] }[])
    for (const line of l.dialogue) assert.ok(line.en && line.zh, '單元 ' + l.unit + ' 的對話每句有中文')
  for (const t of topics as { id: string; listen: { dialogue: { en: string; zh: string }[] } }[])
    for (const line of t.listen.dialogue) assert.ok(line.en && line.zh, '生活主題 ' + t.id + ' 的對話每句有中文')
  for (const p of bridge as { unit: number; listen: { dialogue: { en: string; zh: string }[] }[]; heldListen: { dialogue: { en: string; zh: string }[] } }[])
    for (const l of [...p.listen, p.heldListen]) for (const line of l.dialogue) assert.ok(line.en && line.zh, '橋接 ' + p.unit + ' 的聽力每句有中文')
  for (const u of curriculum.units) for (const d of u.days) for (const s of (d as { listening?: { en: string; zh: string }[] }).listening ?? [])
    assert.ok(s.en && s.zh, '單元 ' + u.unit + ' 跟讀句有中文')
})

test('護理閱讀：和閱讀理解同一個格式，字數算對、證據在文章裡、id 不和一般閱讀撞', () => {
  assert.ok(passages.length >= 24)
  const general = new Set((reading as ReadPassage[]).map(p => p.id))
  assert.equal(new Set(passages.map(p => p.id)).size, passages.length)
  for (const p of passages) {
    assert.ok(p.id.startsWith('n-') && !general.has(p.id), p.id + ' 用 n- 開頭，不和一般閱讀共用紀錄')
    assert.ok(['A2', 'B1', 'B2'].includes(p.level), p.id)
    assert.equal(p.topic, '護理')
    assert.equal(p.words, wordCount(p.paras.join(' ')), p.id + ' 字數')
    assert.ok(p.zh.trim(), p.id + ' 中文大意')
    assert.ok(p.qs.length >= 3, p.id + ' 至少 3 題')
    const text = p.paras.join(' ')
    for (const q of p.qs) {
      assert.ok(q.answer >= 0 && q.answer < q.options.length, p.id + ' ' + q.q)
      assert.ok(q.why.trim(), p.id + ' 每題有解析')
      if (q.type === 'tfng') assert.deepEqual(q.options, ['True', 'False', 'Not Given'], p.id)
      if (q.evidence) assert.ok(text.includes(q.evidence), p.id + ' 證據要在文章裡：' + q.evidence)
    }
  }
})

test('護理單字：240 個、不重複、十個範圍，每個字都有中文和例句', () => {
  assert.ok(words.length >= 240)
  assert.equal(new Set(words.map(w => w.en.toLowerCase())).size, words.length, '英文不重複')
  assert.ok(new Set(words.map(w => w.area)).size >= 10)
  for (const w of words) assert.ok(w.en && w.zh && w.area && w.ex && w.exZh, w.en)
})

test('護理聽力的順序：沒聽過的先，再來是還沒只聽就全對的（舊的先），最後才重聽', () => {
  const [a, b, c] = dialogues
  const rec = (day: string, correct: number, heard = true) => JSON.stringify({ day, correct, total: 3, heard, plays: 1 })
  const list = [a, b, c]
  assert.equal(nextNurseListening(list, {})!.id, a.id)
  const notes = { [nurseListenKey(a.id)]: rec('2028-02-02', 3), [nurseListenKey(b.id)]: rec('2028-02-03', 1) }
  assert.equal(nextNurseListening(list, notes)!.id, c.id, '還沒聽的 c 先')
  const all = { ...notes, [nurseListenKey(c.id)]: rec('2028-02-01', 3, false) }
  assert.equal(nextNurseListening(list, all)!.id, c.id, 'c 看過字才答對，不算只聽就懂，而且比 b 舊')
  assert.equal(nextNurseListening(list, all, [c.id])!.id, b.id)
  assert.equal(heardWell(JSON.parse(all[nurseListenKey(a.id)])), true)
  assert.equal(lastNurseListening(list, all)!.id, b.id, '最近聽的是 b')
})

test('實習日的第三格每天輪流：單字、口說、護理題，三天輪一次', () => {
  const days = ['2028-03-01', '2028-03-02', '2028-03-03']
  assert.deepEqual(new Set(days.map(nurseSlot)), new Set(['words', 'speak', 'quiz']))
  assert.equal(nurseSlot('2028-03-04'), nurseSlot('2028-03-01'))
  let notes: Record<string, string> = {}
  notes = countNurseWord(countNurseWord(notes, '2028-03-01'), '2028-03-01')
  assert.equal(nurseWordsOn(notes, '2028-03-01'), 2)
  assert.equal(nurseWordsOn(notes, '2028-03-02'), 0)
  assert.equal(readLastHeard({ 'nurse.last': '{bad' }), null)
  assert.equal(readLastHeard({ 'nurse.last': JSON.stringify({ id: 'nl-01', title: 'x', you: 'Nurse Kim', day: '2028-03-01' }) })!.id, 'nl-01')
})

test('跟 Emma 演一段：她演對方，他演護理師，語音辨識不評發音', () => {
  const d = dialogues[0]
  const text = nurseInstructions(d)
  assert.match(text, new RegExp('You play ' + d.emma))
  assert.match(text, new RegExp('He plays ' + d.you))
  assert.match(text, /do not comment on his pronunciation/)
})
