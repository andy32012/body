import test from 'node:test'
import assert from 'node:assert/strict'
import curriculum from '../src/data/curriculum.json'
import grammar from '../src/data/grammar.json'
import lessons from '../src/data/lessons.json'
import { checkDrill } from '../src/lib/grammar'

const text = (o: unknown) => JSON.stringify(o)
const g = (n: number) => grammar.find(u => u.unit === n)!
const c = (n: number) => curriculum.units.find(u => u.id === n)!

test('U1: be is for nouns, adjectives and places, not every sentence', () => {
  const u = g(1)
  assert.ok(!text(u).includes('英文句子不能少了它'))
  assert.ok(u.steps[0].ex.some(e => e.en === 'I study English.'), 'contrast example with an ordinary verb')
  assert.ok(u.mistakes.some(m => m.bad === 'I am study English.'))
})

test('U20: all/both take "of" optionally before the/my, always before pronouns', () => {
  for (const u of [g(20), c(20)]) assert.ok(!text(u).includes('後面接 the、my 或代名詞時要加 of'))
  assert.match(g(20).steps[1].p, /all 和 both 的 of 可加可不加/)
  assert.match(c(20).rule, /all 的 of 可加可不加/)
  assert.match(c(20).rule, /接代名詞時都要 of/)
})

test('U35: help + person + (to) + verb are both right', () => {
  const all = text(grammar) + text(curriculum)
  assert.ok(!all.includes('make／let／help＋人＋原形，中間不加 to'))
  assert.ok(!all.includes('help 後面接人再接原形，不加 to'))
  assert.match(g(35).steps[1].p, /help him carry／help him to carry/)
  const u8 = c(8).days[3]
  assert.ok(u8.reference.includes('The nurse helped the patient to wash his hands.'), 'the to-form is accepted too')
})

test('scoped rules: U22 when, U27 emphatic did, U46 symptoms, U47 separable verbs, U51 mixed conditional', () => {
  assert.match(g(22).steps[2].p, /I don't know when he will come/)
  assert.match(g(27).steps[1].p, /特別強調/)
  assert.ok(!text(c(27)).includes('不是 What did happen?'))
  const fix27 = g(27).drills.find(d => d.k === 'fix' && d.q.startsWith('Who did'))!
  assert.equal(fix27.q, 'Who did helped you?', 'the drill error is wrong in every context, not just a neutral one')
  assert.ok(checkDrill(fix27, 'Who helped you?'))
  assert.ok(!g(46).table.rows.some(r => r[0] === '小毛病'))
  assert.match(g(46).steps[1].p, /have the flu/)
  assert.match(g(47).steps[2].p, /look after them，不說 look them after/)
  assert.match(c(47).rule, /不能拆開/)
  assert.match(g(51).mistakes[1].bad, /last week/)
  assert.match(g(51).steps[2].p, /混合假設/)
})

test('U52 habit example means going to bed late, U1 alt has no comma splice, U5 sample answers all three', () => {
  assert.ok(!text(c(52)).includes('Sleeping late is a bad habit.'))
  assert.ok(text(c(52)).includes('Staying up late is a bad habit.'))
  const v = lessons[0].variations.find(x => x.zh === '他不是醫生，他是病人。')!
  for (const a of v.alt ?? []) assert.ok(!/doctor, he/.test(a), 'no comma splice: ' + a)
  const p5 = lessons[4].prompts[4]
  for (const q of ['cook', 'exercise', 'read at night']) assert.ok(p5.sample.includes('Do you ' + q + '?'), 'sample answers ' + q)
})

test('every nested copy of a sentence matches the copy the app shows', () => {
  for (const unit of curriculum.units) {
    const used = new Map<string, { zh: string; reference: string[]; why: string; hints: string[] }>()
    for (const s of [...unit.days, ...unit.checkpoint, ...unit.backup]) if (!used.has(s.id)) used.set(s.id, s)
    for (const s of [...unit.checkpoint, ...unit.backup]) used.set(s.id, s)
    for (const day of unit.days) for (const n of (day as { sentences?: typeof unit.checkpoint }).sentences ?? []) {
      const canon = used.get(n.id)
      if (!canon) continue
      for (const k of ['zh', 'reference', 'why', 'hints'] as const) assert.deepEqual(n[k], canon[k], n.id + ' ' + k)
    }
  }
})
