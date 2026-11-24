import test from 'node:test'
import assert from 'node:assert/strict'
import curriculum from '../src/data/curriculum.json' with { type: 'json' }
import lessons from '../src/data/lessons.json' with { type: 'json' }
import grammar from '../src/data/grammar.json' with { type: 'json' }
import topics from '../src/data/topics.json' with { type: 'json' }
import levels from '../src/data/levels.json' with { type: 'json' }
import { untaught } from './taughtRules.ts'

type Item = { where: string; unit: number; en: string; teaching: string }
const words = (list?: { en: string; zh?: string }[]) => (list ?? []).map(w => w.en + ' ' + (w.zh ?? '')).join(' ')
const ruleOf = new Map(curriculum.units.map(u => [u.unit, u.rule ?? '']))
const stepsOf = new Map(grammar.map(g => [g.unit, g.steps.map(s => s.t + ' ' + s.p + ' ' + s.ex.map(e => e.en).join(' ')).join(' ')]))

/** Everything he has to write himself: lesson sentences, the variations, the grammar drills, the life topics' sentences. */
function items(): Item[] {
  const out: Item[] = []
  for (const u of curriculum.units) {
    for (const s of [...u.days, ...u.checkpoint, ...u.backup])
      out.push({ where: s.id, unit: u.unit, en: s.reference[0], teaching: [s.hints.join(' '), s.why, words(s.newWords), u.rule].join(' ') })
  }
  for (const l of lessons)
    for (const v of l.variations) out.push({ where: '換個說法 u' + l.unit, unit: l.unit, en: v.en, teaching: ruleOf.get(l.unit) ?? '' })
  for (const g of grammar) {
    for (const d of g.drills) {
      const en = d.k === 'choose' ? d.q.replace('___', d.options![d.answer as number])
        : d.k === 'fill' ? (d.accept![0].split(' / ').reduce((q, a) => q.replace('___', a), d.q)).replace(/\s*\([^)]*\)|（[^）]*）/g, '')
        : d.accept![0]
      out.push({ where: '小練習 u' + g.unit, unit: g.unit, en, teaching: [d.why, ruleOf.get(g.unit), stepsOf.get(g.unit)].join(' ') })
    }
  }
  for (const t of topics) {
    const box = [t.grammar.title, ...t.grammar.points, ...t.grammar.examples.map(e => e.en)].join(' ')
    for (const p of [...t.practice, ...t.review.practice])
      out.push({ where: p.id, unit: t.after, en: p.reference[0], teaching: [box, p.hints.join(' '), p.why].join(' ') })
  }
  return out
}

test('先教再用：要他自己寫的句子，不會用到還沒教、旁邊也沒教的文法', () => {
  const all = items()
  assert.ok(all.length > 1500, '檢查了 ' + all.length + ' 句')
  const found = all.flatMap(i => untaught(i.en, i.unit, i.teaching).map(r => i.where + '（單元 ' + i.unit + '）用到單元 ' + r.unit + ' 的' + r.name + '：' + i.en))
  assert.deepEqual(found, [], '\n' + found.join('\n'))
})

test('先教再用的檢查本身：抓得到，也不會誤判常見的早期說法', () => {
  assert.deepEqual(untaught('She has finished her homework.', 10).map(r => r.unit), [25])
  assert.deepEqual(untaught('The room is cleaned every day.', 20).map(r => r.unit), [30])
  assert.deepEqual(untaught('He was tired, so he stayed home.', 12).map(r => r.unit), [21])
  assert.deepEqual(untaught('He was tired, so he stayed home.', 12, '所以＝so').map(r => r.unit), [], '旁邊有教就算教過')
  assert.deepEqual(untaught('I study English every day.', 4), [], 'every day 是時間說法，不算限定詞')
  assert.deepEqual(untaught('I want to go home, but I am busy.', 4), [], 'want to、but 是第一級就會用的')
  assert.deepEqual(untaught('The test was easy.', 7), [], 'the test 不是最高級')
  assert.deepEqual(untaught('Is this boring?', 2), [], '-ing 形容詞不是進行式')
})

// ── Words: a word above level 4 of the 7000-word list (or not in it at all) must have been a new word by then.
const levelOf = new Map<string, number>()
for (const w of levels as { en: string; level: number }[]) for (const f of w.en.toLowerCase().split(/[/,()]/)) { const k = f.trim(); if (k && !levelOf.has(k)) levelOf.set(k, w.level) }
const irregular: Record<string, string> = { went: 'go', saw: 'see', ate: 'eat', bought: 'buy', came: 'come', did: 'do', had: 'have', got: 'get', gotten: 'get', took: 'take', made: 'make', said: 'say', told: 'tell', found: 'find', gave: 'give', knew: 'know', left: 'leave', met: 'meet', paid: 'pay', ran: 'run', rang: 'ring', sat: 'sit', slept: 'sleep', spoke: 'speak', spent: 'spend', stood: 'stand', thought: 'think', understood: 'understand', woke: 'wake', wore: 'wear', wrote: 'write', began: 'begin', broke: 'break', brought: 'bring', caught: 'catch', chose: 'choose', drank: 'drink', drunk: 'drink', drove: 'drive', fell: 'fall', felt: 'feel', forgot: 'forget', heard: 'hear', kept: 'keep', lost: 'lose', rode: 'ride', sang: 'sing', sent: 'send', sold: 'sell', swam: 'swim', taught: 'teach', threw: 'throw', won: 'win', children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth', gone: 'go', done: 'do', seen: 'see', eaten: 'eat', taken: 'take', given: 'give', written: 'write', known: 'know', broken: 'break', chosen: 'choose', fallen: 'fall', forgotten: 'forget', spoken: 'speak', woken: 'wake', worn: 'wear', driven: 'drive', ridden: 'ride', grown: 'grow', shown: 'show', lying: 'lie', mom: 'mother', dad: 'father', is: 'be', are: 'be', am: 'be', was: 'be', were: 'be', been: 'be', has: 'have', does: 'do', doing: 'do', going: 'go' }
function forms(t: string) {
  const out = new Set([t, irregular[t] ?? t])
  for (const [suf, rep] of [["'s", ''], ['ies', 'y'], ['ied', 'y'], ['es', ''], ['s', ''], ['ed', ''], ['d', ''], ['ing', ''], ['ing', 'e'], ['er', ''], ['r', ''], ['est', ''], ['st', ''], ['ly', ''], ['ier', 'y'], ['iest', 'y'], ['ily', 'y']])
    if (t.endsWith(suf) && t.length > suf.length + 2) out.add(t.slice(0, -suf.length) + rep)
  const doubled = t.match(/^(.*?)(.)\2(ed|ing|er|est)$/)
  if (doubled) out.add(doubled[1] + doubled[2])
  return out
}
function wordLevel(t: string): number {
  let best = Math.min(9, ...[...forms(t)].map(f => levelOf.get(f) ?? 9))
  // A compound of two easy words (classroom, roommate, bedtime) is as easy as its harder half.
  for (let i = 3; best === 9 && i < t.length - 2; i++) {
    const a = Math.min(9, ...[...forms(t.slice(0, i))].map(f => levelOf.get(f) ?? 9)), b = Math.min(9, ...[...forms(t.slice(i))].map(f => levelOf.get(f) ?? 9))
    if (a <= 4 && b <= 4) best = Math.max(a, b)
  }
  return best
}
const numbers = new Set('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand'.split(' '))

test('生字先教再用：課文句子裡 5–6 級或字表外的字，這一課或之前一定當過新字（或提示裡有講）', () => {
  const taught = new Set<string>()
  const found: string[] = []
  for (const u of curriculum.units) {
    const all = [...u.days, ...u.checkpoint, ...u.backup]
    for (const s of all) for (const w of [...s.newWords, ...((s as { bonusWords?: { en: string }[] }).bonusWords ?? [])])
      for (const f of w.en.toLowerCase().split(/[/,]/)) { const k = f.trim(); taught.add(k); k.split(/\s+/).forEach(x => forms(x).forEach(y => taught.add(y))) }
    for (const s of all) {
      const teaching = (s.hints.join(' ') + ' ' + s.why).toLowerCase()
      for (const tok of s.reference[0].match(/[A-Za-z][A-Za-z'’-]*/g) ?? []) {
        const t = tok.toLowerCase().replace('’', "'")
        if ((t.includes("'") && !t.endsWith("'s")) || numbers.has(t)) continue
        if (tok[0] !== tok[0].toLowerCase() && wordLevel(t) === 9) continue // names
        for (const part of t.split('-')) {
          if (wordLevel(part) <= 4 || [...forms(part)].some(f => taught.has(f)) || teaching.includes(part)) continue
          found.push(s.id + '（單元 ' + u.unit + '）「' + part + '」：' + s.reference[0])
        }
      }
    }
  }
  assert.deepEqual(found, [], '\n' + found.join('\n'))
})
