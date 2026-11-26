import test from 'node:test'
import assert from 'node:assert/strict'
import { createInitialState } from '../src/lib/store'
import { updateLesson } from '../src/lib/lesson'
import { matchesReference } from '../src/lib/evidence'
import curriculum from '../src/data/curriculum.json'
import sentences from '../src/data/sentences.json'
import {
  completePart, countSentences, dueTopic, judgeReview, judgeSpeak, readTopic, skipKey, speakGoals, topics, writeTopic,
} from '../src/lib/topics'

const inRange = (q: { options: string[]; answer: number }) => Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length

test('topic data: every question has a valid answer, every sentence a reference', () => {
  const ids = new Set<string>()
  const taken = new Set([...curriculum.units.flatMap(u => [...u.days, ...u.checkpoint, ...u.backup]).map(s => s.id), ...sentences.map(s => s.id)])
  let after = 0
  for (const t of topics) {
    assert.ok(t.after > after, t.id + ' unlocks after the topic before it')
    after = t.after
    assert.ok(t.words.length >= 6 && t.chunks.length >= 3, t.id + ' words')
    for (const q of t.wordCheck) { assert.ok(inRange(q), t.id + ' word check'); assert.ok(q.sentence.trim()) }
    for (const s of [...t.practice, ...t.review.practice]) {
      assert.ok(!ids.has(s.id) && !taken.has(s.id), 'unique id ' + s.id)
      ids.add(s.id)
      assert.ok(s.reference.length && s.reference.every(r => r.trim()), s.id + ' reference')
      assert.ok(s.hints.length >= 2 && s.why.trim(), s.id + ' hints')
      assert.ok(matchesReference(s.reference[0], s.reference), s.id + ' matches itself')
    }
    assert.equal(t.review.practice.length, 3, t.id + ' review has three new sentences')
    const L = t.listen
    assert.ok(inRange(L.gist) && L.details.every(inRange), t.id + ' listening answers')
    assert.ok(L.details.length >= 3)
    assert.ok(L.shadow.length && L.shadow.every(i => i >= 0 && i < L.dialogue.length), t.id + ' shadow lines')
    assert.ok(L.retell.trim() && L.retellSample.trim())
    const skills = new Set(t.read.questions.map(q => q.skill))
    for (const k of ['主旨', '細節', '指涉', '有沒有提供'] as const) assert.ok(skills.has(k), t.id + ' reading asks ' + k)
    assert.ok(t.read.questions.every(inRange), t.id + ' reading answers')
    // "Not given" questions: the right option is the one that says the text does not say.
    for (const q of t.read.questions.filter(q => q.skill === '有沒有提供')) assert.match(q.options[q.answer], /not say|^No\b/)
    for (const task of [t.speak, t.review.speak]) assert.ok(task.conditions.length >= 2 && task.sample.trim(), t.id + ' speaking task')
    assert.equal(t.write.minSentences, 3)
    const n = countSentences(t.write.sample)
    assert.ok(n >= 3 && n <= 5, t.id + ' writing sample has 3–5 sentences (' + n + ')')
  }
})

function base(unit: number) {
  const s = createInitialState('2026-11-01')
  return { ...s, curriculum: { ...s.curriculum, unit } }
}
type S = ReturnType<typeof base>
const grammarDay = (s: S, day: string): S => ({ ...s, sessions: [...s.sessions, { id: 'g' + day, day, energy: 'normal', period: 'semester', sentenceId: 'u1-d1', words: [] }] })
function finish(s: S, part: 'A' | 'B' | 'C', day: string, id = 't1'): S {
  const topic = topics.find(t => t.id === id)!
  return completePart(s, topic, part, day, 'normal', 'semester', 'topic-' + id + part + day)
}

test('topics unlock in order and take turns with grammar lessons', () => {
  assert.equal(dueTopic(base(1), '2026-11-22'), null)
  let s = base(2)
  assert.deepEqual([dueTopic(s, '2026-11-22')?.topic.id, dueTopic(s, '2026-11-22')?.part], ['t1', 'A'])
  s = finish(s, 'A', '2026-11-22')
  assert.equal(dueTopic(s, '2026-11-22'), null, 'one main lesson a day')
  assert.equal(dueTopic(s, '2026-11-23'), null, 'the next practice day is a grammar lesson')
  s = grammarDay(s, '2026-11-23')
  assert.equal(dueTopic(s, '2026-11-24')?.part, 'B')
  s = finish(s, 'B', '2026-11-24')
  s = grammarDay(s, '2026-11-25')
  assert.equal(dueTopic(s, '2026-11-26'), null, 'C waits three days after B; t2 is still locked')
  assert.equal(dueTopic({ ...s, curriculum: { ...s.curriculum, unit: 9 } }, '2026-11-26')?.topic.id, 't2', 'meanwhile the next topic starts')
  assert.equal(dueTopic(s, '2026-11-27')?.part, 'C')
  s = finish(s, 'C', '2026-11-27')
  assert.equal(nextOpen(s), null)
})
const nextOpen = (s: S) => dueTopic(grammarDay(s, '2026-12-01'), '2026-12-02')

test('skipping, a grammar lesson already started, and an unfinished part', () => {
  const s = base(2)
  assert.equal(dueTopic({ ...s, notes: { ...s.notes, [skipKey('2026-11-22')]: '1' } }, '2026-11-22'), null)
  assert.equal(dueTopic({ ...s, notes: updateLesson(s.notes, '2026-11-22', 2, 1) }, '2026-11-22'), null)
  // A part left open continues first, even the day after a topic day.
  let open = finish(s, 'A', '2026-11-20')
  open = { ...open, notes: writeTopic(open.notes, 't1', { cur: { part: 'B', step: 1, day: '2026-11-21' } }) }
  assert.deepEqual(dueTopic(open, '2026-11-22'), { topic: topics[0], part: 'B', step: 1 })
})

test('finishing a part: a practised day, review cards, words, and no double save', () => {
  let s = base(2)
  s = { ...s, notes: writeTopic(s.notes, 't1', { cur: { part: 'A', step: 4, day: '2026-11-22' }, items: {
    't1-p1': { level: 'independent', rating: 'correct', revealed: false },
    't1-p2': { level: 'assisted', rating: 'minor', revealed: true },
  } }) }
  const done = finish(s, 'A', '2026-11-22')
  const session = done.sessions.at(-1)!
  assert.equal(session.sentenceId, 'topic:t1:A')
  assert.equal(session.advanced, false)
  assert.deepEqual(session.translations?.map(t => [t.sentenceId, t.verified]), [['t1-p1', true], ['t1-p2', false]])
  assert.ok(done.cards.some(c => c.id === 't1-p1') && done.cards.some(c => c.id === 't1-p2'))
  assert.ok(done.cards.some(c => c.id === 'word:classmate'), 'dictionary words become word cards')
  const rec = readTopic(done.notes, 't1')
  assert.equal(rec.done.A, '2026-11-22')
  assert.equal(rec.cur, undefined)
  assert.equal(finish(done, 'A', '2026-11-22'), done, 'the same session is saved once')
})

test('speaking: only a checked transcript is 獨立, saying it alone is 待確認, pronunciation is never judged', () => {
  assert.equal(judgeSpeak({ said: false, transcript: ' ', help: [] }), null)
  assert.equal(judgeSpeak({ said: true, transcript: '', help: [] }), 'pending')
  assert.equal(judgeSpeak({ said: true, transcript: '', help: [], firstVerdict: 'good' }), 'pending', 'no transcript, nothing was checked')
  assert.equal(judgeSpeak({ said: false, transcript: 'Hi, I am Xuanye.', help: [] }), 'pending')
  assert.equal(judgeSpeak({ said: false, transcript: 'Hi, I am Xuanye.', help: ['cue'], firstVerdict: 'good' }), 'independent')
  assert.equal(judgeSpeak({ said: false, transcript: 'Hi, I am Xuanye.', help: ['sample'], firstVerdict: 'good' }), 'assisted')
  assert.equal(judgeSpeak({ said: false, transcript: 'I would like a refund.', help: [], firstVerdict: 'changed' }), 'assisted')
  assert.deepEqual(speakGoals([{ why: 'she 的動詞要加 s' }, { why: '少了 a' }, { why: '第三個' }], ['問對方兩個問題']), ['she 的動詞要加 s', '少了 a'])
  assert.deepEqual(speakGoals([], ['問對方兩個問題']), ['下次記得：問對方兩個問題'])
  assert.equal(speakGoals([], []).length, 2)
})

test('changed-context review: two sentences written alone and checked make it 延後換題仍能完成', () => {
  assert.equal(judgeReview(['independent', 'independent', 'assisted']), 'delayed')
  assert.equal(judgeReview(['independent', 'pending', 'assisted']), 'pending')
  assert.equal(judgeReview(['assisted', 'assisted', null]), 'assisted')
  assert.equal(judgeReview([null, null, 'independent']), null)
})

test('sentence count for 3–5 sentence messages', () => {
  assert.equal(countSentences("Hi everyone! I'm Xuanye. I get up at 7 a.m. every day."), 3)
  assert.equal(countSentences('Hi\nI am new here\nSee you'), 2, 'a one-word line is not a sentence')
  assert.equal(countSentences('Hi!\nOK.\nYes.'), 0)
  assert.equal(countSentences('   '), 0)
})

test('生活主題的開放題：改稿後再請 Claude 確認是對的，就算確認過；改了沒送還是待確認；第一次有錯的不會被洗掉（審核 R016）', async () => {
  const { openVerdict, withCheck } = await import('../src/lib/topics.ts')
  let o = withCheck({ help: [] }, 'good', 'I like tea. I drink it every day. It is warm.')
  assert.equal(openVerdict(o, 'I like tea. I drink it every day. It is warm.'), 'good')
  assert.equal(openVerdict(o, 'I like tea. I drink it every morning. It is warm.'), undefined, '5 分以後改了沒送：待確認')
  o = withCheck(o, 'good', 'I like tea. I drink it every morning. It is warm.')
  assert.equal(openVerdict(o, 'I like tea. I drink it every morning. It is warm.'), 'good', '改過的這一版也確認是對的')
  assert.equal(o.firstVerdict, 'good')
  assert.equal(o.checkedText, 'I like tea. I drink it every day. It is warm.', '第一次的紀錄留著')
  let w = withCheck({ help: ['cue'] }, 'again', 'I likes tea.')
  w = withCheck(w, 'good', 'I like tea.')
  assert.equal(openVerdict(w, 'I like tea.'), 'again', '第一次有錯、改對了：還是照第一次算（有提示完成），不會變成獨立完成')
  assert.deepEqual(w.help, ['cue'])
})

// R043: the retell check gets the whole dialogue, so a right detail the sample left out counts and a wrong one is caught.
test('the retell check carries the original dialogue and judges content against it', async () => {
  const { retellTask, topics } = await import('../src/lib/topics.ts')
  const t1 = topics.find(t => t.id === 't1')!
  const task = retellTask(t1)
  assert.match(task, /I just moved to Taichung\./)
  assert.match(task, /原對話/)
  assert.match(task, /不一樣的說法/)
})
