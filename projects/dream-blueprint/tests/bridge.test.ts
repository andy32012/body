import test from 'node:test'
import assert from 'node:assert/strict'
import curriculum from '../src/data/curriculum.json' with { type: 'json' }
import reading from '../src/data/reading.json' with { type: 'json' }
import writing from '../src/data/writing.json' with { type: 'json' }
import bridge from '../src/data/bridge.json' with { type: 'json' }
import {
  hasPack, heldOpen, logSkill, packFor, packInstructions, packUnits, readHeld, saveHeld, skillDays, weekCounts, type Pack,
} from '../src/lib/bridge.ts'
import { emmaLevel } from '../src/lib/cefr.ts'
import { checksFor, criteriaFor, parseGrade, rubricFor, scoredParts, suggestedStage, wordCount, type WriteStage } from '../src/lib/writing.ts'
import type { ReadPassage } from '../src/lib/reading.ts'

const packs = bridge as Pack[]
const passages = reading as ReadPassage[]
const stages = writing.stages as WriteStage[]
const bridgeStage = stages.find(s => s.pack)!

test('橋接單元：每個 BR 單元都有一包讀聽說寫，反過來也一樣', () => {
  const br = curriculum.overview.filter(o => o.stage === 'BR').map(o => o.unit)
  assert.deepEqual(packUnits, br)
  assert.deepEqual(packs.map(p => p.unit), br)
  assert.ok(br.length >= 6)
  assert.equal(packFor(10), br[0], '還沒到橋接單元：先看第一包')
  assert.equal(packFor(br[2]), br[2])
  assert.equal(packFor(999), br[br.length - 1])
  assert.equal(hasPack(47), false)
})

test('橋接單元：每一包的閱讀、回測、聽力、寫作、口說、詞塊都對得上', () => {
  const byId = new Map(passages.map(p => [p.id, p]))
  for (const p of packs) {
    const tag = 'unit ' + p.unit
    assert.equal(p.reading.length, 2, tag + ' 兩篇練習閱讀')
    for (const id of p.reading) {
      const r = byId.get(id)
      assert.ok(r && r.unit === p.unit && !r.held && r.level === 'B2', tag + ' ' + id)
    }
    const held = byId.get(p.heldReading)
    assert.ok(held && held.held === true && held.unit === p.unit, tag + ' 回測閱讀要標 held')
    assert.ok(!p.reading.includes(p.heldReading), tag + ' 回測不能是練習過的文章')
    for (const r of [...p.reading, p.heldReading].map(id => byId.get(id)!)) {
      assert.equal(r.words, wordCount(r.paras.join(' ')), r.id + ' 字數要算對')
      assert.ok(r.words >= 230 && r.words <= 430, r.id + ' B2 長度')
      for (const q of r.qs) {
        if (q.type === 'tfng') assert.deepEqual(q.options, ['True', 'False', 'Not Given'], r.id)
        if (q.evidence) assert.ok(r.paras.join(' ').includes(q.evidence), r.id + ' 證據要在文章裡')
      }
    }
    assert.ok(p.chunks.length >= 15 && p.chunks.length <= 20, tag + ' 詞塊 15–20 個')
    for (const c of p.chunks) assert.ok(c.en && c.zh && c.ex, tag + ' 詞塊要有中文和例句')
    for (const l of [...p.listen, p.heldListen]) {
      assert.ok(['en-US', 'en-GB', 'en-AU'].includes(l.accent), tag + ' 口音')
      assert.ok(l.dialogue.length >= 8 && l.dialogue.every(x => x.who && x.en && x.zh), tag + ' 對話每句都有中文')
      for (const q of l.questions) assert.ok(q.options.length === 3 && q.answer >= 0 && q.answer < 3, tag + ' ' + q.q)
    }
    assert.equal(p.heldListen.questions.length, 4, tag + ' 回測聽力 4 題')
    assert.ok(!p.listen.some(l => l.accent === p.heldListen.accent), tag + ' 回測換一種口音')
    assert.equal(p.write.length, 2)
    for (const id of p.write) {
      const t = bridgeStage.tasks.find(x => x.id === id)
      assert.ok(t && t.unit === p.unit && t.focus === p.focus, tag + ' 寫作題 ' + id)
      assert.ok(wordCount(t.sample) >= t.min, id + ' 範文要達到字數')
    }
    assert.equal(p.speak.length, 2)
    assert.ok(p.speak.every(s => s.title && s.zh && s.en), tag + ' 口說任務')
  }
  // Every bridge passage and task belongs to a pack. The two assigned writing tasks stay in each pack;
  // the expanded writing ladder also offers extra practice with that same unit and grammar focus.
  assert.deepEqual(passages.filter(p => p.unit).map(p => p.id).sort(), packs.flatMap(p => [...p.reading, p.heldReading]).sort())
  for (const task of bridgeStage.tasks) {
    const pack = packs.find(p => p.unit === task.unit)
    assert.ok(pack, task.id + ' 必須屬於既有橋接單元')
    assert.equal(task.focus, pack.focus, task.id + ' 文法必須與該單元一致')
  }
})

test('橋接寫作：不搶寫作階梯的建議，第一個評分項目寫出這一課的文法', () => {
  const done = (id: string, best: number) => [('write.' + id), JSON.stringify({ day: '2026-11-20', words: 100, tries: 1, best })]
  const all = Object.fromEntries(stages.filter(s => !s.pack).flatMap(s => s.tasks.map(t => done(t.id, s.ielts ? 7 : 5))))
  assert.equal(suggestedStage(stages, all), 'task2', '全部做完時建議還是停在 Task 2，不跳到橋接段落')
  const task = bridgeStage.tasks[0]
  const crit = criteriaFor(bridgeStage, task)
  // R048: each bridge task names its own pattern in the prompt; the first criterion checks that one, not every pattern of
  // the unit (br43a does not have to use used to). The unit's grammar stays in the hints.
  assert.equal(crit[0], '用對本題指定的句型')
  // 橋接段落照全民英檢中級英文作文給分；本題指定的句型是要求之一。
  assert.equal(rubricFor(bridgeStage).id, 'gept-essay')
  assert.deepEqual(checksFor(bridgeStage, task), crit)
  const reply = JSON.stringify({ scores: [{ name: '整篇', score: 4, reason: '符合第 4 級' }], checks: [{ name: '用對本題指定的句型', ok: true }, { name: '內容回答了題目每一點', ok: true }, { name: '句子之間接得順', ok: false }, { name: '文法和用字正確', ok: false }], next: '' })
  const graded = parseGrade(reply, rubricFor(bridgeStage), scoredParts(bridgeStage, task), crit)
  assert.equal(graded?.checks?.[0].name, crit[0])
  assert.deepEqual(graded?.checks?.map(c => c.ok), [true, true, false, false])
})

test('回測：第 6 天或上完單元才開，只記第一次', () => {
  assert.equal(heldOpen({ unit: 48, day: 5 }, 48), false)
  assert.equal(heldOpen({ unit: 48, day: 6 }, 48), true)
  assert.equal(heldOpen({ unit: 49, day: 1 }, 48), true)
  assert.equal(heldOpen({ unit: 45, day: 6 }, 48), false)
  let notes: Record<string, string> = {}
  notes = saveHeld(notes, 48, 'reading', { day: '2026-11-22', correct: 3, total: 5, picks: [0, 1, 0, 0, 1] })
  notes = saveHeld(notes, 48, 'reading', { day: '2026-11-23', correct: 5, total: 5, picks: [0, 1, 0, 0, 1] })
  assert.equal(readHeld(notes, 48).reading?.correct, 3, '第二次不會蓋掉第一次')
  notes = saveHeld(notes, 48, 'listening', { day: '2026-11-22', correct: 4, total: 4, picks: [1, 0, 1, 0], heard: true })
  assert.equal(readHeld(notes, 48).reading?.correct, 3)
  assert.equal(readHeld(notes, 48).listening?.heard, true)
  assert.deepEqual(readHeld({ 'bridge.held.49': 'oops' }, 49), {})
})

test('四技能平衡：這週每種技能做了幾天（週一開始）', () => {
  const today = '2026-11-22' // Sunday; the week starts on Monday 11-16
  let notes: Record<string, string> = {
    'read.br43-r1': JSON.stringify({ day: '2026-11-17', picks: [], correct: 4, total: 5, tries: 1 }),
    'read.a1-lin': JSON.stringify({ day: '2026-11-10', picks: [], correct: 4, total: 4, tries: 1 }),
    'write.br43a': JSON.stringify({ day: '2026-11-18', words: 110, tries: 1, best: 4 }),
  }
  notes = logSkill(notes, 'speak', '2026-11-19')
  notes = logSkill(notes, 'speak', '2026-11-19')
  notes = logSkill(notes, 'listen', '2026-11-15')
  // Shadowing in the practice library is a listening day; the one sentence shadowed inside a lesson is not.
  const sessions = [{ id: 'library-2026-11-20', day: '2026-11-20', spokenIds: ['s1'] }, { id: 'library-2026-11-21', day: '2026-11-21', spokenIds: [] },
    { id: 'abc', day: '2026-11-19', spokenIds: ['u1-d1'] }]
  assert.deepEqual(weekCounts(notes, sessions, today), { listen: 1, read: 1, speak: 1, write: 1 })
  assert.equal(skillDays(notes, sessions).listen.has('2026-11-19'), false, '課堂裡跟讀一句不算當天的聽力練習')
  assert.equal(skillDays(notes, sessions).speak.size, 1, '同一天記兩次只算一天')
  assert.equal(skillDays(notes, sessions).listen.has('2026-11-15'), true, '上週的也留著，只是不算這週')
})

test('Emma 的程度跟著每日課的階段走；口說任務告訴她這一課的文法', () => {
  assert.match(emmaLevel(5).speak, /A1–A2/)
  assert.match(emmaLevel(30).speak, /A2–B1/)
  assert.match(emmaLevel(45).speak, /B1–B2/)
  assert.match(emmaLevel(45).speak, /why/)
  assert.match(emmaLevel(54).speak, /B2–C1/)
  const p = packs.find(x => x.unit === 50)!
  const text = packInstructions(p, 0)
  assert.ok(text.includes(p.speak[0].en) && text.includes(p.focus))
})

test('交接內容：橋接單元寫出讀聽說寫包和回測的第一次成績', async () => {
  const { createInitialState } = await import('../src/lib/store.ts')
  const { handoffText } = await import('../src/lib/handoff.ts')
  const state = createInitialState('2026-11-20')
  state.curriculum = { ...state.curriculum, unit: 50, day: 6 }
  assert.match(handoffText(state, '2026-11-20'), /橋接單元.*（第 6 天開放）/)
  state.notes = saveHeld(state.notes, 50, 'reading', { day: '2026-11-20', correct: 3, total: 5, picks: [] })
  assert.match(handoffText(state, '2026-11-20'), /回測第一次成績：閱讀 3\/5/)
  state.curriculum = { ...state.curriculum, unit: 12, day: 1 }
  assert.doesNotMatch(handoffText(state, '2026-11-20'), /橋接單元，另有/)
})

test('同一篇隔天再讀（或同一題隔天再寫）：兩天都算進這週的閱讀／寫作天數', async () => {
  const { logSkill, weekCounts } = await import('../src/lib/bridge.ts')
  const { saveRead } = await import('../src/lib/reading.ts')
  // Monday 2/4, Tuesday the same passage 4/4: saved the way the reading page saves.
  let notes: Record<string, string> = {}
  notes = logSkill(saveRead(notes, 'a1-lin', { day: '2026-11-23', picks: [0, 1, 0, 0], correct: 2, total: 4 }), 'read', '2026-11-23')
  notes = logSkill(saveRead(notes, 'a1-lin', { day: '2026-11-24', picks: [0, 0, 0, 0], correct: 4, total: 4 }), 'read', '2026-11-24')
  assert.equal(weekCounts(notes, [], '2026-11-24').read, 2)
  notes = logSkill(saveRead(notes, 'a1-lin', { day: '2026-11-24', picks: [0, 0, 0, 0], correct: 4, total: 4 }), 'read', '2026-11-24')
  assert.equal(weekCounts(notes, [], '2026-11-24').read, 2, '同一天做兩次還是一天')
})

// R028: every saved listening attempt showed the answers and the transcript, so only the first attempt at a dialogue
// can count as understood by ear — also after leaving, a reload or a restored backup (the record says it was done).
test('a redo of a listening dialogue that was answered before is practice, whatever the visit', async () => {
  const { listenAttempt, withBestListen, bestListen } = await import('../src/lib/bridge.ts')
  const first = listenAttempt(null, { correct: 1, total: 3, played: true, textShown: false, plays: 1 })
  assert.equal(first.heard, true)
  const saved = withBestListen(null, { ...first, day: '2026-11-20' })
  // Came back later (new visit: nothing seen in this visit), played it fully and got 3/3: practice, not by ear.
  const redo = listenAttempt(saved, { correct: 3, total: 3, played: true, textShown: false, plays: 1 })
  assert.equal(redo.heard, false)
  const after = withBestListen(saved, { ...redo, day: '2026-11-26' })
  assert.deepEqual(bestListen(after), { day: '2026-11-20', correct: 1, total: 3, heard: true })
  // A first attempt without a confirmed full play, or with the text on screen, is not by ear either.
  assert.equal(listenAttempt(null, { correct: 3, total: 3, played: false, textShown: false, plays: 0 }).heard, false)
  assert.equal(listenAttempt(null, { correct: 3, total: 3, played: true, textShown: true, plays: 1 }).heard, false)
  // A pass that was already earned stays.
  const passed = withBestListen(null, { correct: 3, total: 3, heard: true, plays: 1, day: '2026-11-01' })
  assert.equal(bestListen(withBestListen(passed, { ...listenAttempt(passed, { correct: 0, total: 3, played: true, textShown: false, plays: 1 }), day: '2026-11-26' }))?.correct, 3)
})
