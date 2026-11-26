import test from 'node:test'
import assert from 'node:assert/strict'
import curriculum from '../src/data/curriculum.json' with { type: 'json' }
import schedule from '../src/data/curriculumSchedule.json' with { type: 'json' }
import lessons from '../src/data/lessons.json' with { type: 'json' }
import passages from '../src/data/passages.json' with { type: 'json' }
import levels from '../src/data/levels.json' with { type: 'json' }
import starters from '../src/data/starters.json' with { type: 'json' }
import sentences from '../src/data/sentences.json' with { type: 'json' }
import reading from '../src/data/reading.json' with { type: 'json' }
import { matchesReference } from '../src/lib/evidence.ts'
import { spellingMatches, wordUsed } from '../src/lib/wordSkills.ts'

type Hint = { en: string; zh: string; form?: string }
const hint = (id: string, form: string) => (passages as { id: string; words: Hint[] }[]).find(p => p.id === id)!.words.find(w => (w.form ?? w.en) === form)!.zh
const norm = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, '').trim()

test('7000 單短文：點字提示是這一句裡的意思', () => {
  assert.match(hint('L1-C10', 'clear'), /晴朗/)
  assert.match(hint('L1-S06', 'stop'), /站/)
  assert.match(hint('L1-H02', 'heated'), /加熱/)
  assert.match(hint('L1-B02', 'bats'), /球棒/)
  assert.match(hint('L1-F12', 'free'), /免費/)
  assert.match(hint('L1-F05', 'free'), /有空/)
  assert.match(hint('L2-C15', 'China'), /中國/)
  assert.match(hint('L4-G06', 'glorious'), /壯麗/)
  assert.doesNotMatch(hint('L5-U02', 'unemployment'), /率/)
})

test('單字表：每個意思都配到詞性，常見的第二個意思補上了', () => {
  for (const e of levels as { en: string; zh: string; sensePos?: string[] }[]) {
    if (e.sensePos) assert.equal(e.sensePos.length, e.zh.split('；').length, e.en + ' 的詞性數量要對上意思數量')
  }
  const entry = (en: string) => (levels as { en: string; zh: string; forms?: { forms: string[]; zh: string }[] }[]).find(e => e.en === en)!
  assert.match(entry('stop').zh, /站/)
  assert.match(entry('full').zh, /吃飽/)
  assert.match(entry('few').zh, /a few 是「幾個」/)
  assert.match(entry('a/an').forms![1].zh, /發音/)
})

test('文法課：小關卡考新句子，同一句中文不會有兩套答案', () => {
  const byUnit = new Map((lessons as { unit: number; variations: { zh: string; en: string; alt?: string[] }[] }[]).map(l => [l.unit, l]))
  for (const u of curriculum.units) {
    const shown = new Set([...u.days.slice(0, 5).flatMap(d => d.reference), ...(u.examples ?? []), ...(byUnit.get(u.id)?.variations ?? []).flatMap(v => [v.en, ...(v.alt ?? [])])].map(norm))
    const varZh = new Set((byUnit.get(u.id)?.variations ?? []).map(v => v.zh))
    for (const c of u.checkpoint) {
      assert.ok(!c.reference.some(r => shown.has(norm(r))), c.id + ' 已經在這一單元出現過')
      assert.ok(!varZh.has(c.zh), c.id + ' 跟換個說法同一句中文')
    }
    // Every stored answer is accepted by the checker.
    for (const s of [...u.days, ...u.checkpoint, ...u.backup]) for (const r of s.reference) assert.ok(matchesReference(r, s.reference), s.id + ' ' + r)
  }
})

test('文法規則：講太死的地方改掉了', () => {
  const rule = (id: number) => curriculum.units.find(u => u.id === id)!.rule
  assert.match(rule(22), /before eating/)
  assert.match(rule(8), /stopped/)
  assert.match(rule(18), /Sometimes she is late/)
  const u38 = curriculum.units.find(u => u.id === 40)!.days[4]
  assert.ok(!u38.zh.includes('按時') || u38.reference.every(r => /on time/.test(r)), 'u38-d5 的中文和答案要說同一件事')
  const start05 = (starters as { id: string; hints: string[] }[]).find(s => s.id === 'start-05')!
  assert.notEqual(start05.hints[0], '單數可數名詞前面要加 a。')
  const s062 = (sentences as { id: string; hints: string[] }[]).find(s => s.id === 's-062')!
  assert.match(s062.hints[1], /cheap/)
  const start13 = (starters as { id: string; reference: string[] }[]).find(s => s.id === 'start-13')!
  assert.ok(matchesReference('I want to drink water.', start13.reference))
  // Units 5–8: a past sentence needs a past clue in the Chinese; common correct answers are accepted.
  const u8 = curriculum.units.find(u => u.id === 8)!
  assert.match(u8.checkpoint[1].zh, /剛才/)
  assert.ok(matchesReference('The nurse helped the patient wash his hands.', u8.days[3].reference))
  const u7 = curriculum.units.find(u => u.id === 7)!
  assert.ok(matchesReference('I was home yesterday.', u7.days[0].reference))
  const l7 = (lessons as { unit: number; dialogue: { en: string; zh: string }[] }[]).find(l => l.unit === 7)!
  assert.equal(l7.dialogue.find(d => d.en === 'Was he hungry this morning?')!.zh, '他今天早上有餓嗎？')
})

test('護理內容：消防演習不叫讀者自己關氧氣；實習與國考期的時間跟每日計畫一致', () => {
  const msg = (reading as { id: string; paras: string[] }[]).find(p => p.id === 'a2-message')!.paras.join(' ')
  assert.doesNotMatch(msg, /check that all oxygen is turned off/)
  assert.match(msg, /unless she asks you to/)
  assert.doesNotMatch(JSON.stringify(schedule), /每天 2 分鐘/)
})

test('拼字與造句判定：點號拼字不算對，不規則變化算有用到', () => {
  assert.equal(spellingMatches('t.i.s.s.u.e', 'tissue'), false)
  assert.equal(spellingMatches('c.a.f.e', 'café'), false)
  assert.equal(spellingMatches('tissue', 'tissue'), true)
  assert.equal(spellingMatches('cafe', 'café'), true)
  assert.equal(spellingMatches('a.m.', 'am/a.m.'), true)
  assert.equal(spellingMatches('him', 'he (him, his, himself)'), true)
  assert.equal(wordUsed('I went yesterday.', 'go'), true)
  assert.equal(wordUsed('I grew tomatoes.', 'go'), false)
  assert.equal(wordUsed('The children are here.', 'child'), true)
  assert.equal(wordUsed('I am looking for a job.', 'look for'), true)
  assert.equal(wordUsed('She stopped.', 'stop'), true)
})

test('造句檢查：T-shirt、a.m.、p.m.、O.K.、acknowledgment 這些字表裡的寫法，寫了就算用到', async () => {
  const { wordUsed } = await import('../src/lib/wordSkills.ts')
  assert.equal(wordUsed('I wear a T-shirt.', 'T-shirt'), true)
  assert.equal(wordUsed('We meet at 8 a.m.', 'am/a.m.'), true)
  assert.equal(wordUsed('It is 3 p.m. now', 'pm/p.m.'), true)
  assert.equal(wordUsed('That is O.K. with me', 'O.K./OK/okay'), true)
  assert.equal(wordUsed('I sent an acknowledgment.', 'acknowledge(ment)'), true)
  assert.equal(wordUsed('I like cats.', 'T-shirt'), false)
})
